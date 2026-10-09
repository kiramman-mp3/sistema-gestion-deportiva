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

- [x] Pruebas de integración de la API contra PostgreSQL aislado (448 pruebas, incluidos permisos y flujos de aprobación) y pruebas unitarias (86 en la API, 113 en la web)
- [ ] Pruebas end-to-end de navegador (no hay Playwright/Cypress; los flujos de interfaz solo se cubren con pruebas de componentes)
- [x] Scripts de copia de seguridad y restauración (`npm run db:backup` / `npm run db:restore`, y variantes `.sh`) con verificación SHA-256
- [ ] Ensayo de restauración completa documentado en un entorno limpio
- [x] Documentación de despliegue (`docs/deployment.md`) y manual de usuario (`docs/user-manual.md`)
- [x] Guía de copias de seguridad y recuperación (`docs/backup-restore.md`)
- [ ] Validación de reglamentos con la Liga, capacitación y aceptación formal (requisitos de `requirements.md` §21)

## Pendiente de la especificación

Módulos de `requirements.md` que **todavía no existen** (sin modelos, API ni pantallas):

- [ ] §5.1 Configuración institucional editable
- [ ] §5.10 Árbitros, jueces y asignaciones a eventos
- [ ] §5.11 Disciplina, reclamos, sanciones y resoluciones
- [ ] §5.13 Noticias, comunicados y contenido gestionable del portal público
- [ ] §5.14 Notificaciones (correo y avisos dentro del sistema)

Entregables de documentos incompletos (§5.12):

- [x] Acta de encuentro y nómina de buena fe, imprimibles desde el navegador
- [ ] Generación de PDF en el servidor, exportación CSV/XLSX, carnés, certificados e informes de sanciones

Otras mejoras previstas: informes avanzados, estadísticas individuales ampliadas, importación de datos históricos y PWA (segunda etapa, §17).

## Estado del proyecto

**MVP funcional, aún no listo para producción.** Está implementado y verificado (formato, lint, tipos, pruebas y build en verde) el núcleo de la primera entrega de `requirements.md` §17: autenticación y permisos, catálogos, clubes, deportistas y equipos, inscripciones, campeonatos y calendario, resultados con aprobación, tabla de posiciones de fútbol, reglas mínimas de básquet, taekwondo y ajedrez, portal público de resultados oficiales, auditoría y scripts de respaldo.

No está cubierta toda la especificación: faltan los módulos listados en «Pendiente de la especificación», las pruebas de navegador y la validación con la Liga.
