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
- [ ] Autenticación (sesiones seguras, hash de contraseñas, límite de intentos)
- [ ] Autorización por permisos (roles, permisos, alcance por club)
- [ ] Auditoría: registrar automáticamente las operaciones sensibles de cada módulo
- [ ] Gestión de usuarios
- [ ] Deportes, categorías y temporadas: API y pantallas de administración (el esquema ya existe)

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

`feature/authentication`: login/logout con sesiones seguras (cookie `HttpOnly`/`Secure`/`SameSite`, CSRF), hash de contraseñas moderno, límite de intentos, guard de permisos en el backend y alta del primer superadministrador; con auditoría de inicios de sesión. Después, `feature/catalogs-admin` (API de deportes, categorías y temporadas con permisos y auditoría).
