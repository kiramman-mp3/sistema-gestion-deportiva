# Sistema Integral de la Liga Cantonal de Quero

Plataforma de gestión deportiva (sistema privado + portal público) para la Liga Cantonal de Quero, Tungurahua, Ecuador. Especificación completa en [`docs/requirements.md`](docs/requirements.md); reglas de trabajo y Git en [`CLAUDE.md`](CLAUDE.md).

## Estructura

```text
apps/
  api/   NestJS + TypeScript + Prisma/PostgreSQL (API REST, OpenAPI en /api/docs)
  web/   React + TypeScript + Vite
docs/    Requisitos, decisiones técnicas y hoja de ruta
```

`packages/` queda reservado para código compartido (`shared`, `config`) cuando haga falta.

## Requisitos

- Node.js 22 o superior y npm
- Docker (para PostgreSQL local)

## Puesta en marcha

**Demostración con un solo comando:** `node start.js` (requiere Node >= 22.12 y Docker). Crea `.env` si falta, instala
dependencias, levanta PostgreSQL, migra, carga los datos de demostración si no están y arranca la API (3000) y la web (5173).
Se puede repetir sin riesgo; `Ctrl+C` detiene la API y la web. Pasos manuales:

```bash
npm install
cp .env.example .env              # reemplazar cambiar-… (contraseña de PostgreSQL y SECURITY_HASH_KEY)
docker compose up -d db           # PostgreSQL en 127.0.0.1:5432 (ver POSTGRES_PORT)
npm run db:deploy -w @liga/api    # migraciones
npm run db:seed -w @liga/api      # permisos y rol superadmin
npm run db:seed:provisional -w @liga/api   # opcional: deportes y categorías provisionales (no sobrescribe)
npm run admin:create-superadmin -w @liga/api   # primer superadministrador (interactivo)
npm run dev:api                   # http://localhost:3000/api/health/ready
npm run dev:web                   # http://localhost:5173
```

Detalles de la base de datos, variables de entorno y flujo de migraciones: [`docs/database.md`](docs/database.md).

### Datos de demostración

Para probar la aplicación a mano con los mismos datos que usan las pruebas e2e (clubes, deportistas,
campeonatos con partidos, árbitros, expedientes, noticias y cuentas por rol) en la base de `.env`:

```bash
npm run db:backup                     # respaldo previo: la carga no se puede deshacer
npm run seed                          # muestra a qué base apunta y no cambia nada
npm run seed -- --confirm             # carga los datos (si ya están cargados, no hace nada)
npm run seed -- --deactivate-users    # al terminar: desactiva las cuentas de prueba
```

Las cuentas son `secretaria@demo.liga.invalid`, `comision.tecnica@…`, `disciplinaria@…`, `editor@…`,
`arbitro1@…`, `dirigente1@…`, etc. Su contraseña es la de `DEMO_USER_PASSWORD` o, si no se define, una
generada que se muestra una sola vez. Detalle en [`docs/demo-data.md`](docs/demo-data.md).

## Verificación

```bash
npm run verify   # formato, lint, tipos, pruebas unitarias y de integración, build
```

Cada comprobación también está disponible por separado: `format:check`, `lint`, `typecheck`, `test`, `test:integration`, `build`. Las pruebas de integración requieren PostgreSQL en marcha y `TEST_DATABASE_URL` (base `*_test`, aislada).

## Pruebas End-to-End (E2E) con Playwright

Las pruebas end-to-end verifican flujos completos en el navegador: autenticación, portal público multipágina, designación y actas de árbitros (D-72), noticias, disciplina y resoluciones, emisión y verificación pública de carnés, reportes PDF y CSV, notificaciones, auditoría de accesibilidad con axe-core y separación de roles RBAC con protección de la privacidad de menores (D-85).

### Puertos y aislamiento de entorno

Para proteger el entorno de desarrollo y evitar colisiones:

- **API E2E**: puerto `3100`.
- **Web E2E**: puerto `5183`.
- **Base de datos E2E**: `liga_quero_e2e` (recreada de forma aislada por `e2e/prepare.mjs`, nunca toca la base de desarrollo `liga_quero`).

### Preparación y ejecución

```bash
# 1. Instalar dependencias
npm install

# 2. Instalar Chromium para Playwright (en CI o local)
npx playwright install --with-deps chromium

# 3. Comprobar tipos de las pruebas E2E
npm run typecheck:e2e

# 4. Preparar la base E2E y ejecutar toda la suite
npm run test:e2e
```

### Ejecución con Chrome local

Si en el equipo local no se descargó el Chromium de Playwright por restricciones de red, se puede utilizar el Google Chrome instalado en el sistema:

- **PowerShell (Windows)**:
  ```powershell
  $env:E2E_BROWSER="chrome"; npm run test:e2e
  ```
- **Bash / Linux / macOS**:
  ```bash
  E2E_BROWSER=chrome npm run test:e2e
  ```

### Ejecutar solo las pruebas con base ya preparada

```bash
# Toda la suite
npm run test:e2e:run

# Una especificación concreta (PowerShell con Chrome local):
$env:E2E_BROWSER="chrome"; npx playwright test e2e/portal.spec.ts
```

### Informes de pruebas

- **Terminal**: reporte en lista con duración y estado de cada prueba.
- **Informe HTML**: generado en `playwright-report/index.html`. Para visualizarlo:
  ```bash
  npx playwright show-report
  ```
- **Artefactos de fallo**: capturas de pantalla y trazas guardadas en `test-results/`.

### Diagnóstico de fallos comunes

- **Fallo al crear la base de datos**: Verifique que PostgreSQL esté corriendo y que `DATABASE_URL` apunte a una instancia donde el usuario tenga privilegios para crear bases de datos (`adminUrl` apunta a `/postgres`).
- **Error «Executable doesn't exist»**: Indique el Chrome del sistema con `E2E_BROWSER=chrome` o instale Chromium con `npx playwright install chromium`.
- **Conflicto de puertos**: Si los puertos 3100 o 5183 están ocupados, verifique que no hayan quedado servidores huérfanos antes de iniciar.

## Interfaz de usuario y diseño accesible

La interfaz web (`apps/web`) cuenta con un sistema de diseño propio y accesible basado en tokens CSS nativos:

- **Identidad visual**: Paleta institucional basada en páramo (`--color-brand`), acento dorado (`--color-accent`), superficies adaptativas y tipografías locales WOFF2 (_Barlow Condensed_ para marcadores/títulos y _Atkinson Hyperlegible Next_ para lectura).
- **Modo oscuro automático**: Sigue la preferencia del sistema (`prefers-color-scheme: dark`) con contraste verificado AA (≥ 4.5:1) en todas las pantallas.
- **Navegación responsiva**: Panel lateral modal (`NavDrawer`) con trampa de foco y atajo `Escape` por debajo de 64 rem (1024 px). Sin desbordamiento horizontal en 320, 375, 768, 1024 y 1280 px.
- **Tablero de inicio administrativo**: Inicio por bloques funcionales condicionados por permisos reales (`AdminHome`), evitando llamadas no autorizadas y optimizando las tareas frecuentes según rol.
- **Portal público**: Multipágina con rutas directas (`#/portal/competencias/<id>`, `#/portal/noticias/<slug>`, etc.), tablas de posiciones con formas accesibles para tarjetas y un único `h1` por vista sin saltos de nivel (comprobado en e2e).
- **Documentos oficiales idénticos**: Impresión de actas y nóminas en hoja A4 (`apps/web/src/styles/print.css`), aislada de los estilos de pantalla y protegida contra regresiones (D-53).
- **Auditoría continua**: Validada con `@axe-core/playwright` (0 violaciones en modo claro y oscuro, a 375 y 1280 px) y prueba estática de clases CSS (`styles.spec.ts`), que además impide dar estilos de pantalla a las clases del documento oficial.

## Documentación

- [`docs/requirements.md`](docs/requirements.md): especificación funcional y técnica.
- [`docs/authentication.md`](docs/authentication.md): sesiones, cookies, CSRF, permisos, primer superadministrador y auditoría de seguridad.
- [`docs/administration.md`](docs/administration.md): usuarios, roles y permisos (protección contra escalada), contraseñas, enlaces de activación y auditoría consultable.
- [`docs/catalogs.md`](docs/catalogs.md): administración de deportes, categorías y temporadas (API, permisos, interfaz y reglas).
- [`docs/clubs-people-teams.md`](docs/clubs-people-teams.md): clubes, deportistas (niveles de privacidad, consentimientos, perfil público), equipos, plantillas y transferencias.
- [`docs/database.md`](docs/database.md): esquema, convenciones, migraciones y modelo de participantes.
- [`docs/decisions.md`](docs/decisions.md): decisiones técnicas, discrepancias y preguntas pendientes para la Liga.
- [`docs/institution.md`](docs/institution.md): datos de la Liga, logotipo, textos públicos y parámetros de publicación.
- [`docs/notifications.md`](docs/notifications.md): avisos dentro del sistema, cola de correo y privacidad de los mensajes.
- [`docs/officials.md`](docs/officials.md): árbitros y jueces, disponibilidad, designaciones con conflictos e historial.
- [`docs/discipline.md`](docs/discipline.md): incidencias, reclamos, expedientes, sanciones y publicación de resoluciones.
- [`docs/content-portal.md`](docs/content-portal.md): noticias, comunicados, imágenes y páginas del portal público.
- [`docs/reports.md`](docs/reports.md): reportes PDF y CSV, carnés, certificados y verificación pública.
- [`docs/demo-data.md`](docs/demo-data.md): datos de demostración y cuentas de prueba (`db:seed:demo`).
- [`docs/deployment.md`](docs/deployment.md): despliegue en producción (servidor, variables de entorno, servicio systemd, Nginx con SSL y verificación).
- [`docs/backup-restore.md`](docs/backup-restore.md): copias de seguridad y restauración verificada (`db:backup` / `db:restore`).
- [`docs/user-manual.md`](docs/user-manual.md): manual de usuario del sistema privado y del portal público.
- [`docs/roadmap.md`](docs/roadmap.md): estado de implementación por fase y alcance pendiente.
- [`docs/roadmap-frontend.md`](docs/roadmap-frontend.md): hoja de ruta del rediseño de interfaz, fases y pruebas de accesibilidad.
