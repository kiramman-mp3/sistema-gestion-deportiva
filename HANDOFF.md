# Traspaso del proyecto — Liga Cantonal de Quero

Fecha: 2026-10-09. Documento para que otro agente (o persona) continúe el trabajo.
Lee también `CLAUDE.md` (flujo Git obligatorio), `requirements.md`, `docs/decisions.md` y `docs/roadmap.md`.

## Reglas que hay que respetar

- **Git** (ver `CLAUDE.md`): nunca trabajar sobre `main`. Ramas `feature/*`, `fix/*`, `refactor/*`, `chore/*` desde `develop`.
  Commits pequeños con Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `ci:`…).
  Integrar con `git merge --no-ff` a `develop`. **No mergear a `main` sin que el usuario lo pida.**
- **Autoría**: usar solo la identidad Git ya configurada. **Sin** `Co-Authored-By` ni ninguna atribución de IA en los commits. No tocar `user.name`/`user.email`.
- Nada de `git reset --hard`, `git clean -fd` ni `push --force` sobre `main`/`develop`.
- Las decisiones nuevas se documentan en `docs/decisions.md` (la última es **D-93**; seguir con D-94).
- No tocar los servidores dev del usuario: **API en 3000, web en 5173**. Los e2e usan API **3100** y web **5183**.

## Estado actual

### Hecho e integrado en `develop` (con pruebas)

Configuración institucional, notificaciones, árbitros y designaciones, disciplina, noticias y portal público multipágina,
reportes PDF/CSV, carnés y certificados con verificación pública, seed demo
(`npm run db:seed:demo -w @liga/api -- --confirm`), correcciones de seguridad (aprobación de actas con separación de
funciones — D-72; ocultar nombres de menores en lo público — D-85). Decisiones D-55 a D-93.
Última verificación completa: 565 pruebas de integración, 168 web, 89 unitarias, build OK.

### En curso: rama `feature/e2e-playwright`

- Commiteado: Playwright 1.63.0 + `@axe-core/playwright`, `playwright.config.ts` (API 3100, web 5183, BD `liga_quero_e2e`),
  `e2e/prepare.mjs` (prepara la BD e2e), `e2e/support.ts` (helpers), `e2e/auth.spec.ts` (4 pruebas, pasan).
- **Sin commitear y sin ejecutar todavía**: `e2e/portal.spec.ts`.

### Cómo correr los e2e

La descarga de Chromium de Playwright falla por red; se usa el Chrome instalado:

```bash
E2E_BROWSER=chrome npm run test:e2e        # build API + prepare BD + playwright test
E2E_BROWSER=chrome npm run test:e2e:run    # solo playwright test (si ya está preparado)
npm run typecheck:e2e
```

## Lo que toca hacer (en orden)

1. **portal.spec.ts**: ejecutarlo, corregir lo que falle y commitear (`test: add public portal e2e specs`).
2. **Specs de flujos** (un archivo y un commit por flujo, reutilizando `e2e/support.ts`):
   - Comisión designa árbitro → árbitro confirma y registra acta → comisión aprueba → resultado visible en el portal.
     (Recordar D-72: quien registra no puede aprobar, y no se aprueban borradores.)
   - Editor publica una noticia → aparece en el portal.
   - Reclamo → expediente disciplinario → resolución publicada (solo tras activar el parámetro correspondiente en configuración).
   - Carné: emitir → descargar PDF → verificación pública → anular → la verificación lo muestra anulado.
   - Reportes: descarga de CSV y PDF.
   - Notificaciones: se generan y se marcan como leídas.
   - Accesibilidad con axe en las páginas principales (públicas y panel).
   - Seguridad por rol: cada rol no puede entrar a pantallas/acciones ajenas; lo público no muestra nombres de menores (D-85).
3. **CI**: añadir un job e2e en `.github/workflows/ci.yml` con servicio Postgres y `npx playwright install --with-deps chromium`
   (en CI sí se usa Chromium, no `E2E_BROWSER=chrome`). Commit `ci: ...`.
4. **Documentación**: actualizar `docs/roadmap.md` (marcar módulos hechos, quitar "Pendiente de la especificación") y `README.md`
   (cómo correr e2e). Commit `docs: ...`.
5. **Verificación completa**: `npm run verify` y los e2e. Corregir errores con commits separados.
6. **Integrar**: `git checkout develop && git merge --no-ff feature/e2e-playwright && git branch -d feature/e2e-playwright`.
7. **Resumen final** con el formato de `CLAUDE.md` (Branch / Commits realizados / Verificaciones Tests-Linter-Build).

## Pendiente del lado de la Liga (no es código)

Están como preguntas abiertas en `docs/decisions.md`: matriz real de roles, formatos oficiales de carné y reglamento disciplinario.
El ensayo de restauración de backups (`npm run db:restore`) se hará antes de pasar a producción, no ahora.
