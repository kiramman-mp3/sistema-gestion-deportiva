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
- [x] Prisma 7.10: conexión, esquema base (usuarios, roles, permisos, auditoría, deportes, categorías, temporadas) y migración inicial
- [x] Pruebas de integración contra PostgreSQL aislado (local y CI)
- [x] Decisión del modelo de participantes (ADR‑001; implementación diferida)
- [x] Servicio de auditoría (`AuditService`) y seed de permisos/superadmin
- [x] Autenticación: sesiones de servidor, Argon2id, CSRF, límite de intentos, login/logout en la interfaz (`authentication.md`)
- [x] Autorización por permisos en el backend (guards con denegación por defecto; asignación de roles con prevención de escalada)
- [ ] Alcance organizativo de los roles (p. ej. por club): llega con el módulo de clubes
- [x] Auditoría de eventos de acceso, cuentas y roles (transaccional)
- [ ] Auditoría de las operaciones sensibles de cada módulo nuevo (resultados, calendario, etc.)
- [x] Primer superadministrador (CLI) y administración básica: estado de cuenta, revocación de sesiones, asignación de roles
- [ ] Gestión de usuarios completa: alta de usuarios, roles y permisos editables, cambio y recuperación de contraseña, MFA para administradores
- [x] Deportes, categorías y temporadas: API y pantallas de administración, con permisos y auditoría (`catalogs.md`)

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

`feature/users-admin`: alta de usuarios, creación de roles y edición de sus permisos (hoy solo existe `superadmin` y sus permisos no pueden delegarse desde la interfaz), cambio y recuperación de contraseña y auditoría consultable (`audit:read`). Es el paso previo para que la Liga delegue la administración de catálogos. En paralelo, obtener de la Liga las decisiones pendientes (categorías por deporte, edades, ciclo de temporadas) antes del módulo de clubes y campeonatos.
