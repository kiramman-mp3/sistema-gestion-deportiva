# Administración de usuarios, roles, permisos, contraseñas y auditoría

Implementado en `apps/api/src/users`, `authz`, `auth` y `audit`; interfaz en `apps/web/src/features/admin`. Complementa `authentication.md` (sesiones, CSRF, intentos) y `catalogs.md`.

## Modelo de delegación (protección contra escalada de privilegios)

**Principio:** nadie puede conceder, retirar ni gestionar más de lo que posee. El _conjunto delegable_ de un actor son **sus propios permisos efectivos** (unión de los permisos de todos sus roles), leídos de la base de datos **dentro de la misma transacción** que la operación y **después** de tomar un bloqueo asesor de PostgreSQL (`liga:privilege-changes`) que serializa todas las operaciones que cambian privilegios. Así dos cambios concurrentes se evalúan uno tras otro, cada uno sobre el estado que dejó el anterior.

No basta con tener `roles:manage`: ese permiso habilita las rutas, pero cada operación aplica además estas reglas en el backend (`PrivilegesService`):

| Operación                                                  | Permiso de ruta | Reglas adicionales (todas obligatorias)                                                                                                                                                                                                                                          |
| ---------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crear rol                                                  | `roles:manage`  | Todos los permisos iniciales deben ser del actor. El rol nunca es «de sistema». Los códigos se validan contra el catálogo del backend.                                                                                                                                           |
| Editar nombre/descripción                                  | `roles:manage`  | El rol no es de sistema.                                                                                                                                                                                                                                                         |
| **Editar permisos de un rol**                              | `roles:manage`  | El rol no es de sistema · el actor **no tiene asignado** ese rol · el actor posee **todos los permisos actuales y todos los nuevos** (no puede conceder ni retirar lo que no tiene) · códigos válidos.                                                                           |
| Asignar rol a un usuario                                   | `roles:manage`  | El actor no es el objetivo · el actor posee todos los permisos del rol.                                                                                                                                                                                                          |
| Retirar rol                                                | `roles:manage`  | Igual, más: el actor posee todos los permisos del **objetivo** · no se retira el rol `superadmin` al último superadministrador activo.                                                                                                                                           |
| Editar datos, cambiar estado, generar enlace de contraseña | `users:update`  | El actor no es el objetivo · el actor posee todos los permisos del **objetivo** («no se gestiona una cuenta con más privilegios que la propia») · activar exige que la cuenta ya tenga contraseña · desactivar/bloquear no puede dejar el sistema sin superadministrador activo. |
| Cerrar sesiones de un usuario                              | `users:update`  | Mismo criterio sobre el objetivo (cerrar las propias está permitido).                                                                                                                                                                                                            |

### Análisis de interacciones

- **`roles:manage` + `users:update`:** sin la regla del objetivo, un administrador parcial podría tomar una cuenta de superadministrador (cambiar su correo o generar un enlace de restablecimiento y canjearlo). La regla «actor ⊇ objetivo» lo impide por cualquiera de esas vías.
- **Crear un rol y asignárselo a otro (cómplice):** el rol solo puede contener permisos del actor, y el cómplice no puede delegar más que lo que recibió (probado). Nadie se asigna roles a sí mismo ni edita un rol que él mismo tiene.
- **Permisos de catálogo y de módulos futuros:** cualquier permiso nuevo del catálogo (`src/authz/permissions.ts`) queda sujeto a las mismas reglas sin tocar el código; solo `superadmin` lo recibe por defecto, vía `db:seed`.
- **Efecto inmediato:** los permisos se leen de la base de datos en cada petición; modificar un rol, quitarlo o desactivar la cuenta surte efecto en la siguiente petición sin cerrar sesión.
- **Pares:** dos cuentas con permisos equivalentes pueden gestionarse mutuamente (p. ej. dos superadministradores). Es intencional; la protección del último superadministrador evita el bloqueo del sistema.

### Limitaciones del modelo

- No existe una marca de «permiso no delegable»: quien posee `roles:manage` puede delegarlo. Si la Liga necesita permisos de uso personal que no se puedan transmitir, habría que añadir esa marca al catálogo (decisión pendiente).
- Un administrador que posea **todos** los permisos sin el rol `superadmin` tiene, de hecho, la misma autoridad (salvo editar roles de sistema, imposible para cualquiera).
- Los roles no pueden eliminarse desde la interfaz (no se pidió); un rol sin usuarios queda inerte.

## Roles de sistema y roles configurables

|                    | De sistema                                                                              | Configurable                                               |
| ------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Quién lo crea      | `db:seed` (`superadmin`)                                                                | Un administrador con `roles:manage`, desde la interfaz/API |
| `is_system`        | `true`                                                                                  | `false` (siempre; la API no lo acepta como entrada)        |
| Permisos           | Todos los del catálogo; los **sincroniza el seed** (añade nuevos, retira los obsoletos) | Los fija el administrador, dentro de su conjunto delegable |
| Edición por la API | **Prohibida para todos**, incluido un superadministrador (403)                          | Nombre, descripción y permisos                             |
| Eliminación        | Bloqueada por un trigger de la base de datos                                            | No hay endpoint de borrado                                 |

El seed (`npm run db:seed`) no toca los roles configurables ni sus permisos. Si se retira un permiso del código, el seed lo elimina del catálogo y de todos los roles.

## Usuarios y estados de cuenta

Estados: `pendiente` (creada, sin contraseña), `activo`, `inactivo`, `bloqueado`. Reglas de integridad en la base de datos: una cuenta **activa siempre tiene contraseña** y una **pendiente nunca la tiene** (CHECK). El hash de contraseña nunca sale de la API.

- **Alta** (`POST /api/users`, `users:create`): crea la cuenta _pendiente_, **sin contraseña, sin roles y sin permisos**; no admite campos de estado, roles ni contraseña. Devuelve **una sola vez** un enlace de activación.
- **Edición** (`PATCH /api/users/:id`): solo `displayName` y `email` (normalizado; duplicado → 409). Cambiar el correo anula los enlaces pendientes. Auditado con antes/después.
- **Estado** (`PATCH /api/users/:id/status`, motivo obligatorio): al desactivar o bloquear se revocan **todas las sesiones y los enlaces pendientes** en la misma transacción. Una cuenta pendiente solo puede cancelarse (→ `inactivo`); nunca activarse sin contraseña.
- **Sesiones:** listar (`users:read`), cerrar una o todas (`users:update`, con motivo).

## Contraseñas

Política (sin cambios respecto a la fase anterior): 12–128 caracteres, sin reglas de composición, Argon2id; **se añade** a todos los flujos la regla que ya aplicaba el bootstrap: la contraseña no puede contener el nombre de usuario del correo (si tiene 4 o más caracteres).

| Flujo                                                | Cómo funciona                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Activación**                                       | El administrador crea la cuenta y recibe un enlace de un solo uso (`#/activar/<token>`). El titular lo abre y fija **su** contraseña; el administrador nunca la conoce.                                                                                                                                                                                                    |
| **Restablecimiento (asistido)**                      | Un administrador autorizado genera un enlace (`#/restablecer/<token>`) y se lo entrega al titular. Al canjearlo se fija la contraseña y se **revocan todas las sesiones** de la cuenta.                                                                                                                                                                                    |
| **Cambio propio** (`POST /api/auth/password/change`) | Exige la contraseña actual (los intentos fallidos cuentan en el mismo límite que el login, por si hay una sesión robada), la nueva debe ser distinta de la actual y cumplir la política. Revoca **las demás sesiones** y los enlaces pendientes; la sesión actual se conserva. Una contraseña actual incorrecta responde 400 (no 401, que significaría «sesión expirada»). |

Los **enlaces** (`credential_tokens`): 256 bits aleatorios (`crypto.randomBytes`), solo se guarda su SHA-256; vigencia `CREDENTIAL_LINK_TTL_HOURS` (24 h por defecto); **un solo uso** (el canje es un `UPDATE` condicional atómico: de varios canjes simultáneos solo uno prospera); un enlace nuevo anula el anterior; se anulan al desactivar la cuenta, al cambiar el correo y al cambiar la contraseña. Cualquier fallo (inexistente, usado, anulado, vencido, cuenta en estado no válido, tipo de enlace que no corresponde) produce la **misma respuesta 400**. Los canjes fallidos se limitan por IP (mismo umbral que el login, contador independiente, 429 con `Retry-After`). Un rechazo por política de contraseña deshace la transacción y deja el enlace sin usar.

El token viaja en el **fragmento** de la URL (`#…`), que el navegador no envía al servidor ni en `Referer`; la interfaz lo lee una vez, lo **borra de la dirección** y nunca lo guarda en almacenamiento. Tampoco aparece en la auditoría (solo tipo y vencimiento), en logs ni en la base de datos en claro.

### Recuperación de contraseña autoservicio: **bloqueada, no implementada**

No existe infraestructura de correo (ni SMTP, ni proveedor, ni dominio de envío), así que **no hay forma segura de entregar un enlace al titular sin intervención de un administrador**. Por eso no se publica ninguna ruta «olvidé mi contraseña» (no se simula el flujo, y una respuesta «te hemos enviado un correo» sería falsa). Está probado que tales rutas no existen. Queda lista la parte reutilizable: tabla de tokens, canje atómico con límite por IP, revocación de sesiones y auditoría. Para habilitarla hacen falta decisiones y recursos de la Liga: proveedor de correo y remitente verificado, plantilla del mensaje, y una ruta pública que responda siempre igual (exista o no la cuenta), con límite por correo e IP.

## Auditoría consultable

`GET /api/audit-logs` exige `audit:read`. Es **solo lectura**: no hay rutas para modificar o borrar (probado) y la base de datos sigue impidiéndolo con un trigger.

- Filtros: `from`, `to` (fecha `AAAA-MM-DD`, que abarca el día completo en `to`, o instante ISO 8601), `userId`, `actor` (texto en correo o nombre, literal), `action` (exacta), `entityType`, `entityId`; paginación `page`/`pageSize` (≤ 100).
- Orden estable: `createdAt` descendente y `id` (UUID v7) para desempatar; la paginación no repite ni omite registros aunque compartan instante.
- Cada registro: id, momento, acción, actor (id, correo, nombre), entidad, motivo, y valores antes/después **saneados**. No se expone el hash de IP.
- **Saneado:** se enmascara (`[oculto]`) cualquier campo cuyo nombre sugiera un secreto (`pass`, `secret`, `token`, `hash`, `cookie`, `csrf`, `authorization`, `credential`, `api key`) y cualquier valor con forma de hash Argon2/bcrypt, SHA-256 o token de 43 caracteres, aunque un registro antiguo lo contenga por error. Los contadores (`revokedSessions`) y los códigos de permiso se muestran.

Eventos nuevos: `user.create`, `user.update`, `user.credential_link_issued`, `auth.session_revoked_by_admin`, `role.create`, `role.update`, `role.permissions_update` (antes, después, añadidos, retirados y nº de usuarios afectados), `auth.password_changed`, `auth.password_change_failed`, `auth.account_activated`, `auth.password_reset_completed`. Las operaciones exitosas se auditan en la **misma transacción** (si la auditoría falla, la operación no ocurre).

## Endpoints

Todos bajo `/api`, con sesión; las escrituras exigen CSRF.

| Método y ruta                                                                    | Permiso         | Descripción                                                                   |
| -------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------- |
| `GET /users`, `GET /users/:id`                                                   | `users:read`    | Listado paginado (`q`, `status`, `roleId`) y detalle, con roles.              |
| `POST /users`                                                                    | `users:create`  | Alta pendiente + enlace de activación (una vez).                              |
| `PATCH /users/:id`                                                               | `users:update`  | `displayName`, `email`.                                                       |
| `PATCH /users/:id/status`                                                        | `users:update`  | `{status: activo\|inactivo\|bloqueado, reason}`.                              |
| `POST /users/:id/credential-link`                                                | `users:update`  | Enlace de activación (cuenta pendiente) o restablecimiento (activa), una vez. |
| `GET /users/:id/sessions`                                                        | `users:read`    | Sesiones activas (sin secretos).                                              |
| `POST /users/:id/sessions/revoke` · `POST /users/:id/sessions/:sessionId/revoke` | `users:update`  | `{reason}`.                                                                   |
| `PUT/DELETE /users/:id/roles/:roleId`                                            | `roles:manage`  | Asignar / retirar rol.                                                        |
| `GET /permissions`                                                               | `roles:read`    | Catálogo con módulo y acción (para agrupar).                                  |
| `GET /roles`, `GET /roles/:id`                                                   | `roles:read`    | Roles con permisos y nº de usuarios.                                          |
| `POST /roles`                                                                    | `roles:manage`  | `{code, name, description?, permissions?}`.                                   |
| `PATCH /roles/:id`                                                               | `roles:manage`  | `{name?, description?}`.                                                      |
| `PUT /roles/:id/permissions`                                                     | `roles:manage`  | `{permissions: [...]}` reemplaza el conjunto.                                 |
| `POST /auth/password/change`                                                     | sesión          | `{currentPassword, newPassword}`.                                             |
| `POST /auth/password/complete`                                                   | pública (token) | `{token, password}` → 204.                                                    |
| `GET /audit-logs`                                                                | `audit:read`    | Consulta filtrada.                                                            |

## Interfaz

Secciones nuevas (visibles solo con el permiso de lectura; «Mi cuenta» para todos): **Usuarios** (`#/usuarios`, detalle `#/usuarios/<id>`), **Roles y permisos** (`#/roles`, `#/roles/<id>`), **Auditoría**, **Mi cuenta** (cambio de contraseña) y la ruta pública de enlaces. Mismo patrón que los catálogos: estados de carga, error con reintento y vacío; tablas que se apilan en pantallas estrechas; diálogos de confirmación accesibles con motivo; avisos de éxito y error; sesión expirada → pantalla de acceso.

- El editor de permisos agrupa por módulo con el catálogo del backend, explica que _consultar_, _gestionar_ y _eliminar_ son capacidades distintas, **deshabilita los permisos que el usuario no posee**, bloquea la edición de roles de sistema y de roles con permisos que no posee, y antes de guardar muestra cuántos usuarios se verán afectados y qué se añade/retira. El servidor vuelve a comprobar todo.
- Ninguna contraseña ni token se guarda en `localStorage`/`sessionStorage`; los campos de contraseña se vacían tras cada envío; el enlace de un solo uso se muestra una vez, en memoria.

## Pruebas

`apps/api/test/users` (usuarios, roles, escalada, contraseñas, auditoría) y `test/database/credentials.int-spec.ts`; `apps/web/src/features/admin/admin.spec.tsx`. Además de los casos funcionales, se incluyen **ataques indirectos de escalada** (rol con permisos ajenos, edición de un rol propio, cómplice con rol delegado, toma de cuenta de un superadministrador por enlace/correo/estado/sesiones, retirada de rol a un usuario más privilegiado) y **concurrencia** (último superadministrador, doble canje de un enlace, un permiso que el actor pierde mientras lo delega — verificado con el orden real de las transacciones en la auditoría). Se comprobaron con mutaciones manuales (quitar el bloqueo de privilegios, la regla «actor ⊇ rol», «actor ⊇ objetivo», la protección de roles de sistema, el uso único y el vencimiento de los enlaces, la revocación de sesiones, el saneado y el permiso `audit:read`, entre otras) que la suite detecta cada fallo.

## Pendientes y decisiones de la Liga

- Proveedor de correo para habilitar la recuperación autoservicio (ver arriba) y vigencia de los enlaces.
- ¿Debe existir un permiso «no delegable»? ¿Debe poder eliminarse un rol? ¿Quién crea roles institucionales (la matriz real está pendiente)?
- Segundo factor (MFA) para administradores; rotación del identificador de la sesión actual al cambiar la contraseña (hoy se conserva la sesión actual y se cierran las demás).
- La consulta de auditoría no se audita a sí misma; usa paginación por desplazamiento (suficiente para el volumen esperado).
