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
- [x] Gestión de usuarios: alta pendiente con enlace de activación, edición, estado, sesiones, restablecimiento asistido, cambio de contraseña (`administration.md`)
- [x] Roles y permisos editables desde la interfaz, con protección contra escalada de privilegios y roles de sistema inmutables
- [x] Auditoría consultable (`audit:read`) con saneado de secretos
- [ ] Recuperación de contraseña autoservicio (bloqueada: requiere proveedor de correo)
- [ ] Segundo factor (MFA) para administradores
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

`feature/clubs-people`: clubes, personas y deportistas (con protección reforzada de datos de menores) y equipos, siguiendo el ADR‑001 de participantes. Antes de empezar convienen las respuestas de la Liga sobre categorías por deporte, edades y la matriz real de roles (ya se pueden crear roles institucionales desde la interfaz). En paralelo, si la Liga contrata un proveedor de correo, habilitar la recuperación autoservicio y valorar MFA para administradores.
