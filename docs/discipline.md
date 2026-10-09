# Disciplina, reclamos y resoluciones

Implementa `requirements.md` §5.11. El sistema **ayuda a administrar el proceso** (registrar, asignar, documentar, notificar y publicar) pero **no decide** asuntos disciplinarios: toda decisión la toma y firma una persona con autoridad.

## Flujo

```text
Incidencia (árbitro / comisión) ─┐
                                 ├─► Expediente ─► revisión ─► resolución ─► (sanciones) ─► publicación opcional
Reclamo (club) ──────────────────┘        └─ historial de solo anexar (notas, recursos, notificaciones)
```

| Pieza      | Quién la crea                               | Qué es                                                                                          |
| ---------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Incidencia | Oficial designado en el partido, o comisión | Hecho ocurrido en un partido. **No se edita ni se borra** (trigger); solo se vincula a un caso  |
| Reclamo    | Dirigente de un club que participa          | Solicitud formal con evidencia adjunta. La comisión lo desestima (con motivo) o abre expediente |
| Expediente | Comisión (`cases:manage`)                   | Código `EXP-000123`, revisor, historial, resolución y publicación                               |
| Sanción    | Comisión (`sanctions:manage`)               | Medida asociada a un expediente en revisión o resuelto                                          |

## Permisos

| Permiso             | Permite                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------- |
| `incidents:report`  | Reportar incidencias de los partidos en que se está designado (cualquiera con `cases:manage`) |
| `incidents:read`    | Consultar incidencias                                                                         |
| `complaints:submit` | Presentar reclamos y adjuntar evidencia de los clubes a los que se pertenece                  |
| `complaints:read`   | Consultar reclamos (solo los de los clubes vinculados, o todos con `clubs:access_all`)        |
| `cases:read`        | Consultar expedientes (son internos)                                                          |
| `cases:manage`      | Abrir expedientes, asignar revisor, anexar notas y recursos, desestimar reclamos              |
| `cases:resolve`     | Resolver, reabrir y archivar                                                                  |
| `cases:publish`     | Publicar o retirar resoluciones del portal                                                    |
| `sanctions:read`    | Consultar sanciones (las de los clubes vinculados, o todas con `clubs:access_all`)            |
| `sanctions:manage`  | Registrar, marcar como cumplidas y anular sanciones                                           |

Gestionar no implica resolver, ni resolver publicar: son permisos independientes para poder separar funciones.

## Expedientes

- Estados: `abierto` → `en_revision` (al asignar revisor) → `resuelto` → `archivado`. Un resuelto puede **reabrirse** (vuelve a `en_revision`; la resolución anterior queda en el historial y se retira la publicación).
- Resolver exige una resolución escrita (mínimo 10 caracteres) y deja quién y cuándo (restricción `CHECK`). Los reclamos en revisión del expediente pasan a resueltos y se avisa a sus autores.
- El historial (`case_entries`) es de solo anexar: un trigger rechaza `UPDATE` y `DELETE`. Las entradas manuales son nota, recurso y notificación; apertura, asignación, decisión, reapertura, publicación y archivo las registra el sistema.
- El revisor debe ser un usuario activo con `cases:read` (`GET /api/cases/reviewers` lista los candidatos).

## Sanciones

Tipos: amonestación, suspensión por partidos, suspensión temporal, descuento de puntos, descalificación y multa (sin gestión de cobro).

La coherencia se valida en el servicio y también con restricciones `CHECK` de la base de datos:

- Al menos un sujeto: deportista, equipo o club; si hay varios deben ser del mismo club.
- Alcance: un campeonato (el deporte del equipo debe coincidir) o, sin campeonato, todas las competencias.
- Suspensión por partidos: número de partidos ≥ 1 (solo ese tipo lo lleva). Suspensión temporal: fecha final obligatoria. Fecha final ≥ inicial.
- Descuento de puntos: equipo inscrito en el campeonato, campeonato y puntos ≥ 1.
- Anulada: exige motivo.

`isActive` se calcula con las fechas (vigente y hoy dentro del período). Cumplir una suspensión por partidos lo marca una persona (`POST /api/sanctions/:id/fulfill`); el sistema no cuenta partidos jugados.

- **Tabla de posiciones:** los descuentos de puntos vigentes se restan de la tabla del campeonato (`pointsDeducted`); al anular la sanción se revierten.
- **Alertas en el acta:** `GET /api/events/:id/sanction-alerts` lista las sanciones vigentes que afectan a los participantes y su plantilla. Es informativo: no impide jugar.

## Reclamos

- Solo reclaman clubes que participan en el campeonato (inscripción pendiente, observada o aprobada) y el partido, si se indica, debe ser del campeonato.
- Adjuntos: PDF, JPG, PNG o WEBP de hasta 10 MB, hasta 10 por reclamo, mientras no esté resuelto ni desestimado. Se descargan con `Cache-Control: private, no-store` solo dentro del alcance del club.
- Un reclamo de otro club responde 404.

## Publicación de resoluciones

La publicación es **opcional y expresa**: (1) la Liga activa «Publicar resoluciones» en la configuración institucional (apagado de inicio), (2) quien tiene `cases:publish` redacta un **título y un resumen públicos** para un expediente resuelto.

- El portal (`GET /api/public/resolutions[/:id]`, `noindex`) muestra solo ese texto, el campeonato y un resumen de las sanciones no anuladas con el **club** afectado y el tipo de sujeto («deportista», «equipo», «club»). Nunca nombres de deportistas, la resolución interna, los motivos ni el historial.
- Antes de publicar, el servidor rechaza textos que mencionen por nombre y apellido a deportistas vinculados al expediente (control de mejor esfuerzo; la responsabilidad de redactar sin datos personales sigue siendo de quien publica).
- Retirar la publicación, o reabrir el expediente, la oculta de inmediato.

## Avisos y auditoría

Reportar una incidencia, presentar un reclamo, asignar un revisor, registrar una sanción, resolver y publicar generan avisos (ver [`notifications.md`](notifications.md)). Todo se audita; la auditoría guarda identificadores, nunca descripciones ni resoluciones.

## Interfaz

- **Disciplina** (`#/disciplina`): pestañas Incidencias, Reclamos, Expedientes y Sanciones según los permisos del usuario.
- **Expediente** (`#/disciplina/:id`): historial, vínculos, sanciones, y los formularios de revisor, resolución, publicación y sanción.
- **Calendario del campeonato:** botón **Reportar incidencia** en cada partido (`incidents:report`).
