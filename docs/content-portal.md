# Noticias, comunicados y portal público

Implementa `requirements.md` §5.13: contenido gestionable desde el panel, páginas del portal, filtros, enlaces directos y protección de datos personales. Los textos institucionales (quiénes somos, contacto, privacidad) se editan en [`institution.md`](institution.md).

## Noticias y comunicados

| Estado      | Significado                                     |
| ----------- | ----------------------------------------------- |
| `borrador`  | Solo lo ve quien tiene `announcements:read`     |
| `publicado` | Visible en el portal, con fecha de publicación  |
| `archivado` | Fuera del portal; no se edita hasta restaurarlo |

- **Permisos separados:** `announcements:manage` redacta y sube imágenes, pero **no publica**; `announcements:publish` publica, retira y archiva; `announcements:delete` elimina borradores. Un editor de contenido no tiene ningún permiso sobre resultados.
- **Texto plano:** el contenido no admite HTML ni formato; los párrafos se separan con una línea en blanco. El portal lo muestra como texto, de modo que nada incrustado puede ejecutarse.
- **Dirección estable:** la dirección pública (`slug`) se genera del título al crear y no cambia al editar, para que los enlaces compartidos sigan funcionando. Una `CHECK` exige su formato y que solo lo publicado tenga fecha de publicación.
- Se pueden corregir las publicadas (queda auditado, sin copiar el texto). Solo se eliminan **borradores**; lo publicado se retira o se archiva primero.
- El parámetro «publicar noticias» de la configuración institucional apaga las rutas públicas y la sección del inicio.

## Imágenes

`POST /api/media` (JPG, PNG o WEBP de hasta 5 MB, validadas por su contenido) con un **texto alternativo obligatorio**. Una imagen pública se sirve en `/api/public/media/:id` (`nosniff`, caché de una hora); una privada nunca se sirve por esa ruta. Solo las públicas pueden ser portada. No se elimina una imagen en uso.

## Páginas del portal

| Dirección                    | Página                                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `#/portal`                   | Inicio: últimas noticias, próximos partidos y últimos resultados                                      |
| `#/portal/competencias`      | Campeonatos con calendario, resultados y tabla de posiciones                                          |
| `#/portal/calendario`        | Calendario general con filtros (fechas, deporte, campeonato, estado) y paginación                     |
| `#/portal/partido/<id>`      | Detalle de un partido, escenario, incidencias y acta imprimible                                       |
| `#/portal/noticias[/<slug>]` | Lista y detalle de noticias y comunicados                                                             |
| `#/portal/clubes`            | Clubes afiliados (si la Liga los publica)                                                             |
| `#/portal/resoluciones`      | Resoluciones disciplinarias publicadas (si la Liga las publica, ver [`discipline.md`](discipline.md)) |
| `#/portal/liga`              | La Liga: presentación, contacto y política de privacidad                                              |

Todas las direcciones se pueden compartir (hay un botón «Copiar enlace» en noticias y partidos). El menú oculta las secciones que la configuración institucional apaga. El portal se adapta a pantallas pequeñas.

### API pública

`GET /api/public/home`, `GET /api/public/events` (filtros `from`, `to`, `sportId`, `categoryId`, `seasonId`, `championshipId`, `clubId`, `status`, `order`), `GET /api/public/events/:id`, `GET /api/public/announcements[/:slug]`, `GET /api/public/media/:id`, `GET /api/public/resolutions[/:id]`, `GET /api/public/institution`. Solo exponen campeonatos que no sean borrador ni archivados y resultados aprobados; las respuestas dinámicas llevan `Cache-Control: no-store`.

## Nombres de deportistas en lo público

| Situación                                                                                      | Cómo se muestra         |
| ---------------------------------------------------------------------------------------------- | ----------------------- |
| Mayor de 18 años                                                                               | Nombre y apellido       |
| Menor de 18 años, o sin fecha de nacimiento, **sin** perfil público con consentimiento vigente | `Deportista DEP-000123` |
| Menor con perfil público activado y consentimiento de publicación de perfil vigente            | Nombre y apellido       |

Aplica al calendario, el detalle del partido, las posiciones, las incidencias, el acta imprimible y la nómina de buena fe que ve el público. Revocar el consentimiento oculta el nombre de inmediato. Las pantallas y los documentos que requieren sesión muestran siempre los nombres completos a los usuarios autorizados. Ver D-85 en [`decisions.md`](decisions.md).

## Interfaz de administración

Sección **Noticias** (`#/noticias`): lista con filtros, editor (tipo, título, resumen, contenido, portada), acciones según permisos (publicar, retirar, archivar, restaurar, eliminar borrador, «ver en el portal») y biblioteca de imágenes.
