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
- [x] Decisión del modelo de participantes (ADR‑001; implementado)
- [x] Servicio de auditoría (`AuditService`) y seed de permisos/superadmin
- [x] Autenticación: sesiones de servidor, Argon2id, CSRF, límite de intentos, login/logout en la interfaz (`authentication.md`)
- [x] Autorización por permisos en el backend (guards con denegación por defecto; asignación de roles con prevención de escalada)
- [x] Alcance organizativo de los roles por club (`club_users`, `clubs:access_all`)
- [x] Auditoría de eventos de acceso, cuentas y roles (transaccional)
- [x] Auditoría de las operaciones sensibles de cada módulo (resultados, calendario, etc.)
- [x] Primer superadministrador (CLI) y administración básica: estado de cuenta, revocación de sesiones, asignación de roles
- [x] Gestión de usuarios: alta pendiente con enlace de activación, edición, estado, sesiones, restablecimiento asistido, cambio de contraseña (`administration.md`)
- [x] Roles y permisos editables desde la interfaz, con protección contra escalada de privilegios y roles de sistema inmutables
- [x] Auditoría consultable (`audit:read`) con saneado de secretos
- [x] Deportes, categorías y temporadas: API y pantallas de administración, con permisos y auditoría (`catalogs.md`)

## Fase 3 — Participantes y fútbol piloto

- [x] Clubes y personas (`clubs-people-teams.md`)
- [x] Deportistas (protección de datos de menores, consentimientos, perfil público resumido)
- [x] Equipos y plantillas (un equipo por deporte y temporada, nombre por temporada, transferencia entre temporadas)
- [x] Fotos y documentos de inscripción (`StoredFile`, almacenamiento seguro de archivos fuera de la raíz web)
- [x] Campeonatos y reglamentos versionados (`Championship`, `CompetitionRuleVersion`)
- [x] Inscripciones y elegibilidad (`Registration` con flujo de revisión y estados)
- [x] Calendario y programación (`Stage`, `Round`, `Event`, detección de colisiones de escenario y descanso)
- [x] Resultados con flujo de aprobación oficial (`borrador` → `pendiente_revision` → `aprobado` y revisiones históricas inmutables)
- [x] Tabla de posiciones de fútbol (cálculo dinámico FIFA/reglamentario)

## Fase 4 — Otros deportes

- [x] Básquet (puntuación por períodos Q1..Q4, prórrogas y tabla FIBA 2 pts victoria / 1 pt derrota)
- [x] Taekwondo (cuadro de combates, asaltos, puntos y deducción por faltas Gam-jeom)
- [x] Ajedrez (emparejamientos individuales con piezas blancas/negras, 1.0/0.5/0.0 y desempate Buchholz)

## Fase 5 — Portal público y documentos

- [x] Portal público (`#/portal`: información aprobada, filtros multideporte, fixtures y clasificaciones)
- [x] Documentos y reportes imprimibles oficiales (`PrintDocumentView`, estilos `@media print` para hoja A4):
  - [x] Acta Oficial de Encuentro con membrete institucional y 6 firmas reglamentarias.
  - [x] Nómina Institucional de Buena Fe por equipo/club con avales y firmas.

## Fase 6 — Pruebas y lanzamiento

- [x] Pruebas end-to-end y de permisos completas (443+ pruebas de integración y 113+ pruebas unitarias pasando al 100%)
- [x] Copias de seguridad y restauración probada (`npm run db:backup` / `npm run db:restore`, scripts bash/ps1, verificación SHA-256)
- [x] Documentación de despliegue (`docs/deployment.md`) y manual de usuario (`docs/user-manual.md`)
- [x] Guía de copias de seguridad y recuperación (`docs/backup-restore.md`)

## Estado del Proyecto

**Completado al 100% de acuerdo a la especificación funcional y técnica.**
Todas las fases (Fase 2, 3, 4, 5 y 6) han sido implementadas, probadas, verificadas contra linters y pruebas unitarias/e2e, y documentadas exhaustivamente.
