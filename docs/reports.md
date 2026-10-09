# Documentos, reportes, carnés y certificados

Implementa `requirements.md` §5.12: PDF generado en el servidor, exportación CSV, restricción de documentos privados, fecha y versión en cada documento, y registro de quién genera documentos sensibles.

## Reportes

Todos requieren `reports:read` y respetan el alcance por club (quien no tiene `clubs:access_all` solo recibe lo de sus clubes; un club ajeno responde 404). Cada llamada admite `?format=pdf` (por omisión) o `?format=csv`.

| Documento                    | Ruta                                                         | Permisos adicionales |
| ---------------------------- | ------------------------------------------------------------ | -------------------- |
| Listado de equipos inscritos | `GET /api/reports/championships/:id/teams`                   | —                    |
| Tabla de posiciones          | `GET /api/reports/championships/:id/standings`               | —                    |
| Calendario de encuentros     | `GET /api/reports/championships/:id/fixtures`                | —                    |
| Acta de encuentro (solo PDF) | `GET /api/reports/events/:id/scoresheet`                     | `results:read`       |
| Nómina de buena fe           | `GET /api/reports/registrations/:id/roster`                  | —                    |
| Informe de sanciones         | `GET /api/reports/sanctions?status=&championshipId=&clubId=` | `sanctions:read`     |
| Carnés de un equipo (PDF)    | `GET /api/reports/team-seasons/:id/credentials`              | `credentials:issue`  |

- **PDF:** encabezado con el nombre, afiliación y logotipo de la Liga (de la configuración institucional); pie con fecha de generación, **código del documento** (`REP-AAAAMMDD-XXXXXX`), versión cuando aplica, número de página y el pie institucional. Las tablas repiten su encabezado en cada página.
- **CSV:** pensado para Excel en español: UTF-8 con BOM, separador `;`, saltos CRLF. Las celdas que empiezan por `=`, `+`, `-`, `@` o tabulación se prefijan con `'` para impedir la inyección de fórmulas. No se genera XLSX (ver D-86).
- **Privacidad:** los reportes con sesión llevan nombres completos para el personal autorizado. Cada generación queda en la auditoría (`document.generated`) con el tipo, el formato y el código, **sin datos personales**.

### Exportaciones públicas

`GET /api/public/championships/:id/export/standings|fixtures?format=pdf|csv` entrega la tabla y el calendario de campeonatos visibles (no borrador ni archivado). Aplican la misma regla de nombres que el portal: los menores sin consentimiento aparecen como «Deportista DEP-000123» (ver [`content-portal.md`](content-portal.md)).

## Carnés y certificados de inscripción

Los emite quien tiene `credentials:issue` (dentro del alcance por club) desde la ficha del deportista o, en el caso de los carnés, para todo el equipo.

| Regla                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Solo a deportistas **activos y habilitados** con plantilla activa en la temporada                                                                          |
| Temporada: la indicada o, si no, la única temporada activa (si hay cero o varias, se pide indicarla)                                                       |
| **Reemitir** anula la versión anterior y crea la siguiente; la base de datos garantiza una sola vigente por deportista, temporada y tipo                   |
| Se guarda una copia de lo impreso (`snapshot`), un número de serie (`CAR-000123`, `CER-000123`) y un **código de verificación** de 16 caracteres (80 bits) |
| Anular exige `credentials:revoke` y un motivo; un documento anulado no se descarga                                                                         |

- **Carné:** tarjeta de 85,6 × 54 mm con nombre, código, club, equipo y número de camiseta, categoría, temporada, fotografía (si existe y es JPG/PNG), código QR y código de verificación. La hoja del equipo organiza 8 tarjetas por página A4, emite las que falten y reutiliza las vigentes.
- **Certificado de inscripción:** texto formal con los datos del deportista, nombres del presidente y secretario/a (de la configuración institucional), fecha y QR.

### Verificación pública

`GET /api/public/verify/:code` (y la página `#/portal/verificar/<código>`, a la que apunta el QR) informa si el documento es auténtico y vigente: tipo, serie y versión, temporada, club, fecha de emisión y titular. El titular se muestra por nombre solo si es adulto o tiene consentimiento; si no, por su código de deportista. Nunca se revela quién lo emitió, la copia completa ni el motivo de una anulación.

## Interfaz

- **Documentos** (`#/documentos`, `reports:read`): enlaces PDF/CSV por campeonato, nómina de un participante e informe de sanciones.
- **Ficha del deportista:** panel de carnés y certificados (emitir, descargar, anular).
- **Ficha del equipo:** «Carnés (PDF)» por temporada.
- **Calendario del campeonato:** enlace «Acta PDF» en cada partido.
- **Portal:** descargas públicas de calendario y posiciones, y «Verificar un documento» en el pie.
