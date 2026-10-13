# Configuración institucional

Implementa `requirements.md` §5.1: datos de la Liga, logotipo, contactos, textos públicos, formato de documentos y parámetros de publicación. Los catálogos (deportes, categorías, temporadas), los escenarios y los roles ya se administran en sus propias secciones ([`catalogs.md`](catalogs.md), [`administration.md`](administration.md)).

## Datos

Una única fila (`institution_settings`, `id = 1`, con restricción `CHECK`). La crea la migración con los valores que antes estaban fijos en el código; si la fila faltara (por ejemplo, tras vaciar la base) el servicio la recrea con esos mismos valores.

| Grupo       | Campos                                                                                |
| ----------- | ------------------------------------------------------------------------------------- |
| Identidad   | nombre institucional, nombre corto, afiliación, cantón, logotipo                      |
| Contacto    | dirección, correo, teléfono, sitio web (solo `http`/`https`)                          |
| Portal      | «Quiénes somos», información de contacto, política de privacidad (texto plano)        |
| Documentos  | presidente, secretario/a y pie de página de los documentos oficiales                  |
| Publicación | publicar clubes, deportistas, noticias, resoluciones (esta última, apagada de inicio) |
| Resultados  | permitir que quien registró un acta también la apruebe (apagado de inicio, ver D-72)  |

## API

| Método y ruta                      | Permiso              | Descripción                                          |
| ---------------------------------- | -------------------- | ---------------------------------------------------- |
| `GET /api/institution`             | `institution:read`   | Configuración completa                               |
| `PATCH /api/institution`           | `institution:manage` | Modifica campos; cadena vacía = borrar el valor      |
| `PUT /api/institution/logo`        | `institution:manage` | Sube el logotipo (`multipart`, JPG/PNG/WEBP, ≤ 5 MB) |
| `DELETE /api/institution/logo`     | `institution:manage` | Quita el logotipo                                    |
| `GET /api/public/institution`      | público              | Datos publicables (sin identificadores internos)     |
| `GET /api/public/institution/logo` | público              | Logotipo                                             |

## Reglas

- Foto de portada del portal (opcional): `PUT`/`DELETE /api/institution/cover` (permiso `institution:manage`, JPEG/PNG/WebP hasta 5 MiB) y pública en `GET /api/public/institution/cover`; `GET /api/public/institution` indica `hasCover`. Si no hay foto, el portal usa sus ilustraciones.
- Los cambios se auditan (`institution.updated`, `institution.logo_changed`, `institution.logo_removed`, `institution.cover_changed`, `institution.cover_removed`). Los textos largos no se copian a la auditoría: solo su longitud.
- Los parámetros de publicación apagan el contenido correspondiente del portal: `GET /api/public/clubs*` y `GET /api/public/athletes/*` responden 404 cuando están desactivados. Los de noticias y resoluciones se aplican en sus módulos.
- Las actas y nóminas imprimibles toman el encabezado (nombre, afiliación, cantón y pie) de esta configuración.
- No se aceptan campos desconocidos ni protocolos distintos de `http`/`https` en el sitio web.

## Interfaz

Sección **Institución** del panel (`#/institucion`), visible con `institution:read`. Sin `institution:manage` el formulario queda en solo lectura.
