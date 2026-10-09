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

## Verificación

```bash
npm run verify   # formato, lint, tipos, pruebas unitarias y de integración, build
```

Cada comprobación también está disponible por separado: `format:check`, `lint`, `typecheck`, `test`, `test:integration`, `build`. Las pruebas de integración requieren PostgreSQL en marcha y `TEST_DATABASE_URL` (base `*_test`, aislada).

## Documentación

- [`docs/requirements.md`](docs/requirements.md): especificación funcional y técnica.
- [`docs/authentication.md`](docs/authentication.md): sesiones, cookies, CSRF, permisos, primer superadministrador y auditoría de seguridad.
- [`docs/administration.md`](docs/administration.md): usuarios, roles y permisos (protección contra escalada), contraseñas, enlaces de activación y auditoría consultable.
- [`docs/catalogs.md`](docs/catalogs.md): administración de deportes, categorías y temporadas (API, permisos, interfaz y reglas).
- [`docs/clubs-people-teams.md`](docs/clubs-people-teams.md): clubes, deportistas (niveles de privacidad, consentimientos, perfil público), equipos, plantillas y transferencias.
- [`docs/database.md`](docs/database.md): esquema, convenciones, migraciones y modelo de participantes.
- [`docs/decisions.md`](docs/decisions.md): decisiones técnicas, discrepancias y preguntas pendientes para la Liga.
- [`docs/roadmap.md`](docs/roadmap.md): estado de implementación por fase.
