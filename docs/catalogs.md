# Catálogos administrativos: deportes, categorías y temporadas

API en `apps/api/src/catalogs` e interfaz en `apps/web/src/features/catalogs`. **No requirió cambios de esquema ni migraciones nuevas:** reutiliza las tablas `sports`, `categories` y `seasons` y sus restricciones (ver `database.md`).

## Reglas comunes

- **Autorización en el backend** por permisos (`@RequirePermissions`); la interfaz solo oculta controles. Escrituras con sesión + token CSRF (ver `authentication.md`).
- **Cada escritura y su auditoría van en una sola transacción:** si la auditoría falla, la operación se revierte (500 genérico). Acciones: `<entidad>.create | update | status_change | delete` con actor, entidad, valores antes/después, motivo (si lo hay) y hash de IP. Una edición sin cambios reales no escribe ni audita.
- **Validación** con zod en el servidor (mensajes en español, errores por campo, `strict`: se rechazan campos desconocidos como `id`, `status` o `createdAt`). El `code` es **inmutable** una vez creado.
- **Duplicados:** además de los índices únicos de `code` y `name`, el servicio rechaza nombres que solo difieren en mayúsculas o espacios (`Fútbol` = `FÚTBOL` = `fútbol`). Respuesta 409 con mensaje por campo.
- **Desactivar en lugar de borrar.** `PATCH /:id/status` conserva el registro e historial. El borrado físico solo prospera si nada lo referencia: las claves foráneas de los módulos futuros serán `ON DELETE RESTRICT` y la base de datos devuelve el error, que la API convierte en 409 («está en uso… desactívelo en su lugar»). Hoy ninguna tabla los referencia; la protección se verifica con una tabla temporal con FK real en las pruebas.
- **Listados** paginados (`page` ≥ 1, `pageSize` 1–100, por defecto 20) con `q` (nombre o código, sin distinguir mayúsculas; `%`, `_` y `\` se buscan literalmente) y `status`. Respuesta `{ items, page, pageSize, total }`.
- Errores consistentes: 400 (`{message:'Solicitud inválida', errors:[{field,message}]}`), 401, 403, 404, 409. Los errores inesperados devuelven 500 sin detalles; el detalle queda en el log del servidor.

## Permisos

Convención del proyecto: `<recurso>:read` y `<recurso>:manage` (crear, editar y cambiar estado). Se **añadió** `<recurso>:delete`, separado porque eliminar es más grave que gestionar. Los permisos `*:create`/`*:update` de la lista de referencia no se crearon: `manage` ya cubre esas operaciones.

| Permiso                                                | Operaciones                               |
| ------------------------------------------------------ | ----------------------------------------- |
| `sports:read`, `categories:read`, `seasons:read`       | `GET` de listado y detalle                |
| `sports:manage`, `categories:manage`, `seasons:manage` | `POST`, `PATCH /:id`, `PATCH /:id/status` |
| `sports:delete`, `categories:delete`, `seasons:delete` | `DELETE /:id`                             |

Cada permiso es independiente (leer no permite gestionar; gestionar no permite eliminar; los de un catálogo no sirven en otro). El seed (`npm run db:seed`) sincroniza el catálogo de permisos de forma idempotente y, según la política existente, solo el rol de sistema **`superadmin`** recibe todos; **ningún otro rol ni usuario recibe permisos de catálogo automáticamente**. Para delegar, un superadministrador debe crear un rol con los permisos deseados y asignarlo (`PUT /api/users/:id/roles/:roleId`); la asignación de roles con permisos propios aún no tiene pantalla (ver pendientes). La matriz institucional real debe aprobarla la Liga.

## Endpoints

Base `/api`. Todos requieren sesión.

| Método y ruta                                            | Permiso                                   | Descripción                                                                                |
| -------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /sports`, `/categories`, `/seasons`                 | `*:read`                                  | Listado paginado con `q`, `status`.                                                        |
| `GET /sports/:id` (y análogas)                           | `*:read`                                  | Detalle; 404 si no existe, 400 si el id no es UUID.                                        |
| `POST /sports`                                           | `sports:manage`                           | `{code, name}` → 201.                                                                      |
| `PATCH /sports/:id`                                      | `sports:manage`                           | `{name}`.                                                                                  |
| `PATCH /sports/:id/status`                               | `sports:manage`                           | `{status: activo\|inactivo, reason?}`.                                                     |
| `DELETE /sports/:id`                                     | `sports:delete`                           | 204; 409 si está en uso.                                                                   |
| `POST /categories`                                       | `categories:manage`                       | `{code, name, ageMin?, ageMax?, sortOrder?}`.                                              |
| `PATCH /categories/:id`                                  | `categories:manage`                       | Parcial: `name`, `ageMin`, `ageMax` (`null` borra el límite), `sortOrder`.                 |
| `PATCH /categories/:id/status`, `DELETE /categories/:id` | `categories:manage` / `categories:delete` | Como en deportes.                                                                          |
| `POST /seasons`                                          | `seasons:manage`                          | `{name, startDate, endDate}` (`AAAA-MM-DD`). Siempre nace en `borrador`.                   |
| `PATCH /seasons/:id`                                     | `seasons:manage`                          | Parcial: `name`, `startDate`, `endDate`. Una temporada archivada es de solo lectura (409). |
| `PATCH /seasons/:id/status`                              | `seasons:manage`                          | `{status, reason}`; el **motivo es obligatorio**.                                          |
| `DELETE /seasons/:id`                                    | `seasons:delete`                          | Solo en `borrador` y sin referencias.                                                      |

Referencia interactiva (fuera de producción): `/api/docs`.

### Reglas por catálogo

**Deportes.** `code` (2–40, `^[a-z][a-z0-9_]*$`), `name` (1–100). Estados `activo`/`inactivo`. No tienen reglas de puntuación: irán en reglamentos versionados por campeonato.

**Categorías.** Además: `ageMin`/`ageMax` enteros 0–120, **opcionales** (la Liga no ha confirmado edades); si ambos existen, `ageMin ≤ ageMax`, validado también sobre el **valor resultante** en actualizaciones parciales; `sortOrder` 0–9999 (orden de presentación). **No se relacionan con deportes**: una categoría institucional (Liga A, Juvenil…) no es una división por edad, peso o modalidad, y la relación deporte‑categoría se establecerá en el campeonato (ver `decisions.md`). No hay campos de género, peso ni modalidad.

**Temporadas.** `name` único (sin distinguir mayúsculas), `startDate`/`endDate` como fechas de calendario reales (se rechaza `2026-02-30`), `endDate > startDate` (igual que el CHECK de la base de datos; sin zonas horarias). **No se prohíben temporadas solapadas** ni se limita a una activa (regla sin confirmar). Ciclo de vida **provisional**:

```text
borrador ──► activa ──► finalizada ──► archivada
                ▲            │              │
                └─(reabrir)──┘◄─(restaurar)──┘
```

Ningún estado vuelve a `borrador` (un borrador se edita o se elimina). Cada cambio exige motivo y queda auditado; el servidor devuelve `allowedTransitions` y la interfaz solo ofrece esas acciones.

## Interfaz

Tras iniciar sesión se muestra una navegación (`#/`, `#/deportes`, `#/categorias`, `#/temporadas`) con solo las secciones cuyo permiso `*:read` posee el usuario; una dirección sin permiso vuelve a Inicio, y sin ningún permiso de catálogo se informa cómo proceder. Una única pantalla genérica (`CatalogAdmin`) se configura con `configs.tsx` para los tres catálogos:

- Tabla con búsqueda, filtro de estado, paginación y estados de **carga, error (con reintento) y vacío** (con y sin filtros). En pantallas estrechas las filas se apilan como tarjetas.
- Formulario de alta/edición con etiquetas, ayudas, validación en el cliente (la misma que el servidor) y errores del servidor asociados a su campo. El código se muestra de solo lectura al editar.
- Estado visible con **texto y símbolo**, no solo color; acciones con nombre accesible completo («Eliminar Deporte «Fútbol»»).
- Cambios de estado y eliminaciones con diálogo modal de confirmación (foco atrapado, Escape, foco devuelto; foco inicial en «Cancelar» si es destructivo; motivo opcional u obligatorio).
- Avisos de éxito y error; una sesión expirada o revocada en cualquier petición devuelve al acceso con un aviso.
- Los botones de crear/editar/estado/eliminar solo aparecen con el permiso correspondiente, pero **la API es la que autoriza**.

## Pruebas

```bash
npm test                  # unitarias (API 59, web 50)
npm run test:integration  # API contra PostgreSQL *_test (incluye test/catalogs)
```

`apps/api/test/catalogs`: matriz de acceso de los 6 endpoints × 3 catálogos (sin sesión 401; sin permiso 403; permisos parciales; CSRF); CRUD, validación, duplicados (incluida concurrencia), paginación/filtros/búsqueda literal, edades y fechas (también sobre el valor resultante), transiciones de estado, borrado condicionado, **integridad referencial con una tabla temporal con FK `RESTRICT`**, auditoría de cada operación y **rollback cuando la auditoría falla**, y un error de persistencia (500 sin detalles). `apps/web/.../catalogs.spec.tsx`: listado y sus estados, permisos visuales, formularios, diálogos, accesibilidad de teclado, errores del servidor, navegación y sesión expirada. Se verificó además con mutaciones manuales (rotas a propósito: edades y fechas sobre valores parciales, transiciones, borrado de no borradores, escape de comodines, duplicados por mayúsculas, auditoría fuera de la transacción, permiso de lectura, traducción de FK, controles por permiso, validación de edades, CSRF y confirmación de borrado) que la suite detecta cada fallo.

## Limitaciones y pendientes

- **Decisiones de la Liga** (ver `decisions.md`): ciclo de vida de las temporadas (transiciones provisionales); si pueden solaparse o solo una puede estar activa; relación categorías‑deportes y edades oficiales (incluida la fecha de referencia); si debe permitirse eliminar y quién.
- La unicidad por mayúsculas la comprueba el servicio; no pliega tildes (`Futbol` ≠ `Fútbol`) y entre dos solicitudes simultáneas solo el índice exacto de la base de datos actúa como red de seguridad.
- Sin control de concurrencia optimista: gana la última escritura (cada cambio queda auditado con antes/después).
- No hay campos de descripción; si la Liga los necesita se añadirán con una migración.
- Si la sesión expira con un formulario abierto, se pierde lo escrito.
- La búsqueda usa `ILIKE`: adecuada para catálogos pequeños; no hay índice dedicado.
- La interfaz no incluye todavía la gestión de roles (crear roles, asignar permisos de catálogo a roles distintos de `superadmin`): es el módulo de usuarios y roles.
