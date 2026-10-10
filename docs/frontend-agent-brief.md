# Brief para el agente: rediseño del frontend (fases 2 a 8)

Copia este documento como instrucción inicial del agente. Está pensado para una ejecución larga y
autónoma: completar **todas** las fases de [`roadmap-frontend.md`](roadmap-frontend.md) siguiendo
[`frontend-design-spec.md`](frontend-design-spec.md), sin esperar aprobación entre fases.

---

## Tu papel

Eres un agente de programación autónomo de larga duración que trabaja como un equipo senior de
producto: dirección de arte deportiva, UX/UI, sistema de diseño y arquitectura frontend. Implementas,
pruebas y verificas tú mismo; no te limitas a proponer. Trabajas por etapas pequeñas y verificables,
y no das nada por hecho sin haberlo ejecutado.

Tienes autorización del usuario para ejecutar las fases 2, 2b, 3, 4, 5, 6, 7 y 8 de una sola vez,
integrando cada una en `develop` cuando cumpla su lista de aceptación. **No** integras en `main`.

## Antes de tocar código

1. Lee completos: `CLAUDE.md` (flujo Git obligatorio), `docs/roadmap-frontend.md`,
   `docs/frontend-design-spec.md`, `docs/decisions.md` (D-53, D-56, D-58, D-72, D-80, D-82, D-85,
   D-94, D-95), `docs/roadmap.md` y las secciones 11–12 de `docs/requirements.md`.
2. Ignora `HANDOFF.md` (está desactualizado y sin seguimiento). **Nunca** lo añadas a un commit.
3. `git status` y `git branch`: parte de `develop` limpio. Si no lo está, detente y repórtalo.
4. Ejecuta la línea base y anótala: `npm run lint -w @liga/web`, `npm run typecheck -w @liga/web`,
   `npm run typecheck:e2e`, `npm run test -w @liga/web` (209), `npm run format:check`,
   `npm run build -w @liga/web`, `E2E_BROWSER=chrome npm run test:e2e` (41).

## Límites que no se cruzan

- No modificar `apps/api`, contratos de la API, sesión, autenticación, CSRF (`api/client.ts`,
  `AuthContext`), permisos, privacidad de menores (D-85), reglas de negocio, despliegue ni CSP.
- No añadir dependencias npm. Iconos: SVG en línea copiados de Lucide (licencia ISC, con aviso).
- No inventar datos: nada de resultados, clubes o cifras de ejemplo en la interfaz. Lo que no viene
  de la API no se muestra. No inventar ni sustituir el escudo institucional.
- No cambiar el contenido del documento oficial impreso (§15 de la spec).
- No eliminar módulos, permisos, validaciones ni flujos.
- No reescribir todo de golpe: cada etapa compila, pasa las pruebas y se ve bien antes de seguir.
- No ocultar fallos ni marcar como verificado algo que no ejecutaste.

Si una tarea exige cruzar uno de estos límites, **no lo hagas**: regístrala como pregunta abierta en
`docs/roadmap-frontend.md` (sección «Preguntas abiertas») y continúa con el resto del trabajo.

## Flujo Git (de `CLAUDE.md`, obligatorio)

- Una rama por fase desde `develop`: `feature/ui-shell`, `feature/ui-portal-home`,
  `feature/ui-components`, `feature/ui-forms-tables`, `feature/ui-admin`, `feature/ui-portal`,
  `fix/ui-a11y-polish` (fase 8 puede ir en `chore/ui-final-review`).
- Commits pequeños y coherentes con Conventional Commits (`feat:`, `fix:`, `refactor:`, `style:`,
  `test:`, `docs:`, `chore:`). Cada logro, su commit. No mezclar funcionalidad, correcciones y estilos.
- Usa solo la identidad Git configurada. **Sin** `Co-Authored-By` ni ninguna atribución a IA. No
  toques `user.name`/`user.email`.
- Al cerrar una fase verificada: `git checkout develop && git merge --no-ff <rama> && git branch -d <rama>`.
- Prohibido: `git reset --hard`, `git clean -fd`, `push --force`, commits en `main`, merge a `main`.
- Si una verificación falla tras el merge, se corrige en una rama `fix/*` nueva, no reescribiendo historia.

## Entorno

- Los servidores de desarrollo **del usuario** usan la API en 3000 y la web en 5173: no los
  detengas ni uses esos puertos.
- Para pruebas propias usa API 3100 y web 5183 (los mismos de Playwright). `npm run test:e2e`
  compila la API, recrea la base `liga_quero_e2e` con `e2e/prepare.mjs` y levanta ambos servidores.
- Para revisar a mano o con scripts, levanta los servidores así (y detenlos al terminar; comprueba que
  3100/5183 quedan libres antes de ejecutar los e2e, porque Playwright no reutiliza servidores):
  ```bash
  npm run build -w @liga/api && node e2e/prepare.mjs   # si la base no está preparada
  # API (lee DATABASE_URL de .env y cambia la base a liga_quero_e2e):
  set -a && . ./.env && set +a && export DATABASE_URL="${DATABASE_URL%/*}/liga_quero_e2e" \
    NODE_ENV=development API_PORT=3100 WEB_ORIGIN=http://localhost:5183 \
    SECURITY_HASH_KEY=e2e-only-hash-key-not-a-real-secret-0123456789 \
    STORAGE_PATH="$PWD/e2e/.storage" TRUST_PROXY=0 && node apps/api/dist/main.js
  # Web:
  API_PORT=3100 npm run dev -w @liga/web -- --port 5183 --strictPort
  ```
- Cuenta de administrador e2e: `admin@e2e.liga.invalid`, contraseña `e2e-demostracion-2026`
  (más cuentas en `e2e/support.ts`). Son datos de demostración, no reales.
- Navegador: `E2E_BROWSER=chrome` (la descarga de Chromium de Playwright falla por red).
- `npm run verify` tarda más de 60 min en esta máquina: usa los comandos por espacio de trabajo.
  Las pruebas de la API solo son necesarias si se tocara la API (no debe ocurrir).
- Los scripts auxiliares (capturas, comparaciones) van en una carpeta temporal fuera del repositorio
  o, si son pruebas reutilizables, en `e2e/` como specs. No dejes archivos sueltos en el repositorio.

## Cómo trabajar cada fase (bucle)

1. **Medir antes de cambiar.** Recalcula la deuda de la fase (clases sin estilo, emojis,
   `style={{`, hex, diálogos) y toma capturas de referencia de las rutas afectadas en 320, 375, 768,
   1024 y 1280 px, en claro y oscuro, con Playwright (`chromium.launch({ channel: 'chrome' })`).
2. **Inspeccionar antes de reemplazar.** Lee el componente actual, sus pruebas y los e2e que lo usan.
   Busca nombres accesibles y clases de los que dependen las pruebas (`grep` en `e2e/` y `*.spec.tsx`).
3. **Implementar en pasos pequeños.** Tras cada paso: lint, typecheck y las pruebas del módulo.
   Commit cuando el paso funciona.
4. **Escribir pruebas nuevas** para cada comportamiento nuevo (Vitest + Testing Library para
   componentes; Playwright para flujos, responsive, impresión y accesibilidad). Preferir consultas por
   rol y etiqueta. **Comprueba cada prueba nueva rompiéndola una vez a propósito** (cambia la condición
   que vigila y confirma que falla); restaura y confirma que vuelve a pasar.
5. **Verificar visualmente**: repite las capturas y compáralas con las de referencia. Revisa
   desbordes, palabras partidas de forma poco natural, contraste, foco visible, estados de carga, vacío
   y error, menús, diálogos y tablas largas. Registra errores de consola y solicitudes fallidas, y
   distingue los nuevos de los que ya existían (compara con `develop`).
6. **Clasificar cada fallo** como: regresión introducida, fallo preexistente en `develop` o problema del
   entorno. Corrige las regresiones con commits `fix:` separados. Los preexistentes fuera del alcance se
   registran en la sección de pendientes de `docs/roadmap.md`.
7. **Cerrar la fase** solo con su lista de aceptación cumplida y la verificación completa en verde
   (abajo). Merge `--no-ff` a `develop`, borra la rama, repite la verificación sobre `develop`, marca
   las casillas en `docs/roadmap-frontend.md` y `docs/roadmap.md` (commit `docs:`), y pasa a la siguiente.

## Verificación completa (cierre de cada fase y tras cada merge)

```bash
npm run lint -w @liga/web
npm run typecheck -w @liga/web
npm run typecheck:e2e
npm run test -w @liga/web
npm run format:check            # si falla: npx prettier --write <archivos tocados>
npm run build -w @liga/web
E2E_BROWSER=chrome npm run test:e2e
```

Además, en cada fase:

- **Recorrido de desbordes** en todas las rutas del panel y del portal (5 anchos). `e2e/desbordamiento.spec.ts`
  lo cubre; al corregir un pendiente, elimina su exclusión de ese archivo.
- **Impresión idéntica:** compara acta y nómina con la CSS de `develop` y con la nueva en la misma página:
  carga `#/imprimir/acta/<id>` (id de `GET /api/public/home` → `recent[0].id`) y
  `#/imprimir/nomina/<registrationId>` (de `GET /api/public/championships/:id/standings`), intercepta
  `/api/public/**` y fija `documentMetadata.generatedAt` (la fecha de emisión la pone el servidor),
  emula `media: 'print'`, captura `.institutional-sheet` y compara píxeles, geometría y tipografía de cada
  elemento y el número de páginas del PDF A4. Resultado esperado: 0 diferencias.
- **Modo oscuro**: capturas y, desde la fase 7, axe con `colorScheme: 'dark'`.
- **Consola**: sin errores nuevos. El 404 de `/favicon.ico` ya existe y está registrado.

## Criterio de terminado

Una fase está terminada cuando su lista de aceptación se ejecutó y pasa, la verificación completa está
en verde, las capturas se revisaron y no hay regresiones abiertas. **Compilar no es suficiente.** Si algo
no se pudo verificar, dilo explícitamente.

## Informe final (al terminar la fase 8 o si te detienes)

Entrega, por fase:

- archivos modificados y decisiones tomadas (y su número D-96 en adelante si se documentaron);
- comandos ejecutados y resultados reales (números de pruebas);
- pruebas nuevas y cómo comprobaste que detectan fallos;
- capturas antes/después de las pantallas principales (portada, login, inicio del panel, un listado,
  una ficha, un diálogo) en 375 y 1280 px, claro y oscuro;
- fallos encontrados, clasificados (introducido / preexistente / entorno) y su estado;
- preguntas abiertas y riesgos;
- hash del merge de cada fase.

Y el resumen obligatorio de `CLAUDE.md`:

```
Branch:
<rama actual>

Commits realizados:
- <commit 1>
- ...

Verificaciones:
- Tests: PASS/FAIL
- Linter: PASS/FAIL
- Build: PASS/FAIL
```
