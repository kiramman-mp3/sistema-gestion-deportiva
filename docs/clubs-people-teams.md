# Clubes, personas, deportistas y equipos

API en `apps/api/src/{clubs,people,athletes,teams,public}`. Migraciones `20261009041121_clubs_people` y `20261009043345_teams_rosters` (modelo en `database.md`). Reglas de negocio indicadas por la Liga el 2026‑10‑08; lo que la Liga no definió está marcado como **provisional** y registrado en `decisions.md` (D‑40 a D‑48).

## Reglas de la Liga y cómo se garantizan

| Regla                                                                                 | Dónde se garantiza                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un equipo puede cambiar de nombre entre temporadas.                                   | `team_seasons.name`: cada inscripción en una temporada tiene su propio nombre; el historial se conserva. `teams.name` es solo el nombre por defecto para nuevas inscripciones.                                                                                                        |
| Un deportista no puede estar en más de un equipo, pero sí en más de un deporte.       | Restricción **única en la base de datos** `(athlete_id, sport_id, season_id)` en `team_memberships`, con clave foránea compuesta que obliga a que el deporte y la temporada de la alta coincidan con los de su inscripción. El servicio la comprueba antes para dar un mensaje claro. |
| Al terminar la temporada se habilita el cambio de equipo.                             | `POST /athletes/:id/transfer` (cambio de club) solo prospera si el deportista no tiene altas —vigentes ni bajas— en temporadas `borrador` o `activa`. En la temporada siguiente puede inscribirse en cualquier equipo de su club.                                                     |
| Se publican fotos y un perfil resumido; el perfil completo solo lo ve quien controla. | Dos niveles de datos (ver abajo). Las fotos se difieren (D‑47).                                                                                                                                                                                                                       |
| Edades inventadas pero modificables en el sistema.                                    | Rangos `age_min`/`age_max` de las **categorías** (catálogo editable desde la interfaz). `npm run db:seed:provisional -w @liga/api` crea valores iniciales solo si no existen y nunca sobrescribe lo editado.                                                                          |
| Documentos de inscripción: la regla la define el sistema por ahora.                   | Difiere a la siguiente rama (`feature/registration-documents`), junto con las fotos, porque ambos necesitan almacenamiento de archivos que aún no existe. Mientras tanto, la habilitación exige datos mínimos y consentimiento (ver «Habilitación»).                                  |

## Alcance por club

Los permisos dicen **qué** puede hacer un usuario; el vínculo `club_users` dice **en qué clubes**. Con `clubs:access_all` (personal de la Liga) se accede a todos los clubes. Un club o recurso fuera del alcance responde **404** (no revela que existe). Crear clubes, cambiar su estado o eliminarlos exige además `clubs:access_all`. El vínculo se administra con `PUT/DELETE /clubs/:id/users/:userId`.

## Dos niveles de datos del deportista

| Nivel                                            | Contenido                                                                                              | Quién                                                                                                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resumen                                          | código `DEP‑000123`, nombres, club, estado, habilitación, si tiene perfil público                      | `athletes:read` (dentro de su alcance de clubes)                                                                                                                                                                          |
| Completo (`full`)                                | fecha de nacimiento y edad, tipo y número de documento, teléfono, tutor (nombre, parentesco, teléfono) | `athletes:read_full`. Registrar o modificar estos campos exige el mismo permiso.                                                                                                                                          |
| Público (`GET /public/athletes/:id`, sin sesión) | solo nombre para mostrar y club                                                                        | cualquiera, **solo si** está publicado + persona activa + club activo + consentimiento de publicación vigente (se vuelve a comprobar en cada lectura). Con `X-Robots-Tag: noindex, nofollow` y `Cache-Control: no-store`. |

La plantilla de un equipo y el historial de equipos muestran solo el nivel resumen. La auditoría registra identificadores y **nombres de campos**, nunca nombres, documentos ni teléfonos.

## Duplicados

- Documento: clave normalizada única (`tipo:número` sin espacios, puntos ni guiones) en `person_private_data.id_key`; cédulas ecuatorianas validadas con dígito verificador. Condición de carrera: gana un alta, las demás reciben 409.
- Mismo nombre y misma fecha de nacimiento sin documento: 409 `posible_duplicado`; si es otra persona se repite con `confirmDuplicate: true`.
- Nombres de clubes y de equipos: clave normalizada (sin tildes, mayúsculas ni signos) única.

## Habilitación (provisional, D‑43)

`PATCH /athletes/:id/eligibility` (`athletes:validate`, con motivo). Para pasar a `habilitado` se exige: persona activa, fecha de nacimiento, datos del tutor si es menor de 18 años y consentimiento vigente de tratamiento de datos; si falta algo, 409 con la lista `blockers`. Cambiar nombre, apellido, fecha de nacimiento o documento de un deportista habilitado lo devuelve a `pendiente`. Un cambio de club también.

## Consentimientos

`/athletes/:id/consents`: tipos `tratamiento_datos`, `publicacion_perfil`, `publicacion_foto`. Los registros no se borran, se **revocan** (con motivo). Un menor lo otorga su tutor (parentesco obligatorio, nunca «propio»); un mayor, él mismo (`propio`). Un solo consentimiento vigente por tipo (índice único parcial). Revocar el de `publicacion_perfil`, inactivar al deportista o vencer el consentimiento retira el perfil público.

## Equipos y plantillas

- Un equipo pertenece a un club y a un deporte; se inscribe en una temporada con su categoría y nombre (`team_seasons`). Dos equipos del mismo deporte no pueden llamarse igual en la misma temporada.
- Las temporadas `finalizada` y `archivada` son historial: no admiten cambios de inscripción ni de plantilla.
- Alta en plantilla (`teams:manage`): el deportista debe ser del mismo club del equipo, estar activo y `habilitado`; la plantilla no puede estar cerrada; y su edad **a la fecha de inicio de la temporada** debe caber en el rango de la categoría (si la categoría tiene límites, se exige fecha de nacimiento). Dorsal opcional, único entre jugadores vigentes.
- **Baja** (`/leave`, con motivo): no libera el cupo del deporte en esa temporada. **Anulación** (`DELETE`, `teams:delete`, con motivo): elimina el alta y libera el cupo; es la excepción administrativa.
- Cambiar la categoría de una inscripción exige que los jugadores vigentes sigan cumpliendo la edad.
- Concurrencia: las altas bloquean la fila del deportista (`FOR UPDATE`), igual que la transferencia, de modo que un deportista nunca queda en un equipo de un club distinto del suyo.

## Endpoints

Base `/api`; todos con sesión salvo `/public/*`. `Alcance` = limitado a los clubes del usuario salvo `clubs:access_all`.

| Ruta                                                                                                       | Permiso                                                          |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `GET /clubs`, `GET /clubs/:id`                                                                             | `clubs:read` (alcance)                                           |
| `POST /clubs`, `PATCH /clubs/:id/status`, `DELETE /clubs/:id`                                              | `clubs:manage`/`clubs:delete` + `clubs:access_all`               |
| `PATCH /clubs/:id`                                                                                         | `clubs:manage` (alcance)                                         |
| `GET/POST /clubs/:id/representatives`, `PATCH …/:repId`                                                    | `clubs:read` / `clubs:manage`                                    |
| `DELETE /clubs/:id/representatives/:repId`                                                                 | `clubs:manage` + `clubs:access_all`                              |
| `GET /clubs/:id/users`, `PUT/DELETE /clubs/:id/users/:userId`                                              | `clubs:manage`                                                   |
| `GET /athletes`, `GET /athletes/:id`, `GET …/consents`                                                     | `athletes:read` (alcance)                                        |
| `POST /athletes`, `PATCH /athletes/:id`, `PATCH …/status`, `POST …/consents`, `POST …/consents/:id/revoke` | `athletes:manage` (+ `athletes:read_full` para datos personales) |
| `PATCH /athletes/:id/eligibility`                                                                          | `athletes:validate`                                              |
| `PUT /athletes/:id/publication`                                                                            | `athletes:publish`                                               |
| `POST /athletes/:id/transfer`                                                                              | `athletes:transfer` (acceso a ambos clubes)                      |
| `GET /athletes/:id/teams`                                                                                  | `athletes:read` + `teams:read`                                   |
| `GET /teams`, `GET /teams/:id`, `GET …/seasons`, `GET …/seasons/:sid/roster`                               | `teams:read` (alcance)                                           |
| `POST /teams`, `PATCH /teams/:id`, `POST …/seasons`, `PATCH …/seasons/:sid`                                | `teams:manage`                                                   |
| `POST …/roster`, `PATCH …/roster/:mid`, `POST …/roster/:mid/leave`                                         | `teams:manage`                                                   |
| `DELETE /teams/:id`, `DELETE …/seasons/:sid`, `DELETE …/roster/:mid`                                       | `teams:delete`                                                   |
| `GET /public/clubs`, `/public/clubs/:slug`, `/public/athletes/:id`                                         | pública                                                          |

## Pendiente

- Fotos y documentos de inscripción (`feature/registration-documents`): almacenamiento de archivos (fuera de la raíz web, tipo y tamaño validados, nombres aleatorios, acceso autorizado, antivirus si procede) y la regla definitiva de documentos por categoría.
- Confirmación de la Liga: edades por categoría y por deporte, fecha de referencia para la edad (hoy: inicio de la temporada), excepciones (pases, jugadores fuera de categoría), si el cambio de club necesita autorización del club de origen.
- Participantes unificados del ADR‑001: se implementarán con los campeonatos; equipos y deportistas ya quedaron como entidades propias.
