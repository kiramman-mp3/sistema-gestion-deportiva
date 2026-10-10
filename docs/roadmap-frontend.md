# Hoja de ruta del frontend (rediseño D-95)

Fases restantes del rediseño de `apps/web`. Diseño: [`frontend-design-spec.md`](frontend-design-spec.md).
Forma de trabajo: [`frontend-agent-brief.md`](frontend-agent-brief.md). Resumen de estado y pendientes
heredados: sección «Rediseño de la interfaz» de [`roadmap.md`](roadmap.md).

Leyenda: `[x]` hecho y verificado · `[ ]` pendiente. Una casilla solo se marca cuando su criterio
de aceptación se ha **ejecutado** y pasa.

## Estado de partida (develop, merge `e15e122`)

- [x] **Fase 1 — Fundación:** `tokens.css`, fuentes locales, base, `print.css` separado,
      `styles.spec.ts`, `e2e/impresion.spec.ts`, `e2e/desbordamiento.spec.ts`.
- Línea base: 209 pruebas web, 41 e2e, lint/typecheck/formato/build en verde.

Deuda medida en develop (recalcular al empezar cada fase):

| Indicador                            | Valor                                                         | Dónde                                                                                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clases usadas sin estilo             | 45                                                            | `secondary-button`, `empty-state`, `catalog-error`, `form-grid`, `tab-panel`, `breadcrumb`, `primary-button`, `stage-*`, `round-*`, `rules-*`, `match-*`…                                                                           |
| Emojis como iconos                   | 43 en 10 archivos                                             | `CompetitionsView` 13, `PrintDocumentView` 11 (7 dentro del documento oficial: no tocar, §15 de la spec), `PortalPages` 6, `Notice`, `RolesPage`, `RoleDetailPage`, `CatalogAdmin`, `StandingsTab`, `ApiStatus`, `PublicPortalPage` |
| `style={{…}}`                        | 63                                                            | `MatchScoresheetDialog` 21, `FixturesTab` 19, `StandingsTab` 16, `PrintDocumentView` 6, `App` 1                                                                                                                                     |
| Hex en TSX                           | 3                                                             | `StandingsTab.tsx` (`#dc3545`, `#d39e00` ≈ 2:1)                                                                                                                                                                                     |
| Diálogos sin Escape ni foco atrapado | 5                                                             | `FixturesTab`, `MatchScoresheetDialog`, `IncidentDialog`, `EventAssignmentsDialog`, `DisciplinePage`                                                                                                                                |
| Pestañas                             | 3 implementaciones                                            | `ChampionshipDetailPage`, `DisciplinePage`, `CompetitionsView` (+ `.tabs/.tab` y `.detail-tabs/.tab-btn`)                                                                                                                           |
| Encabezados                          | `h1` fijo de marca en todas las vistas; 2 `h1` en imprimibles | `App.tsx`, `PrintDocumentView.tsx`                                                                                                                                                                                                  |

## Reglas comunes a todas las fases

- Rama `feature/ui-<nombre>` desde `develop`; commits pequeños (Conventional Commits); al terminar
  y verificar, `git merge --no-ff` a `develop` y `git branch -d`. **Nunca** a `main`.
- Sin cambios en `apps/api`, contratos, sesión, CSRF, permisos, privacidad de menores (D-85),
  reglas de negocio (D-72, D-80, D-56), despliegue ni CSP.
- Sin dependencias nuevas (los iconos se copian como SVG; React 19 ya tiene lo necesario).
- Selectores y aserciones de prueba: se priorizan semántica y accesibilidad correctas; si un cambio
  rompe una prueba acoplada a la estructura anterior, se actualiza **en el mismo commit** del componente.
- Cada fase añade pruebas propias (unitarias con Vitest + Testing Library y, si aplica, e2e).
- Verificación de cierre de fase (todas obligatorias, ver el brief): lint, typecheck web y e2e, pruebas
  web, formato, build, e2e completos, recorrido visual en 320/375/768/1024/1280 claro y oscuro,
  consola sin errores nuevos, impresión idéntica, sin desbordes nuevos.

---

## Fase 2 — Estructura, navegación e inicio de sesión (`feature/ui-shell`)

**Objetivo:** cabecera y navegación con identidad; un `h1` por vista; login rediseñado.

Archivos: `App.tsx`, `features/catalogs/CatalogsApp.tsx`, `features/public/PublicPortalPage.tsx`,
`features/auth/LoginForm.tsx`, `features/public/PrintDocumentView.tsx` (solo encabezados),
nuevos `components/AppShell.tsx`, `components/NavDrawer.tsx`, `components/InstitutionBrand.tsx`,
`styles.css`, `styles/print.css` (ocultar la nueva estructura), specs e2e con aserciones de nivel.

Tareas:

- [x] `InstitutionBrand`: lee `GET /api/public/institution` una vez (compartido) y muestra el logotipo
      real solo si `hasLogo`; si no, solo el nombre. Nunca un escudo inventado.
- [x] Panel: barra lateral agrupada (spec §6) ≥ 64rem; barra superior + `NavDrawer` < 64rem. Mismo
      `SECTIONS`, mismo filtrado por permisos, `aria-label="Secciones"`, mismas etiquetas, contador de
      notificaciones, «Mi cuenta» y «Cerrar sesión» en la barra superior.
- [x] Portal: barra superior con marca y menú (`aria-label="Secciones del portal"`), menú móvil.
- [x] Encabezados: marca sin rol de encabezado; un `h1` por vista; niveles −1 en todas las vistas
      del panel y del portal; un único `h1` en las imprimibles. Actualizar las 22 aserciones de nivel.
- [x] Login según spec §12 (dos columnas ≥ 64rem con último resultado oficial real o solo identidad).
- [x] `print.css`: añadir los selectores nuevos a la lista oculta al imprimir.
- [x] Contenedor del panel `max-width: 80rem`; portal `72rem`.

Pruebas nuevas:

- Unitarias: menú filtra grupos por permisos (grupo vacío oculto); `NavDrawer` abre con el botón,
  Escape cierra y devuelve el foco, Tab queda atrapado; `InstitutionBrand` con y sin logotipo;
  login muestra marcador solo si hay `recent[0]` y no lo muestra si la API falla.
- e2e: comprobación «un `h1` por ruta y sin saltos de nivel» en las rutas principales
  (en `accesibilidad.spec.ts`); menú móvil a 375 px navega a una sección; impresión sigue verde.

Aceptación:

- `seguridad-roles.spec.ts`, `auth.spec.ts` y `portal.spec.ts` en verde.
- 0 desbordes nuevos; impresión idéntica (0 píxeles de diferencia con fecha fija).
- axe sin violaciones en las páginas cubiertas.

## Fase 2b — Portada del portal (`feature/ui-portal-home`)

**Objetivo:** que la portada transmita la Liga desde el primer pantallazo (spec §13).

Archivos: `features/public/PublicPortalPage.tsx`, `features/public/PortalPages.tsx` (`HomePage`,
`MatchRow`, `NewsCard`), `styles.css`, `e2e/desbordamiento.spec.ts`, `e2e/portal.spec.ts`.

Tareas:

- [x] Banda de marcador con datos reales de `/public/home` (vacío y error diseñados).
- [x] Filtro por deporte sin emojis; noticias con jerarquía clara.
- [x] Quitar degradado e insignia «PORTAL OFICIAL»; acceso al panel en la barra.
- [x] Corregir `.match-team` a 320 px en portada **y** calendario/partido (mismo componente) y quitar
      las exclusiones correspondientes de `desbordamiento.spec.ts`.

Pruebas nuevas: unitarias de la banda (con resultados, sin resultados, error); e2e de portada a 320 px.

Aceptación: portal sin desbordes a 320 px en inicio, calendario y partido; `portal.spec.ts` verde;
nada de datos de ejemplo en la interfaz.

## Fase 3 — Componentes compartidos (`feature/ui-components`)

Archivos: `components/` (`Button`, `Icon`, `StatusBadge`, `Modal`, `Tabs`, `EmptyState`, `LoadState`,
`fields.tsx`, `Notice`, `Pagination`, `ConfirmDialog`), `tokens.css` (espaciado y capas), y los
consumidores que se migren.

Tareas:

- [ ] Crear los componentes según spec §8 (iconos con aviso de licencia ISC de Lucide).
- [ ] `ConfirmDialog` sobre `Modal` sin cambiar su API.
- [ ] Mover `LoadState` y campos de `features/people/fields.tsx` a `components/` (reexportar o
      actualizar importaciones).
- [ ] Reemplazar emojis fuera del documento oficial (Notice, Roles, RoleDetail, CatalogAdmin,
      ApiStatus, StandingsTab, CompetitionsView, PortalPages, PublicPortalPage, barra de impresión).
- [ ] Añadir prueba «sin emojis en TSX» que excluya solo el contenido de `.institutional-sheet`
      documentado en la spec §15.

Pruebas nuevas: `Modal` (foco inicial, Tab/Mayús+Tab, Escape, `busy`, devolución del foco);
`ConfirmDialog` (motivo obligatorio < 3 caracteres, foco en motivo o «Cancelar», Escape ignorado al
enviar) — las pruebas existentes de `catalogs.spec.tsx` deben pasar sin cambios; `Tabs` (roles,
flechas, Inicio/Fin); `StatusBadge` (los tonos del §8 con texto).

Aceptación: 0 emojis fuera del documento oficial; pruebas nuevas detectan el fallo si se rompe el
comportamiento (comprobado rompiéndolo a propósito una vez).

## Fase 4 — Formularios, tablas, filtros y diálogos (`feature/ui-forms-tables`)

Archivos: los cinco diálogos (`FixturesTab`, `MatchScoresheetDialog`, `IncidentDialog`,
`EventAssignmentsDialog`, `DisciplinePage`), formularios de `features/*`, `styles.css`.

Tareas:

- [ ] Los cinco diálogos sobre `Modal` (Escape = su «Cancelar», foco atrapado, devolución del foco).
- [ ] Campos de 44 px, error junto al campo, foco en el primer inválido al enviar.
- [ ] Unificar pestañas en `Tabs` (`ChampionshipDetailPage`, `DisciplinePage`, `CompetitionsView`).
- [ ] Tablas: cabecera y filas según spec §9; `data-label` en todas las celdas.
- [ ] Vista previa de acta y nómina en pantallas estrechas: la hoja de ancho fijo se desplaza dentro de
      un contenedor propio (o se escala) **solo en `@media screen`**; impresión idéntica. Quitar la
      exclusión correspondiente si se cubre en `desbordamiento.spec.ts`.

Pruebas nuevas: una por diálogo (Escape sin peticiones, foco atrapado, foco devuelto).

Aceptación: 5/5 diálogos accesibles por teclado; e2e de designaciones/actas y disciplina en verde.

## Fase 5 — Módulos administrativos e inicio del panel (`feature/ui-admin`)

Archivos: nuevo `features/home/AdminHome.tsx` (o similar), `CatalogsApp.tsx`, `features/competitions/*`,
`features/discipline/*`, `features/people/*`, `features/officials/*`, `features/admin/*`, `styles.css`,
`tokens.css` (retirar alias).

Tareas:

- [ ] Inicio del panel según spec §11 (solo endpoints verificados; bloques por permiso).
- [ ] Eliminar los 63 `style={{…}}` (salvo valores calculados justificados y comentados) y los 3 hex.
- [ ] Definir o sustituir las 45 clases sin estilo; añadir prueba «toda clase usada existe en el CSS»
      (incluye clases de plantillas `badge-${tone}` y `status-${status}` enumerando sus valores).
- [ ] Retirar los alias de compatibilidad de `tokens.css` usando `--color-*` en todo el CSS.
- [ ] Separación de funciones en actas (D-72) intacta.

Pruebas nuevas: `AdminHome` con permisos simulados (sin permiso no hay petición a esa ruta; un 500
en un bloque no afecta a los demás; «de sus clubes» sin `clubs:access_all`; `linked: false`).

Aceptación: 0 clases huérfanas, 0 hex en TSX, alias retirados, `designaciones-actas.spec.ts` verde.

## Fase 6 — Resto del portal público (`feature/ui-portal`)

Archivos: `CompetitionsView.tsx`, `PortalPages.tsx` (calendario, partido, noticias, clubes,
resoluciones, La Liga, verificar).

Tareas:

- [ ] Detalle de campeonato con dirección propia `#/portal/competencias/<id>` en `parsePortalRoute`
      (compartible; «Atrás» vuelve a la lista). Sin cambiar la API.
- [ ] Tabla de posiciones según spec §9 (tarjetas como formas con texto accesible).
- [ ] Páginas del portal con la nueva jerarquía y estados.

Aceptación: D-85 (menores) y D-80 (resoluciones) siguen en verde en `portal.spec.ts` y
`seguridad-roles.spec.ts`; sin desbordes.

## Fase 7 — Estados, accesibilidad y detalle (`fix/ui-a11y-polish`)

- [ ] `accesibilidad.spec.ts`: repetir las páginas principales con `colorScheme: 'dark'`; 0 violaciones.
- [ ] Mensajes de carga/vacío/error unificados con acción de recuperación.
- [ ] Revisión de objetivos táctiles (≥ 44 px) y foco en todas las pantallas.

## Fase 8 — Regresión y revisión final

- [ ] Suite completa en verde; recorrido visual completo (todas las rutas × 5 anchos × 2 temas).
- [ ] Documentar decisiones nuevas en `docs/decisions.md` (siguiente número libre: **D-96**).
- [ ] Actualizar `README.md` (sección de interfaz) y marcar esta hoja de ruta y `roadmap.md`.
- [ ] Informe final con el formato de `CLAUDE.md`.

## Preguntas abiertas (no bloquean; registrar y seguir)

- Sello del acta impresa (`seal-emblem` con emojis deportivos) y emojis de incidencias dentro del
  documento oficial: deberían usar el escudo real e iconos sobrios, pero cambian la impresión (D-53).
- Favicon: requiere el escudo oficial; no crear uno provisional.
- CSP de la web en Nginx: mejora de seguridad aparte, fuera de este trabajo.
