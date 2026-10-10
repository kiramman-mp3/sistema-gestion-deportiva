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

- [x] Pruebas de integración de la API contra PostgreSQL aislado (pruebas de integración en API y web) y pruebas unitarias
- [x] Pruebas end-to-end de navegador con Playwright y accesibilidad con `@axe-core/playwright` (flujos completos de autenticación, portal público, designaciones, noticias, disciplina, carnés, reportes, notificaciones, accesibilidad y RBAC/privacidad D-85)
- [x] Integración continua (CI) en GitHub Actions con verificación y job e2e en Chromium con PostgreSQL efímero
- [x] Scripts de copia de seguridad y restauración (`npm run db:backup` / `npm run db:restore`, y variantes `.sh`) con verificación SHA-256
- [ ] Ensayo de restauración completa documentado en un entorno limpio (programado antes de producción)
- [x] Documentación de despliegue (`docs/deployment.md`) y manual de usuario (`docs/user-manual.md`)
- [x] Guía de copias de seguridad y recuperación (`docs/backup-restore.md`)
- [ ] Validación de reglamentos con la Liga, capacitación y aceptación formal (requisitos de `requirements.md` §21)

## Módulos incorporados y verificados

- [x] §5.1 Configuración institucional editable (D-55 a D-58)
- [x] §5.10 Árbitros, jueces y asignaciones a eventos (D-64 a D-71)
- [x] §5.11 Disciplina, reclamos, sanciones y resoluciones (D-73 a D-80)
- [x] §5.12 Generación de reportes PDF y CSV en el servidor, carnés, certificados y verificación pública (D-86 a D-91)
- [x] §5.13 Noticias, comunicados y portal público multi-página (D-81 a D-85)
- [x] §5.14 Notificaciones del sistema y cola de correo (D-59 a D-63)

## Rediseño de la interfaz (D-95)

Fases del rediseño visual; su numeración es propia y no coincide con la del plan anterior. Detalle por fase en [`roadmap-frontend.md`](roadmap-frontend.md); diseño en [`frontend-design-spec.md`](frontend-design-spec.md); instrucciones para el agente en [`frontend-agent-brief.md`](frontend-agent-brief.md).

- [x] Fase 1 — Tokens, fuentes locales, estilos base y hoja de impresión separada (`feature/ui-foundation`)
- [x] Fase 2 — Estructura, navegación e inicio de sesión
- [x] Fase 2b — Portada del portal (adelantada desde la fase 6 para que el cambio sea visible antes)
- [x] Fase 3 — Componentes compartidos
- [x] Fase 4 — Formularios, tablas, filtros y diálogos
- [x] Fase 5 — Módulos administrativos e inicio del panel
- [x] Fase 6 — Resto del portal público
- [x] Fase 7 — Estados, accesibilidad y detalle
- [x] Fase 8 — Regresión y revisión final

Desbordamientos horizontales corregidos en la fase 1 (revisión de 40 rutas a 320, 375, 768, 1024 y 1280 px):

- [x] Institución en todos los anchos: el selector de logotipo oculto ensanchaba la página (ya existía en `develop`).
- [x] Usuarios a 320 y 768 px, detalle de usuario a 320 px y ficha de deportista a 320 y 375 px (ya existían en `develop`). Las tablas se apilan como tarjetas hasta 60rem y las listas de detalle se apilan en móvil.
- [x] Roles a 768 px y Auditoría a 320 px: los introdujo la nueva fuente, más ancha, y se corrigieron antes de integrar la fase.

Otros defectos que ya existían en `develop` y se corrigieron en la fase 1: variables CSS sin definir (`--text-muted`, `--surface-sunken`…), el botón de acceso del portal casi invisible y los enlaces con el azul del navegador, sin contraste en modo oscuro.

Pendientes que ya existían en `develop`:

- [x] Portal a 320 px (inicio, calendario y partido): corregido con `.match-team` responsive (`min-width: 0`, `overflow-wrap: break-word`) en fase 2b.
- [x] Acta y nómina en pantallas estrechas: contenedor con desplazamiento horizontal explícito en pantalla (`.print-document-preview-wrapper`) preservando impresión en hoja A4 idéntica al píxel (D-53).
- [x] Dos `h1` en las vistas imprimibles (cabecera de la aplicación y documento). Fase 2.
- [ ] Sin favicon: el navegador pide `/favicon.ico` y recibe 404. Debe hacerse con el escudo oficial de la Liga, sin uno provisional.

## Pendiente institucional (Segunda etapa y preguntas abiertas)

- [ ] Definición institucional de la matriz definitiva de roles por la Liga (D-14, D-93)
- [ ] Definición del formato oficial definitivo de carnés y certificados (D-90)
- [ ] Aprobación del reglamento disciplinario y escalas de sanción oficiales (D-74, D-77)
- [ ] Mejoras previstas para la segunda etapa (§17): informes avanzados, estadísticas individuales ampliadas, importación de datos históricos y PWA.

## Estado del proyecto

**Sistema funcional integral verificado end-to-end.** Están implementados y probados en su totalidad los módulos de la plataforma: autenticación, permisos RBAC, catálogos, clubes, deportistas (privacidad de menores D-85), equipos, inscripciones, campeonatos, calendario, resultados (separación de funciones D-72), multideporte (fútbol, básquet, taekwondo, ajedrez), árbitros y designaciones, disciplina, noticias, reportes oficiales (PDF/CSV), carnés con QR y verificación pública, notificaciones, auditoría inmutable, portal público accesible y suite e2e automatizada en CI. Pendiente únicamente de la validación institucional final y el ensayo de restauración previo a producción.
