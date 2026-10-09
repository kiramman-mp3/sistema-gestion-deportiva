# Decisiones técnicas y preguntas pendientes

Este documento registra decisiones tomadas durante la implementación, discrepancias entre documentos y preguntas que requieren confirmación institucional. La fuente de requisitos sigue siendo [`requirements.md`](requirements.md).

## Decisiones técnicas

| #    | Decisión                                                                                              | Motivo                                                                                                 |
| ---- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| D-01 | Monorepo con npm workspaces (`apps/*`, `packages/*`).                                                 | Un solo repositorio, dependencias reproducibles con `package-lock.json`, sin herramientas adicionales. |
| D-02 | Backend NestJS 12 en ESM (imports con extensión `.js`), siguiendo la plantilla oficial de `nest new`. | Es la configuración soportada por el framework; evita mezclar CJS/ESM.                                 |
| D-03 | Pruebas con Vitest (API y web); lint con oxlint; formato con Prettier.                                | Es el toolchain que genera la plantilla oficial de Nest 12; se reutiliza en el frontend.               |
| D-04 | TypeScript fijado en `~6.0` (no 7.x).                                                                 | `typescript-eslint`/herramientas del ecosistema aún declaran soporte `<6.1`. Revisar al actualizar.    |
| D-05 | Prisma se fijará en la serie estable 7.10 (no el RC 8).                                               | El tag `latest` de `prisma` apunta a un release candidate; se prefiere una versión estable.            |
| D-06 | Variables de entorno validadas con zod al arrancar; la API falla rápido si son inválidas.             | Evita arranques con configuración incorrecta.                                                          |
| D-07 | Swagger/OpenAPI solo fuera de producción (`/api/docs`).                                               | Reduce la superficie expuesta en producción.                                                           |
| D-08 | PostgreSQL de desarrollo enlazado únicamente a `127.0.0.1`.                                           | Evita exponer la base de datos en la red local.                                                        |

## Discrepancias entre documentos

| Tema        | `CLAUDE.md`                                                                | `requirements.md` §16                                    | Resolución                                                                                                 |
| ----------- | -------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Integración | Merge local `--no-ff` hacia `develop`; ramas `feature/fix/refactor/chore`. | Pull requests hacia `develop`; incluye ramas `hotfix/*`. | Prevalece `CLAUDE.md`. Si el equipo adopta un remoto con PR, se ajusta sin cambiar la estructura de ramas. |
| Coautoría   | Prohíbe `Co-Authored-By` y atribuciones de IA.                             | —                                                        | Los commits usan solo la identidad Git configurada por el usuario.                                         |

## Preguntas pendientes para la Liga

Tomadas de la sección 20 de `requirements.md`; ninguna bloquea el trabajo de infraestructura y autenticación, pero sí los módulos indicados.

| Pregunta                                                                                                                             | Bloquea                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| ¿Liga A/B/C/D aplican solo a fútbol o también a otros deportes? ¿Edades exactas de Juvenil y Niños? ¿Categorías mixtas o por género? | Catálogo de categorías (se implementará configurable, sin valores por defecto inventados). |
| Reglamento de puntos y desempates de fútbol.                                                                                         | Tabla de posiciones (se implementará configurable por reglamento versionado).              |
| Estadísticas obligatorias de básquet.                                                                                                | Módulo de básquet.                                                                         |
| Modalidades de taekwondo.                                                                                                            | Módulo de taekwondo.                                                                       |
| Formato y desempates de ajedrez; ¿emparejamiento automático o importado?                                                             | Módulo de ajedrez.                                                                         |
| ¿Quién ingresa y quién aprueba resultados? (matriz de permisos real)                                                                 | Roles por defecto y aprobación de resultados.                                              |
| ¿Un equipo puede cambiar de nombre entre temporadas? ¿Un deportista puede estar en más de un equipo?                                 | Modelo de equipos y plantillas.                                                            |
| Documentos de inscripción; carnés impresos o digitales; política de fotos y perfiles públicos.                                       | Documentos, inscripciones y portal público.                                                |
| Hosting, dominio, correo, RPO/RTO y política de copias de seguridad.                                                                 | Despliegue y operación.                                                                    |

## Decisión de modelo pendiente de cerrar antes de migraciones de inscripciones

`requirements.md` §8.2 exige elegir entre **Opción A** (entidad común `participants`) y **Opción B** (tablas separadas de inscripciones) antes de crear esas migraciones. Recomendación inicial: Opción A, porque los eventos, resultados y clasificaciones pueden referirse a un único tipo de participante en deportes de equipo e individuales. Se formalizará al diseñar el esquema de competencias.
