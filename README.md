# Sistema Integral de la Liga Cantonal de Quero

Plataforma de gestión deportiva (sistema privado + portal público) para la Liga Cantonal de Quero, Tungurahua, Ecuador. Especificación completa en [`docs/requirements.md`](docs/requirements.md); reglas de trabajo y Git en [`CLAUDE.md`](CLAUDE.md).

## Estructura

```text
apps/
  api/   NestJS + TypeScript (API REST, OpenAPI en /api/docs)
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
cp .env.example .env        # y reemplazar las credenciales de ejemplo
docker compose up -d db     # PostgreSQL en 127.0.0.1:5432
npm run dev:api             # http://localhost:3000/api/health
npm run dev:web             # http://localhost:5173
```

## Verificación

```bash
npm run verify   # formato, lint, tipos, pruebas unitarias y e2e, build
```

Cada comprobación también está disponible por separado: `format:check`, `lint`, `typecheck`, `test`, `test:e2e`, `build`.

## Documentación

- [`docs/requirements.md`](docs/requirements.md): especificación funcional y técnica.
- [`docs/decisions.md`](docs/decisions.md): decisiones técnicas, discrepancias y preguntas pendientes para la Liga.
- [`docs/roadmap.md`](docs/roadmap.md): estado de implementación por fase.
