# Especificación de diseño del frontend

Fuente de verdad visual para el rediseño de `apps/web` (decisión D-95). Complementa a
[`roadmap-frontend.md`](roadmap-frontend.md) (qué hacer y en qué orden) y a
[`frontend-agent-brief.md`](frontend-agent-brief.md) (cómo trabajar).

Propuesta visual aprobada (v2, con maquetas): <https://claude.ai/artifact/JtbiurAFtYfnQE8Hn13KMQ>.
Todo lo que aparece en sus maquetas son **datos de ejemplo**; nunca se copian a la aplicación.

Si esta especificación y el código no coinciden, manda `apps/web/src/styles/tokens.css` para los
valores y este documento para las reglas.

---

## 1. Identidad

- **Concepto:** el marcador de la cancha. Cifras y títulos con tipografía condensada de marcador;
  verde páramo como estructura; amarillo marcador como único acento, reservado para lo que está
  vivo o pide atención (resultado, sección activa, pendiente).
- **Elemento memorable:** la **banda de marcador**. En el portal abre la portada con la jornada;
  en el panel se convierte en la fila de pendientes. Todo lo demás es sobrio.
- **Identidad provisional:** no hay colores oficiales de la Liga. No se inventan; se cambian solo en
  `tokens.css` cuando la Liga los entregue.
- **Escudo:** siempre el logotipo real de `GET /api/public/institution/logo`, solo si
  `GET /api/public/institution` devuelve `hasLogo: true`. Si no hay logotipo, se muestra el nombre
  sin escudo. **Nunca** se dibuja, genera o sustituye un escudo (ni con emojis ni con SVG).
- **Claro por defecto.** El oscuro sigue `prefers-color-scheme`; no se añade selector de tema.
- **Evitar:** dashboard genérico de tarjetas idénticas con sombra, degradados decorativos,
  etiquetas en MAYÚSCULAS espaciadas, emojis como iconos, `→` añadido a enlaces, texto promocional.

## 2. Color (tokens existentes)

Definidos en `apps/web/src/styles/tokens.css`. Los componentes usan **solo** variables; nunca hex
en TSX ni colores literales nuevos en CSS (excepción: `print.css`, que es papel).

| Token                                                | Claro                 | Oscuro                | Uso                                            |
| ---------------------------------------------------- | --------------------- | --------------------- | ---------------------------------------------- |
| `--color-bg`                                         | `#f2f4f1`             | `#0f1719`             | Fondo de página                                |
| `--color-surface`                                    | `#ffffff`             | `#172124`             | Tarjetas, tablas, formularios                  |
| `--color-surface-sunken`                             | `#e7ebe8`             | `#223033`             | Zonas hundidas, celdas destacadas              |
| `--color-text`                                       | `#15212b`             | `#e6ecea`             | Texto principal                                |
| `--color-text-muted`                                 | `#4d5b63`             | `#a3b1b0`             | Texto secundario                               |
| `--color-border`                                     | `#d3dad5`             | `#2c3a3d`             | Separadores (decorativos)                      |
| `--color-control-border`                             | `#7a8a88`             | `#6b7f80`             | Bordes de campos (≥ 3:1)                       |
| `--color-brand` / `--color-on-brand`                 | `#0f3d3e` / `#fff`    | `#0b2b2c` / `#e6ecea` | Barra lateral, banda de marcador               |
| `--color-primary` / `--color-on-primary`             | `#0f3d3e` / `#fff`    | `#7cc4b8` / `#0f1719` | Botón principal, enlaces, foco                 |
| `--color-accent` / `--color-on-accent`               | `#ffc21a` / `#15212b` | `#ffc93d` / `#15212b` | Acento. **Nunca como texto sobre fondo claro** |
| `--color-focus`                                      | `#0f3d3e`             | `#7cc4b8`             | Anillo de foco (sobre marca: `--color-accent`) |
| `--color-success` / `-bg`                            | `#18794e` / `#e3f4ea` | `#5bd08f` / `#12301f` | Aprobado, habilitado, vigente                  |
| `--color-warning` / `-bg`                            | `#8a4b00` / `#fff1d6` | `#f5b451` / `#33250c` | Pendiente, suspendido, postergado              |
| `--color-danger` / `-bg`                             | `#b42318` / `#fdecea` | `#ff8a80` / `#3a1513` | Rechazado, error, anulado                      |
| `--color-danger-strong` / `--color-on-danger-strong` | `#b42318` / `#fff`    | igual                 | Botón destructivo                              |
| `--color-info` / `-bg`                               | `#1f5fa6` / `#e6effa` | `#8db8f2` / `#13253d` | Publicado, inscripciones abiertas              |
| `--color-backdrop`                                   | 55 % tinta            | 65 % negro            | Fondo de diálogos                              |

Reglas:

- Todo token de color nuevo se define en claro **y** oscuro; `styles.spec.ts` lo comprueba.
- Todo par texto/fondo nuevo se añade a `TEXT_PAIRS` en `styles.spec.ts` (AA 4,5:1).
- Los alias antiguos (`--bg`, `--surface`, `--text`, `--muted`, `--text-muted`, `--primary`,
  `--ok`, `--error`, `--danger-text`, `--success-text`, `--warning-text`, `--error-strong`,
  `--surface-sunken`, `--border`) se **retiran en la fase 5**: se reemplazan por `--color-*`.
- El color nunca comunica solo: siempre con texto o icono.

## 3. Tipografía

| Rol                        | Familia                    | Pesos    | Uso                                            |
| -------------------------- | -------------------------- | -------- | ---------------------------------------------- |
| Display (`--font-display`) | Barlow Condensed           | 600, 700 | `h1`–`h3`, cifras de marcador, números grandes |
| Texto (`--font-body`)      | Atkinson Hyperlegible Next | 400–700  | Todo lo demás, incluidos `h4`–`h6`             |
| Código (`--font-mono`)     | sistema monoespaciado      | —        | Códigos, UUID                                  |

Fuentes alojadas en `apps/web/src/assets/fonts/` (OFL-1.1, ver su README). No se añaden fuentes
ni servicios externos.

Escala (rem sobre 16 px):

| Nivel           | Tamaño                  | Familia     | Uso                                        |
| --------------- | ----------------------- | ----------- | ------------------------------------------ |
| Portada         | 3–3.5 rem (`clamp`)     | display 700 | Solo banda de marcador y portada           |
| `h1` página     | 2.25 rem (móvil 1.75)   | display 700 | Un único `h1` por vista                    |
| `h2` sección    | 1.5 rem                 | display 700 |                                            |
| `h3` subsección | 1.25 rem                | display 700 |                                            |
| `h4`            | 1.0625 rem              | texto 700   | Títulos pequeños (tarjetas de noticia)     |
| Texto           | 1 rem, interlineado 1.5 | texto 400   | Mínimo 16 px en campos (evita zoom en iOS) |
| Pequeño         | 0.875 rem               | texto 400   | Ayudas, metadatos                          |
| Mínimo          | 0.8125 rem              | texto 600   | Solo insignias; nunca texto corrido        |

- Caja de oración siempre. Sin `text-transform: uppercase` en etiquetas (retirar `.hero-badge`,
  `.sport-tag`, `.republic-text` queda: es del documento impreso).
- Cifras alineadas con `font-variant-numeric: tabular-nums` en tablas, marcadores y fechas en columna.
- Líneas de texto corrido ≤ 70 caracteres (`max-width: 66ch`).

## 4. Espaciado, radios, elevación, movimiento

- **Espaciado:** múltiplos de 4 px. Escala: 4, 8, 12, 16, 24, 32, 48, 64. Añadir en `tokens.css`
  como `--space-1` … `--space-8` en la fase 3 y usar `gap` en flex/grid en vez de márgenes sueltos.
- **Radios:** `--radius-sm` 4 px (campos, botones, insignias cuadradas), `--radius-md` 8 px
  (tarjetas, tablas), `--radius-lg` 14 px (diálogos, banda de marcador). Insignias de estado: píldora.
  No poner el mismo radio y sombra a todo: la jerarquía la da la función.
- **Elevación:** `--shadow-sm` (tarjetas sobre fondo), `--shadow-md` (diálogos, menús). Nada más.
- **Capas (`z-index`):** añadir tokens `--z-sticky: 10`, `--z-drawer: 40`, `--z-modal: 100`,
  `--z-toast: 200`.
- **Movimiento:** `--duration-fast` 150 ms, `--duration-base` 200 ms, `--ease-out`. Solo `opacity`
  y `transform`. Movimiento solo como respuesta a una acción (abrir menú, diálogo, pestaña).
  Prohibido: entradas animadas por sección, elevar tarjetas al pasar el ratón, `transition: all`.
  `prefers-reduced-motion` ya está cubierto globalmente en `styles.css`.

## 5. Layout y puntos de corte

| Punto de corte    | Uso                                                                  |
| ----------------- | -------------------------------------------------------------------- |
| < 40rem (640 px)  | Móvil: listas de detalle apiladas, formularios a una columna         |
| < 60rem (960 px)  | Tablas `.responsive-table` en tarjetas (ya implementado; no bajarlo) |
| ≥ 64rem (1024 px) | Barra lateral fija del panel                                         |

- **Panel:** barra lateral 15 rem + contenido con `max-width: 80rem`; formularios largos `44rem`.
- **Portal:** contenido `max-width: 72rem`, centrado; texto corrido `66ch`.
- Margen lateral mínimo 16 px en todos los anchos. **Nunca desplazamiento horizontal de la página**
  (lo vigila `e2e/desbordamiento.spec.ts`). Una tabla, un código o un diagrama que no quepa se
  desplaza dentro de su propio contenedor con `overflow-x: auto`.
- `min-width: 0` en hijos de flex/grid que contengan texto largo.

## 6. Navegación

### Panel

- **≥ 64rem:** barra lateral (`--color-brand`) con escudo real + «Liga de Quero» / nombre corto
  institucional, y grupos. **< 64rem:** barra superior con botón «Menú» que abre la misma lista en
  un panel lateral modal (foco atrapado, Escape cierra y devuelve el foco, fondo inerte).
- Grupos (solo se muestran las secciones permitidas; un grupo vacío no aparece):

| Grupo                | Secciones (etiqueta exacta)                               |
| -------------------- | --------------------------------------------------------- |
| —                    | Inicio                                                    |
| Competencias         | Campeonatos, Escenarios, Temporadas, Deportes, Categorías |
| Clubes y deportistas | Clubes, Deportistas, Equipos                              |
| Arbitraje            | Árbitros y jueces, Mis designaciones                      |
| —                    | Disciplina                                                |
| Comunicación         | Noticias, Documentos                                      |
| Administración       | Institución, Usuarios, Roles y permisos, Auditoría        |
| Barra superior       | Notificaciones (con contador), Mi cuenta, Cerrar sesión   |

- **Contrato con las pruebas:** el `<nav>` del menú conserva `aria-label="Secciones"`; los enlaces
  conservan exactamente las etiquetas de la tabla (las pruebas usan `getByRole('link', { name })`,
  a veces con `exact: true`); «Notificaciones» sigue empezando por esa palabra; el botón «Cerrar
  sesión» debe ser visible tras iniciar sesión a 1280 px.
- Activo: `aria-current="page"`, peso 700 y marca de 3 px en `--color-accent`. Iconos SVG + texto.
- Las rutas `#/…`, `SECTIONS`, `DISCIPLINE_PERMISSIONS` y el filtrado por permisos **no cambian**.

### Portal

- Barra superior blanca (`--color-surface`): escudo real + nombre institucional; menú horizontal
  en escritorio, botón «Menú» en móvil. Conservar `aria-label="Secciones del portal"` y el contenedor
  de navegación que hoy responde a `getByRole('navigation', { name: 'Portal' })`
  (`aria-label="Portal y acceso"`). Enlace de acceso al panel discreto en la barra.
- Pie con nombre, contacto, «Contacto y política de privacidad» y «Verificar un documento».

## 7. Encabezados (P0-6)

- La marca de la cabecera **no** es un encabezado (`<p>` o enlace).
- Cada vista tiene **un único `h1`** (su título) y no se salta ningún nivel. Los niveles actuales
  bajan uno: h2 → h1, h3 → h2, h4 → h3.
- Portal: la portada tiene como `h1` el nombre institucional; cada página, su título.
- Vistas imprimibles: el único `h1` es el del documento.
- Las 22 aserciones de nivel de 7 specs e2e (`accesibilidad`, `carnes`, `designaciones-actas`,
  `disciplina`, `noticias`, `portal`, `seguridad-roles`) se actualizan **en el mismo commit** que la vista.

## 8. Componentes compartidos (`apps/web/src/components/`)

Inspeccionar el componente actual antes de reemplazarlo. Mantener las APIs de props existentes.

| Componente    | Especificación                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Button`      | Variantes `primary` (fondo `--color-primary`), `secondary` (borde `--color-control-border`), `danger` (`--color-danger-strong`), `ghost` (enlace). Alto mínimo 44 px. Estado `busy` (deshabilitado + texto «…ando…»). Un solo `primary` por vista. Conservar las clases `primary`, `danger`, `danger-outline`, `link` mientras existan usos.                                                                                                                                                                                                     |
| `Icon`        | SVG en línea, trazo 2, 24×24, `currentColor`, `aria-hidden="true"`. Trazos copiados de Lucide (ISC) con aviso de licencia en el archivo. Sin dependencia npm. Conjunto inicial: home, trophy, map-pin, calendar, shield, users, whistle (propio), flag, newspaper, file-text, building, lock, bell, menu, x, check, clock, pause, alert-triangle, info, globe, pencil, chevron-left/right, download, printer, log-out.                                                                                                                           |
| `StatusBadge` | Píldora con icono + texto. Tonos: `neutral` (borrador, archivado, finalizado, inactivo), `warning` (pendiente, suspendido, postergado, designado, recibido, en revisión), `success` (aprobado, habilitado, activo, vigente, confirmado, resuelto), `danger` (rechazado, inhabilitado, anulado, cancelado, bloqueado, desestimado), `info` (publicado, inscripciones abiertas), `live` (en curso: `--color-accent`). Reemplaza `.badge`, `.status-badge`, `.status-tag`, `.match-status-pill` **conservando la clase `badge`** (la usan los e2e). |
| `Modal`       | Extraído de `ConfirmDialog`: `role="dialog"`/`<dialog open>`, `aria-modal`, `aria-labelledby`, foco inicial configurable, foco atrapado, Escape = cancelar (ignorado mientras `busy`), devolución del foco, bloqueo del desplazamiento del fondo. `ConfirmDialog` pasa a usarlo **sin cambiar su API**.                                                                                                                                                                                                                                          |
| `Tabs`        | `role="tablist"`/`tab`/`tabpanel`, `aria-selected`, `aria-controls`, flechas izquierda/derecha, Inicio/Fin. Conservar los nombres de pestaña que usan los e2e («Calendario y partidos», «Tabla de Posiciones Oficial…», «Reclamos»).                                                                                                                                                                                                                                                                                                             |
| `EmptyState`  | Título que dice qué falta + una frase de qué hacer + acción opcional. Nunca vacío mudo.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `LoadState`   | Ya existe en `features/people/fields.tsx`: moverlo a `components/` y unificar: carga con esqueleto (`role="status"`), error con mensaje y botón «Reintentar». Textos: «Cargando…» (uno solo, con puntos suspensivos tipográficos).                                                                                                                                                                                                                                                                                                               |
| `Notice`      | Conservar clases `notice success` / `notice error` (las usan los e2e) y el anuncio cortés/alerta. Cambiar ✔/✖ por `Icon`.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Campos        | `TextField`, `SelectField`, `TextAreaField`, `CheckboxField` (`features/people/fields.tsx`): mover a `components/fields.tsx`. Etiqueta visible, `*` en obligatorios, ayuda y error enlazados con `aria-describedby`, alto 44 px, error debajo del campo con icono. `PasswordField` de `PasswordForms.tsx` reutiliza el mismo patrón.                                                                                                                                                                                                             |
| `Pagination`  | Botones de 44 px, texto «Página X de Y · N registros».                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## 9. Tablas, formularios, diálogos

- **Tablas de datos:** `.responsive-table` + `data-label` en cada `td` (obligatorio). Cabecera con
  `th` en `--color-text-muted` 0.8125 rem y borde inferior de 2 px; filas con borde de 1 px. Números
  alineados a la derecha y tabulares. Acciones en `td.row-actions`. Hasta 60rem se apilan en tarjetas
  (no cambiar ese punto de corte). Clases que usan los e2e: `.portal-table`, `tbody tr`, `.badge`.
- **Tabla de posiciones:** primer lugar con marca de 4 px en `--color-accent` y la posición en texto;
  tarjetas amarilla/roja como formas de 9×13 px con texto accesible («4 amarillas, 1 roja»), no 🟨🟥.
  Diferencia de goles con `--color-success`/`--color-danger` y signo explícito.
- **Formularios:** una columna en móvil; dos columnas solo para pares cortos en escritorio. Errores
  al perder el foco y al enviar; tras error al enviar, foco en el primer campo inválido.
- **Diálogos:** máximo 28 rem (formularios complejos 40 rem), acciones a la derecha, «Cancelar»
  primero, acción principal o destructiva al final.
- **Filtros:** en `<search>` con `form`, botón «Buscar» y «Limpiar filtros» solo si hay filtros activos.

## 10. Estados de interfaz

| Estado                     | Forma                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| Carga                      | Esqueleto con la forma del contenido (tablas: 3 filas), `role="status"` y texto accesible «Cargando…» |
| Vacío                      | `EmptyState` con acción cuando el usuario tiene permiso                                               |
| Error                      | Mensaje concreto (qué pasó, cómo seguir) + «Reintentar»; `role="alert"`                               |
| Éxito                      | `Notice` cortés; desaparece al cerrarlo, no solo por tiempo                                           |
| Deshabilitado              | Opacidad 0.45, `cursor: not-allowed`, atributo `disabled`                                             |
| Confirmación               | `ConfirmDialog` para toda acción destructiva o irreversible (ya existe)                               |
| Estados de negocio (§12.4) | `StatusBadge`                                                                                         |

## 11. Inicio del panel (fase 5)

Solo endpoints existentes; **sin cambios en la API**. Cada bloque se pide solo si el usuario tiene
el permiso, en paralelo (máximo 7 solicitudes), con su propia carga/vacío/error, cancelados con
`AbortController` al salir. Los conteos usan `pageSize=1` y leen `total` de
`Page<T> = { items, page, pageSize, total }`.

| Bloque                                 | Ruta                                                              | Permiso                | Notas verificadas                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------- |
| Deportistas por habilitar              | `GET /api/athletes?eligibility=pendiente&pageSize=1`              | `athletes:read`        | Limitado a los clubes del usuario salvo `clubs:access_all`: entonces la etiqueta dice «de sus clubes» |
| Reclamos recibidos                     | `GET /api/complaints?status=recibido&pageSize=1`                  | `complaints:read`      | Mismo alcance por club                                                                                |
| Expedientes abiertos                   | `GET /api/cases?status=abierto&pageSize=1`                        | `cases:read`           | Sin alcance por club                                                                                  |
| Campeonatos en curso                   | `GET /api/championships?status=en_curso&pageSize=5`               | `championships:read`   | `items` con `name`, `status`, `season`, `sport`, `category`                                           |
| Inscripciones abiertas                 | `GET /api/championships?status=inscripciones_abiertas&pageSize=1` | `championships:read`   | Solo `total`                                                                                          |
| Próximos partidos / últimos resultados | `GET /api/public/home`                                            | público                | `upcoming` y `recent` (≤ 6 c/u), solo campeonatos públicos, menores ya ocultos por el servidor (D-85) |
| Mis designaciones                      | `GET /api/assignments/mine?scope=proximas&pageSize=3`             | `assignments:read_own` | Si `linked: false`, explicar que la cuenta no está vinculada a un árbitro                             |
| Notificaciones sin leer                | reutilizar `useUnreadCount`                                       | sesión                 | No volver a pedirlo                                                                                   |

Prohibido: «actividad reciente» desde `/audit-logs` (≈75 códigos sin traducir, la llenan los
inicios de sesión), conteo global de actas pendientes o de inscripciones (exigiría N peticiones),
gráficos o tendencias inventadas. Accesos directos según permisos. Sin datos personales sensibles.

## 12. Inicio de sesión (fase 2)

- **≥ 64rem:** dos columnas. Izquierda: panel `--color-brand` con escudo real (si existe), nombre
  institucional y, si `GET /api/public/home` devuelve `recent[0]`, ese último resultado oficial en
  formato marcador (equipos, resultado, campeonato). Si no hay datos o falla, el panel muestra solo
  identidad: **nunca** un resultado de ejemplo. Derecha: formulario.
- **< 64rem:** solo el formulario con el escudo encima.
- **Contrato:** encabezado «Iniciar sesión», campos «Correo electrónico» y «Contraseña», botón
  «Ingresar», aviso de sesión expirada y errores con `role="alert"`; mismos `autocomplete`.
  `AuthContext`, CSRF, cookies y `api/client.ts` **no se tocan**.
- Mostrar/ocultar contraseña con botón accesible (`aria-pressed`, etiqueta «Mostrar contraseña»).

## 13. Portada del portal (fase 2b)

- Abre con la **banda de marcador** (`--color-brand`): «Esta semana» + tarjetas de los últimos
  resultados oficiales y próximos partidos de `/public/home` (marcador en `--color-accent` con tinta;
  pendientes con borde). Enlace «Calendario completo».
- Debajo: competencias por deporte (filtro de píldoras con `aria-pressed`, sin emojis de deporte;
  el deporte se nombra) y noticias (máx. 3, imagen con `alt` real o sin imagen).
- Se elimina la cabecera con degradado y la insignia «PORTAL OFICIAL».
- Corregir el desborde a 320 px de `.match-team` y quitar esa exclusión de `e2e/desbordamiento.spec.ts`.
- Respetar parámetros de publicación (D-56): lo desactivado no se muestra.

## 14. Accesibilidad (mínimos verificables)

- Contraste AA (comprobado por `styles.spec.ts`); axe sin violaciones en claro **y oscuro**.
- Foco visible de 3 px en todo control; orden de tabulación = orden visual; «Saltar al contenido».
- Objetivos táctiles ≥ 44×44 px y ≥ 8 px entre ellos.
- Iconos solo decorativos (`aria-hidden`) con texto visible; botones solo-icono con `aria-label`.
- Formularios: etiqueta visible, error asociado, `aria-invalid`, foco al primer error.
- Diálogos y menú lateral: foco atrapado, Escape, devolución del foco.
- Pestañas con roles ARIA y teclado.
- Imágenes con `alt` real (las del portal ya lo exigen, D-82).

## 15. Impresión y documentos oficiales (D-53)

- `styles/print.css` contiene la hoja institucional. Cualquier cambio allí debe dejar **idéntica** la
  impresión de acta y nómina (ver método en el brief) o ir aprobado expresamente.
- La nueva estructura (barra lateral, cabecera, menú) se oculta al imprimir: añadir sus selectores a
  la lista `display: none` de `@media print`.
- **No cambiar el contenido del documento oficial** (texto, sellos, iconos, firmas) sin aprobación:
  el `seal-emblem` con emojis deportivos y los emojis de incidencias del acta quedan como pregunta
  abierta para la Liga (debería usar el escudo real).
- El botón «🖨️ Imprimir / Guardar PDF» de la barra de herramientas (fuera de la hoja) sí puede usar `Icon`.

## 16. Escritura

Español de Ecuador, caja de oración, voz activa, verbos concretos («Guardar cambios», no «Enviar»);
la acción se nombra igual en botón y confirmación («Anular carné» → «Se anuló el carné»). Errores sin
disculpas y con salida. Vacíos que invitan a actuar. Sin mayúsculas sostenidas, sin emojis, sin
textos de relleno.
