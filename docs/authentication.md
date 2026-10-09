# Autenticación y autorización

Sesiones de servidor con cookie opaca, CSRF por token sincronizado, permisos leídos de PostgreSQL en cada petición y auditoría transaccional. Implementado en `apps/api/src/auth`, `authz` y `users`; interfaz en `apps/web/src/features/auth`.

## Arquitectura

```text
Navegador ── cookie HttpOnly (identificador opaco) ──► OriginGuard ─► AuthGuard ─► PermissionsGuard ─► controlador
             cabecera X-CSRF-Token (solo escrituras)      │             │               │
                                                          │             │               └ permisos requeridos ⊆ permisos de los roles (BD)
                                                          │             └ sesión válida (BD) + CSRF + cuenta activa
                                                          └ Origin/Referer permitido + cuerpo JSON
```

Los tres guards son globales (`APP_GUARD`, en ese orden). **Denegación por defecto:** cada ruta debe declarar `@Public()`, `@Authenticated()` o `@RequirePermissions(...)`; una ruta sin política responde 403 y se registra un error.

## Decisiones

| Tema                   | Decisión                                                                                                                                                                                                                                                                                                                    | Motivo                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Estrategia             | Sesiones de servidor; el navegador solo conoce un identificador opaco en una cookie.                                                                                                                                                                                                                                        | Revocación inmediata, sin tokens autocontenidos que no se puedan invalidar; compatible con una SPA del mismo sitio. |
| Almacén                | Tabla `sessions` de PostgreSQL.                                                                                                                                                                                                                                                                                             | Sobrevive a reinicios y sirve a varias instancias. No se usa memoria.                                               |
| Identificador          | 32 bytes de `crypto.randomBytes` (256 bits) en base64url. En BD solo se guarda su **SHA-256**.                                                                                                                                                                                                                              | Una filtración de la BD no permite suplantar sesiones. No hay criptografía propia: solo CSPRNG y SHA-256.           |
| Rotación               | Cada login crea una sesión nueva; si la petición traía una cookie previa, esa sesión se revoca (`reemplazada`). No existen sesiones anónimas ni identificadores aceptados del cliente.                                                                                                                                      | Evita fijación de sesión.                                                                                           |
| Caducidad              | Inactividad 60 min (`SESSION_IDLE_MINUTES`) y absoluta 12 h (`SESSION_ABSOLUTE_HOURS`). La actividad renueva la inactividad (se anota como máximo cada minuto) pero nunca la caducidad absoluta.                                                                                                                            | Valores iniciales conservadores; **pendiente de confirmar con la Liga**.                                            |
| Revocación             | Cierre de sesión; el usuario revoca una sesión propia; un administrador revoca todas las de un usuario; una cuenta que pasa a `inactivo`/`bloqueado` pierde todas sus sesiones en la misma transacción. Además, `authenticate` rechaza (y revoca) cualquier sesión de una cuenta no activa.                                 | Una sesión cerrada o de una cuenta desactivada no puede reutilizarse, ni siquiera con la cookie original.           |
| Contraseñas            | **Argon2id** (`@node-rs/argon2` 2.2.2): 19 MiB, 2 iteraciones, 1 hilo (mínimo OWASP), sal aleatoria. Política: 12–128 caracteres, sin reglas de composición (NIST 800‑63B).                                                                                                                                                 | Algoritmo moderno resistente a GPU. El máximo acota el coste de un login.                                           |
| Enumeración de cuentas | Cuenta inexistente, contraseña errónea y cuenta no activa devuelven el **mismo** 401 y se verifica siempre un hash (ficticio si no hay cuenta) para igualar tiempos.                                                                                                                                                        | No revelar qué correos existen.                                                                                     |
| CSRF                   | Token por sesión (`csrf_token`, 256 bits) entregado en el login y en `GET /auth/session`; el frontend lo devuelve en `X-CSRF-Token` en toda operación que no sea GET/HEAD/OPTIONS (comparación en tiempo constante). **Más** validación de `Origin`/`Referer` y exigencia de `application/json`, **más** `SameSite=Strict`. | Defensa en profundidad: no depende solo de `SameSite`.                                                              |
| Cookie                 | Ver tabla siguiente.                                                                                                                                                                                                                                                                                                        |                                                                                                                     |
| CORS                   | Solo los orígenes de `WEB_ORIGIN`, con credenciales y cabeceras `Content-Type`/`X-CSRF-Token`.                                                                                                                                                                                                                              |                                                                                                                     |
| Intentos               | Contadores en PostgreSQL (`login_failures`) con ventana deslizante. Ver «Limitación de intentos».                                                                                                                                                                                                                           | Sobreviven a reinicios y se comparten entre instancias.                                                             |
| Permisos               | Se leen de `user_roles → role_permissions → permissions` **en cada petición**; sin caché.                                                                                                                                                                                                                                   | Un cambio de roles o permisos aplica en la siguiente petición.                                                      |
| Auditoría              | Operaciones exitosas: se auditan **en la misma transacción** (si falla la auditoría, se revierte la operación). Denegaciones (login fallido): mejor esfuerzo, el error se registra en el log y no cambia la respuesta.                                                                                                      | Ver «Auditoría».                                                                                                    |

### Cookie de sesión

| Atributo   | Desarrollo / pruebas                                                               | Producción (`NODE_ENV=production`)     |
| ---------- | ---------------------------------------------------------------------------------- | -------------------------------------- |
| Nombre     | `liga_sid`                                                                         | `__Host-liga_sid`                      |
| `HttpOnly` | sí                                                                                 | sí                                     |
| `Secure`   | no (HTTP local)                                                                    | **sí** (HTTPS obligatorio)             |
| `SameSite` | `Strict`                                                                           | `Strict`                               |
| `Path`     | `/`                                                                                | `/` (requerido por `__Host-`)          |
| `Domain`   | no se define                                                                       | no se define (requerido por `__Host-`) |
| Duración   | cookie de sesión del navegador (sin `Max-Age`); la caducidad la impone el servidor | igual                                  |

`SameSite=Strict` exige que web y API estén en el **mismo sitio** (mismo dominio registrable, p. ej. `liga.example` y `liga.example/api`, o subdominios). Con dominios distintos habría que revisar esta decisión. El borrado de la cookie (logout, sesión inválida) usa exactamente los mismos atributos. Con `NODE_ENV=production` la API también exige orígenes `https://` en `WEB_ORIGIN` y no publica `/api/docs`.

### Limitación de intentos

Solo cuentan los intentos **fallidos**. Cada fallo registra tres claves (hash con clave de `SECURITY_HASH_KEY`, nunca IP ni correo en claro):

| Clave       | Límite por defecto | Variable                            | Para qué sirve                                                                                                |
| ----------- | ------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| IP          | 30                 | `LOGIN_MAX_FAILURES_PER_IP`         | Barrido de muchas cuentas desde un origen.                                                                    |
| Cuenta + IP | 5                  | `LOGIN_MAX_FAILURES_PER_ACCOUNT_IP` | Adivinar una contraseña desde un origen, sin que un tercero deje fuera al titular (que usa otra IP).          |
| Cuenta      | 50                 | `LOGIN_MAX_FAILURES_PER_ACCOUNT`    | Ataques distribuidos. Umbral alto porque es la única clave con la que un atacante podría molestar al titular. |

Ventana: `LOGIN_WINDOW_MINUTES` (15). Al superar un límite el login responde **429** con `Retry-After`, incluso si la contraseña es correcta. **No hay bloqueo permanente**: el bloqueo se levanta cuando los fallos salen de la ventana. El bloqueo se audita una sola vez (`auth.login_throttled`), no en cada rechazo. Si no se puede anotar un fallo, el login falla (cierra en falso). Una tarea horaria depura registros antiguos.

**IP real:** detrás de un proxy inverso debe fijarse `TRUST_PROXY` con el número de saltos de confianza (p. ej. `1`); si no, Express usa la IP del proxy (todos los clientes compartirían contador) y, si se confiara de más, `X-Forwarded-For` sería falsificable. Sin proxy, dejar `0`.

## Variables de entorno

| Variable                                                         | Defecto                 | Descripción                                                                                                                                                                          |
| ---------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SECURITY_HASH_KEY`                                              | — (obligatoria)         | ≥ 32 caracteres. Secreto para hashes con clave. Rechaza el valor de ejemplo. Rotarla invalida los contadores de intentos y los `ip_hash` nuevos dejan de coincidir con los antiguos. |
| `TRUST_PROXY`                                                    | `0`                     | Saltos de proxy de confianza.                                                                                                                                                        |
| `SESSION_IDLE_MINUTES`                                           | `60`                    | Inactividad máxima.                                                                                                                                                                  |
| `SESSION_ABSOLUTE_HOURS`                                         | `12`                    | Duración máxima.                                                                                                                                                                     |
| `LOGIN_WINDOW_MINUTES`                                           | `15`                    | Ventana de conteo.                                                                                                                                                                   |
| `LOGIN_MAX_FAILURES_PER_IP` / `_PER_ACCOUNT_IP` / `_PER_ACCOUNT` | `30` / `5` / `50`       | Límites.                                                                                                                                                                             |
| `WEB_ORIGIN`                                                     | `http://localhost:5173` | Orígenes permitidos (CORS y validación de origen). En producción deben ser `https`.                                                                                                  |

Generar la clave: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

## Configuración local

1. `cp .env.example .env` y reemplazar `cambiar-…` (contraseña de PostgreSQL y `SECURITY_HASH_KEY`).
2. `docker compose up -d db`, `npm run db:deploy -w @liga/api`, `npm run db:seed -w @liga/api`.
3. Crear el primer superadministrador (ver abajo).
4. `npm run dev:api` y `npm run dev:web` → `http://localhost:5173`. Vite reenvía `/api` a la API (`API_PORT`), de modo que navegador y API comparten origen y la cookie `SameSite=Strict` funciona sin configuración adicional.

### Cómo debe llamar el frontend

- Todas las peticiones con `credentials: 'include'` (ya lo hace `src/api/client.ts`).
- Guardar el `csrfToken` que devuelven `POST /auth/login` y `GET /auth/session` **solo en memoria** (nunca `localStorage`/`sessionStorage`) y enviarlo como `X-CSRF-Token` en POST/PUT/PATCH/DELETE.
- Enviar cuerpos como `application/json`. Los formularios clásicos (`urlencoded`, `multipart`) reciben 415; si más adelante se suben archivos, esa ruta necesitará una excepción explícita y su propia defensa.
- Tras recargar la página, consultar `GET /auth/session`: 200 trae usuario, permisos y un token CSRF nuevo; 401 significa sin sesión.
- Un 401 en una petición autenticada = sesión expirada o revocada → volver al login.
- El navegador debe llamar a la API con el `Origin` configurado en `WEB_ORIGIN`.

## Endpoints

| Método y ruta                          | Política           | Notas                                                                                                                        |
| -------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/login`                 | pública            | Cuerpo `{email, password}`. 200 + cookie + `{user, permissions, csrfToken, expiresAt}`; 401 genérico; 429 con `Retry-After`. |
| `GET /api/auth/session`                | autenticada        | Sesión y usuario actuales (401 si no vigente).                                                                               |
| `POST /api/auth/logout`                | autenticada + CSRF | 204; revoca en servidor y borra la cookie.                                                                                   |
| `GET /api/auth/sessions`               | autenticada        | Sesiones vigentes propias (sin identificadores secretos).                                                                    |
| `DELETE /api/auth/sessions/:id`        | autenticada + CSRF | Revoca una sesión **propia** (otra persona → 404).                                                                           |
| `PATCH /api/users/:id/status`          | `users:update`     | `{status, reason}`. Al desactivar/bloquear revoca todas sus sesiones.                                                        |
| `POST /api/users/:id/sessions/revoke`  | `users:update`     | `{reason}`. Cierra todas las sesiones del usuario.                                                                           |
| `PUT /api/users/:id/roles/:roleId`     | `roles:manage`     | Asigna un rol.                                                                                                               |
| `DELETE /api/users/:id/roles/:roleId`  | `roles:manage`     | Retira un rol.                                                                                                               |
| `GET /api/roles`                       | `roles:read`       | Roles y sus permisos.                                                                                                        |
| `GET /api/health`, `/api/health/ready` | pública            | Sin datos sensibles.                                                                                                         |

Reglas de seguridad adicionales de la administración: nadie cambia su **propio** estado ni sus **propios** roles; solo se asigna o retira un rol cuyos permisos el actor posee todos (evita autoescalada y que un administrador parcial cree o elimine superadministradores); nunca puede quedar el sistema sin un superadministrador **activo** (los cambios se serializan con un bloqueo asesor de PostgreSQL).

Permisos del catálogo (`src/authz/permissions.ts`): `users:read|create|update`, `roles:read|manage`, `audit:read`, `sports|categories|seasons:read|manage`. Los usados hoy por rutas son `users:update`, `roles:manage` y `roles:read`; el resto está reservado para los módulos siguientes. Un usuario nuevo **no tiene ningún rol**. Solo `superadmin` (rol de sistema) recibe todos los permisos; la matriz real de roles institucionales debe aprobarla la Liga.

## Primer superadministrador

No existe ningún endpoint para esto. Es una CLI que solo puede ejecutar quien tenga acceso al servidor y a la base de datos:

```bash
npm run db:deploy -w @liga/api
npm run admin:create-superadmin -w @liga/api
```

Pide correo, nombre y contraseña (esta última con entrada oculta y confirmación). Alternativas no interactivas: `--email=…` y `BOOTSTRAP_ADMIN_NAME` / `BOOTSTRAP_ADMIN_PASSWORD` como variables de entorno **solo para esa ejecución** (la contraseña nunca se acepta por argumentos, que quedarían en el historial y en `ps`). En Windows, un `--name` con espacios se rompe en `cmd.exe`: use el modo interactivo o `BOOTSTRAP_ADMIN_NAME`.

Comportamiento: sincroniza permisos y rol `superadmin` (idempotente), valida entradas (correo válido, contraseña 12–128 y sin contener el usuario del correo), guarda solo el hash Argon2id y registra `auth.bootstrap_superadmin` en auditoría, todo en una transacción. **Se niega a ejecutarse si ya existe cualquier usuario con el rol `superadmin`** (activo o no) y serializa ejecuciones concurrentes, así que no sirve para crear administradores adicionales: los siguientes se crean con un superadministrador existente. No hay credenciales por defecto ni la contraseña aparece en logs o auditoría. Recuperación: si se perdiera el acceso de todos los superadministradores, el operador con acceso a la base de datos debe retirar el rol a nivel de BD, tras lo cual el comando vuelve a estar disponible; es una acción deliberada y auditable fuera de la aplicación.

## Auditoría

| Acción                                    | Cuándo                     | Actor             | Notas                                                                                                                                     |
| ----------------------------------------- | -------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.login`                              | Login correcto             | usuario           | Entidad: sesión (id de fila, no el secreto).                                                                                              |
| `auth.login_failed`                       | Login fallido              | usuario si existe | `reason` interno (`cuenta_inexistente`, `contrasena_incorrecta`, `cuenta_no_activa`) y hash del correo; nunca el correo ni la contraseña. |
| `auth.login_throttled`                    | Un límite se alcanza       | usuario si existe | Una vez por ventana y ámbito.                                                                                                             |
| `auth.logout`, `auth.session_revoked`     | Cierre / revocación propia | usuario           |                                                                                                                                           |
| `auth.sessions_revoked_by_admin`          | Revocación administrativa  | administrador     | Con motivo y nº de sesiones.                                                                                                              |
| `user.status_change`                      | Cambio de estado           | administrador     | Antes/después, motivo, sesiones revocadas.                                                                                                |
| `user.role_assigned`, `user.role_removed` | Cambio de roles            | administrador     | Rol afectado.                                                                                                                             |
| `auth.bootstrap_superadmin`               | CLI de bootstrap           | —                 | Correo y rol.                                                                                                                             |

`ip_hash` es un HMAC de la IP con `SECURITY_HASH_KEY`. **Política de errores:** una operación exitosa y su registro son atómicos (si la auditoría falla, la operación no ocurre: 500 sin detalles); los rechazos se auditan en mejor esfuerzo, y si el registro falla se escribe un error en el log del servidor sin alterar la respuesta. El contador de intentos fallidos no es opcional: si no puede anotarse, el login falla. Ningún registro contiene contraseñas, hashes, cookies, tokens de sesión ni tokens CSRF (verificado por pruebas sobre auditoría, respuestas y logs).

## Pruebas

```bash
npm test                    # unitarias (API y web)
npm run test:integration    # API contra PostgreSQL *_test aislado
npm run verify              # formato, lint, tipos, unitarias, integración y build
```

Cobertura relevante (`apps/api/test/auth`): login correcto/incorrecto/inexistente/inactivo; sesión creada y recuperada; rotación; logout y revocación; expiración absoluta e inactividad; atributos de la cookie en desarrollo y producción; rechazo sin sesión (401) y sin permiso (403); permisos otorgados y retirados con efecto inmediato; denegación por defecto; CSRF y validación de origen; CORS; limitación de intentos (incluido el reinicio de la aplicación y el bloqueo temporal); administración y prevención de escalada; bootstrap (único, concurrente, validaciones, sin vías HTTP); auditoría de cada evento; fallo cerrado ante errores de auditoría; ausencia de secretos en respuestas, auditoría y logs capturados. Además se verificaron con **pruebas de mutación manuales** (deshabilitar CSRF, aceptar sesiones revocadas o de cuentas inactivas, omitir permisos, origen, contraseña, límites, unicidad del bootstrap, regla de escalada y `SameSite`) que la suite detecta cada fallo.

## Limitaciones conocidas y pendientes

- **Sin segundo factor (MFA)** ni cambio/recuperación de contraseña: pendientes. Al implementarlos, el cambio de contraseña debe revocar las demás sesiones. Los hashes no se re‑calculan automáticamente si cambian los parámetros de Argon2id.
- **Solo el login tiene limitación de intentos.** No hay límite general por endpoint; se recomienda complementarlo en el proxy inverso (p. ej. `limit_req`). Dentro de la API se evaluará un limitador global al exponer el portal público.
- El límite **por cuenta** (50 fallos/15 min) puede, en un ataque distribuido, impedir temporalmente los accesos a esa cuenta; es un compromiso explícito frente a un bloqueo permanente.
- El token CSRF se guarda en claro en `sessions.csrf_token`; solo sirve junto con la cookie de sesión (cuyo hash es lo único almacenado de ella).
- Se guarda el `User-Agent` (truncado a 255) para que el usuario reconozca sus sesiones; es un dato personal menor y no se muestra a terceros.
- Clientes que no son navegadores y no envían `Origin`/`Referer` superan la comprobación de origen, pero siguen necesitando cookie y token CSRF válidos.
- Si el cierre de sesión falla por red, la interfaz cierra la sesión local; la del servidor caduca por inactividad (o puede revocarse desde otra sesión).
- La depuración horaria corre dentro de cada instancia de la API (es idempotente).
- Aún no existen endpoints para crear usuarios, crear roles ni editar los permisos de un rol (módulo de usuarios y roles).
- Pendiente con la Liga: duraciones de sesión, política de contraseñas, si los administradores requieren MFA, y la matriz real de roles.
