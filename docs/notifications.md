# Notificaciones

Implementa `requirements.md` §5.14: avisos dentro del sistema y correo electrónico, sin datos sensibles en lo que pueda reenviarse.

## Canales

| Canal     | Cuándo existe                 | Contenido                                      |
| --------- | ----------------------------- | ---------------------------------------------- |
| `sistema` | Siempre                       | Título y detalle (equipos, fechas, motivo)     |
| `correo`  | Solo si `MAIL_TRANSPORT=smtp` | Solo el título genérico y un enlace al sistema |

Por defecto `MAIL_TRANSPORT=none`: la Liga aún no ha definido proveedor ni remitente (ver [`decisions.md`](decisions.md)), así que **no se encolan correos**. Para activarlo, definir en `.env`:

```text
MAIL_TRANSPORT=smtp
MAIL_FROM="Liga de Quero <no-responder@dominio>"
SMTP_HOST=...        SMTP_PORT=587        SMTP_SECURE=false
SMTP_USER=...        SMTP_PASSWORD=...
```

Con `smtp`, `SMTP_HOST` y `MAIL_FROM` son obligatorios (la API no arranca sin ellos).

## Qué genera avisos

| Plantilla                                                     | Origen                                                  | Destinatarios                                              |
| ------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| `registration.reviewed`                                       | Cambio de estado de una inscripción                     | Usuarios del club del participante                         |
| `event.rescheduled`                                           | Reprogramación de un partido                            | Usuarios de los clubes participantes y árbitros designados |
| `event.status_changed`                                        | Partido suspendido, postergado o cancelado              | Ídem                                                       |
| `result.pending_review`                                       | Acta enviada a revisión                                 | Usuarios con `results:approve`                             |
| `assignment.created` / `assignment.removed`                   | Designación o retiro de un árbitro                      | El árbitro (usuario vinculado)                             |
| `case.assigned`, `complaint.received`, `resolution.published` | Disciplina                                              | Revisor, comisión y club involucrado                       |
| `documents.reminder`                                          | Acción manual `POST /notifications/reminders/documents` | Usuarios del club                                          |

Reglas comunes: no se avisa a quien origina la acción ni a cuentas que no estén activas, y el aviso se crea **en la misma transacción** que la operación (si se revierte, no queda aviso).

## API

| Método y ruta                                 | Acceso                    | Descripción                             |
| --------------------------------------------- | ------------------------- | --------------------------------------- |
| `GET /api/notifications?unread=true`          | Sesión (solo las propias) | Bandeja paginada                        |
| `GET /api/notifications/unread-count`         | Sesión                    | Número de avisos sin leer               |
| `POST /api/notifications/:id/read`            | Sesión                    | Marca uno como leído (una ajena da 404) |
| `POST /api/notifications/read-all`            | Sesión                    | Marca todos como leídos                 |
| `GET /api/notifications/outbox`               | `notifications:manage`    | Cola de correo y estado del transporte  |
| `POST /api/notifications/dispatch`            | `notifications:manage`    | Envía los correos pendientes ahora      |
| `POST /api/notifications/reminders/documents` | `notifications:manage`    | Recordatorio de documentación a un club |

## Correo: cola, reintentos y privacidad

- Cada correo es una fila `correo` en `notifications`. El despachador (cada minuto, solo si hay transporte) **reclama** las filas con `UPDATE … FOR UPDATE SKIP LOCKED` y un arrendamiento de 5 minutos (`next_attempt_at`): dos despachadores o dos instancias nunca envían el mismo correo, y si el proceso cae a mitad de un envío se reintenta tras el arrendamiento.
- Un fallo se reintenta con espera creciente (5, 10, 15… minutos) hasta 5 intentos; después queda `fallida`. De un fallo solo se guarda el **código** del error (el mensaje del servidor SMTP podría incluir direcciones o credenciales).
- Asunto: `<nombre corto de la Liga>: <título genérico>`. Cuerpo: el título y un enlace al sistema. Nunca incluye nombres, equipos, motivos ni fechas.
- El enlace es siempre una ruta interna (`#/…`, validado por una restricción `CHECK`).

## Interfaz

Sección **Notificaciones** (`#/notificaciones`) para todo usuario con sesión, con el número de avisos sin leer en el menú (se actualiza cada minuto). Con `notifications:manage` aparece además el panel de administración: recordatorio de documentación por club y cola de correo.
