# Árbitros, jueces y designaciones

Implementa `requirements.md` §5.10: datos profesionales mínimos, estado y disponibilidad, designación en partidos sin choques de horario, consulta de designaciones, registro de actas y historial de participación.

## Oficiales

Un **oficial** es un árbitro, juez o auxiliar de mesa. Reutiliza `Person` (nombre) y guarda solo lo estrictamente necesario:

| Dato                | Notas                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------- |
| Nombres y apellidos | O una persona ya registrada (p. ej. un exjugador): sirve para detectar conflictos de interés |
| Deportes            | Al menos uno; solo se le puede designar en campeonatos de esos deportes                      |
| Estado              | `activo`, `inactivo` o `suspendido`; solo los activos pueden ser designados                  |
| Licencia, teléfono  | Opcionales. El teléfono solo lo ven `officials:manage` y `assignments:manage`                |
| Club de afiliación  | Opcional; impide que arbitre a su propio club                                                |
| Cuenta del sistema  | Opcional (correo de una cuenta activa); permite ver y responder sus designaciones            |

No se guarda número de documento ni dirección.

**Disponibilidad:** períodos en los que no se le puede designar (`official_unavailabilities`, `ends_at > starts_at` por `CHECK`).

**Historial:** `GET /api/officials/:id/history` lista todas sus designaciones (campeonato, función, estado).

## Designaciones

Cada partido admite una designación por función (`arbitro_central`, `asistente_1`, `asistente_2`, `cuarto_arbitro`, `juez_mesa`, `cronometrista`, `anotador`, `juez_taekwondo`, `arbitro_ajedrez`, `comisario`) y un oficial no puede repetirse en el mismo partido (restricciones únicas).

Una designación se rechaza con 409 si:

| Motivo                       | Regla                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------- |
| Oficial no activo            | Inactivo o suspendido                                                           |
| Deporte                      | No está habilitado para el deporte del campeonato                               |
| Indisponibilidad             | El partido (supuesto de 120 min) cae dentro de un período no disponible         |
| Traslape                     | Otra designación no rechazada con partido a menos de 90 minutos                 |
| Club                         | Su club de afiliación, o el de su ficha de deportista, es uno de los que juegan |
| Jugador                      | Es deportista en la plantilla de la temporada de uno de los equipos del partido |
| Partido sin fecha            | Debe programarse antes de designar                                              |
| Partido finalizado/cancelado | No se modifican sus designaciones                                               |

Las designaciones de un mismo oficial se serializan con un bloqueo asesor por oficial, de modo que dos solicitudes simultáneas no pueden dejar horarios traslapados.

### Respuesta del oficial

Quien tiene cuenta vinculada y el permiso `assignments:read_own` ve **Mis designaciones** (`GET /api/assignments/mine?scope=proximas|pasadas|todas`) y puede confirmar o rechazar (`POST /api/assignments/:id/respond`). El rechazo exige motivo, libera el horario y avisa a quien designó. Una designación rechazada no se vuelve a aceptar: se designa de nuevo. Una designación ajena responde 404.

### Actas e incidencias

El permiso `results:manage_assigned` permite registrar y enviar a revisión el acta **solo de los partidos en que el usuario está designado** (y no rechazó). No permite aprobar. `results:manage` sigue valiendo para cualquier partido.

## API

| Método y ruta                                       | Permiso                |
| --------------------------------------------------- | ---------------------- |
| `GET /api/officials`, `GET /api/officials/:id`      | `officials:read`       |
| `GET /api/officials/:id/history`                    | `officials:read`       |
| `POST`, `PATCH /api/officials`, disponibilidad      | `officials:manage`     |
| `DELETE /api/officials/:id`                         | `officials:delete`     |
| `GET /api/events/:id/assignments`                   | `assignments:read`     |
| `GET /api/events/:id/assignment-candidates`         | `assignments:manage`   |
| `POST`, `DELETE /api/events/:id/assignments[/:aid]` | `assignments:manage`   |
| `GET /api/assignments/mine`, `POST …/:id/respond`   | `assignments:read_own` |

Todo cambio queda auditado (`official.*`, `assignment.*`). Eliminar un oficial con designaciones responde 409: se desactiva para conservar el historial; si su persona no tiene otro papel (deportista, consentimientos, representaciones), se elimina con él.

## Avisos

Designar o retirar avisa al oficial; su rechazo avisa a quien lo designó; reprogramar o suspender un partido avisa también a los oficiales designados (ver [`notifications.md`](notifications.md)).

## Interfaz

- **Árbitros y jueces** (`#/arbitros`, `officials:read`): lista con filtros, alta y edición, ficha con disponibilidad e historial.
- **Calendario del campeonato:** botón **Designaciones** en cada partido (`assignments:read`); con `assignments:manage` muestra los candidatos con sus conflictos.
- **Mis designaciones** (`#/mis-designaciones`, `assignments:read_own`): confirmar, rechazar y abrir el acta del partido.
