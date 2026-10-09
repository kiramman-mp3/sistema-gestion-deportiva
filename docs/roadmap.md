# Hoja de ruta de implementación

Estado de avance según el plan de `requirements.md` (secciones 13, 17 y 22). Un ítem solo se marca como hecho cuando está implementado y verificado.

Leyenda: `[x]` hecho · `[ ]` pendiente

## Fase 2 — Fundamentos técnicos

- [x] Repositorio Git con `main` / `develop` y flujo de ramas
- [x] Monorepo npm workspaces, formato, lint, tipos
- [x] API NestJS: configuración validada, helmet, CORS restringido, OpenAPI, `/api/health`
- [x] Frontend React + Vite con estado real de la API
- [x] PostgreSQL local (Docker Compose)
- [x] CI (formato, lint, tipos, pruebas, build)
- [ ] Prisma: conexión, esquema base y migraciones iniciales
- [ ] Autenticación (sesiones seguras, hash de contraseñas, límite de intentos)
- [ ] Autorización por permisos (roles, permisos, alcance por club)
- [ ] Auditoría base (`audit_logs`)
- [ ] Gestión de usuarios
- [ ] Deportes, categorías y temporadas (catálogos configurables)

## Fase 3 — Participantes y fútbol piloto

- [ ] Clubes y personas
- [ ] Deportistas (protección de datos de menores)
- [ ] Equipos y plantillas
- [ ] Campeonatos y reglamentos versionados
- [ ] Inscripciones y elegibilidad
- [ ] Calendario y programación
- [ ] Resultados con flujo de aprobación
- [ ] Tabla de posiciones de fútbol (reglas configurables)

## Fase 4 — Otros deportes

- [ ] Básquet (puntuación por período)
- [ ] Taekwondo
- [ ] Ajedrez

## Fase 5 — Portal público y documentos

- [ ] Portal público (solo información aprobada)
- [ ] Documentos y reportes PDF

## Fase 6 — Pruebas y lanzamiento

- [ ] Pruebas end-to-end y de permisos
- [ ] Copias de seguridad y restauración probada
- [ ] Documentación de despliegue y manuales

## Siguiente bloque recomendado

`feature/database-foundation`: Prisma 7.10 + esquema base (usuarios, roles, permisos, auditoría, deportes, categorías, temporadas), migración inicial y pruebas de integración contra PostgreSQL. Requiere Docker en ejecución.
