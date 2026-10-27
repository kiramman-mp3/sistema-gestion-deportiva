#!/usr/bin/env node
// Arranque de la demostración con un solo comando: `node start.js`
//
// Hace, en orden y de forma repetible (se puede ejecutar las veces que haga falta):
//   1. Comprueba Node y Docker.
//   2. Crea .env con secretos aleatorios si no existe.
//   3. Instala dependencias si faltan o si cambió package-lock.json.
//   4. Levanta PostgreSQL con Docker y espera a que esté sano.
//   5. Aplica migraciones, genera el cliente y compila la API.
//   6. Carga los datos de demostración si todavía no están.
//   7. Arranca la API (3000) y la web (5173) y muestra las cuentas.
//
// Ctrl+C detiene la API y la web. La base de datos sigue en Docker (`docker compose down` la detiene).

import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const IS_WIN = process.platform === 'win32';
const ENV_FILE = join(ROOT, '.env');
const API_URL = 'http://localhost:3000/api/health/ready';
const WEB_URL = 'http://localhost:5173';
const DEMO_PASSWORD = 'Demo-Quero-2026';
const DEMO_ACCOUNTS = [
  ['secretaria@demo.liga.invalid', 'Secretaría (clubes, deportistas, carnés)'],
  [
    'comision.tecnica@demo.liga.invalid',
    'Comisión técnica (campeonatos, designaciones, actas)',
  ],
  ['disciplinaria@demo.liga.invalid', 'Comisión disciplinaria (expedientes)'],
  ['editor@demo.liga.invalid', 'Editor (noticias)'],
  ['arbitro1@demo.liga.invalid', 'Árbitro (mis designaciones, actas)'],
  ['dirigente1@demo.liga.invalid', 'Dirigente de club'],
];

const c = (code, text) =>
  process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text;
const step = (n, text) => console.log(`\n${c('36;1', `[${n}/7]`)} ${text}`);
const info = (text) => console.log(`      ${text}`);

function fail(message) {
  console.error(`\n${c('31;1', 'ERROR:')} ${message}\n`);
  process.exit(1);
}

/** Ejecuta un comando y espera. Con `capture` devuelve su salida en vez de mostrarla. */
function run(command, args, { capture = false, env = {} } = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    shell: IS_WIN, // npm es npm.cmd en Windows
    env: { ...process.env, ...env },
  });
  return result;
}

function runOrFail(label, command, args, options) {
  const result = run(command, args, options);
  if (result.status !== 0)
    fail(`${label} falló (código ${result.status ?? 'desconocido'}).`);
  return result;
}

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function portFree(port) {
  return new Promise((resolve) => {
    const server = net
      .createServer()
      .once('error', () => resolve(false))
      .once('listening', () => server.close(() => resolve(true)))
      .listen(port);
  });
}

async function waitFor(url, label, timeoutMs, isAlive) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive())
      fail(
        `${label} se detuvo antes de estar listo. Revise los mensajes de arriba.`,
      );
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // aún no responde
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  fail(`${label} no respondió en ${Math.round(timeoutMs / 1000)} s (${url}).`);
}

// ---------------------------------------------------------------- 1. requisitos
step(1, 'Comprobando requisitos');
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  fail(`Se requiere Node >= 22.12 (tiene ${process.versions.node}).`);
}
info(`Node ${process.versions.node}`);

if (run('docker', ['--version'], { capture: true }).status !== 0) {
  fail(
    'Docker no está instalado o no está en el PATH. Instale Docker Desktop.',
  );
}
const dockerUp = () => run('docker', ['info'], { capture: true }).status === 0;
if (!dockerUp()) {
  const desktop = IS_WIN
    ? [
        join(
          process.env.LOCALAPPDATA ?? '',
          'Programs',
          'DockerDesktop',
          'Docker Desktop.exe',
        ),
        join(
          process.env.ProgramFiles ?? '',
          'Docker',
          'Docker',
          'Docker Desktop.exe',
        ),
      ].find(existsSync)
    : undefined;
  if (!desktop) {
    fail(
      'Docker está instalado pero no está en ejecución. Inicie Docker y repita.',
    );
  }
  info(
    'Docker no está en ejecución: iniciando Docker Desktop (puede tardar un par de minutos)…',
  );
  spawn(desktop, [], { detached: true, stdio: 'ignore' }).unref();
  const deadline = Date.now() + 240_000;
  while (!dockerUp()) {
    if (Date.now() > deadline)
      fail('Docker Desktop no arrancó en 4 minutos. Ábralo a mano y repita.');
    await new Promise((r) => setTimeout(r, 3000));
  }
}
info('Docker en ejecución');

// ---------------------------------------------------------------- 2. .env
step(2, 'Configuración (.env)');
if (existsSync(ENV_FILE)) {
  info('.env ya existe: se usa tal cual');
} else {
  const dbPassword = randomBytes(18).toString('base64url');
  const hashKey = randomBytes(32).toString('base64url');
  const example = readFileSync(join(ROOT, '.env.example'), 'utf8')
    .replaceAll('cambiar-esta-clave', dbPassword)
    .replace('cambiar-este-valor-por-un-secreto-largo-y-aleatorio', hashKey);
  writeFileSync(
    ENV_FILE,
    `${example.trimEnd()}\n\n# --- Demostración (start.js) ---\nDEMO_USER_PASSWORD=${DEMO_PASSWORD}\n`,
  );
  info('.env creado con secretos aleatorios');
}
const env = parseEnv(readFileSync(ENV_FILE, 'utf8'));
for (const key of [
  'DATABASE_URL',
  'SECURITY_HASH_KEY',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DB',
]) {
  if (!env[key] || env[key].startsWith('cambiar-')) {
    fail(`Falta ${key} (o conserva el valor «cambiar-…») en .env.`);
  }
}
const demoPassword = env.DEMO_USER_PASSWORD ?? null;

// ---------------------------------------------------------------- 3. dependencias
step(3, 'Dependencias');
const lock = join(ROOT, 'package-lock.json');
const marker = join(ROOT, 'node_modules', '.package-lock.json');
const stale =
  !existsSync(marker) ||
  statSync(lock).mtimeMs > statSync(marker).mtimeMs + 1000;
if (stale) {
  info('Ejecutando npm install…');
  runOrFail('npm install', 'npm', ['install', '--no-audit', '--no-fund']);
} else {
  info('node_modules al día');
}

// ---------------------------------------------------------------- 4. base de datos
step(4, 'PostgreSQL (Docker)');
runOrFail('docker compose up', 'docker', [
  'compose',
  'up',
  '-d',
  '--wait',
  'db',
]);
info('PostgreSQL listo');

// ---------------------------------------------------------------- 5. migraciones y build
step(5, 'Migraciones y compilación de la API');
runOrFail('prisma migrate deploy', 'npm', [
  'run',
  'db:deploy',
  '-w',
  '@liga/api',
]);
runOrFail('build de la API', 'npm', ['run', 'build', '-w', '@liga/api']);

// ---------------------------------------------------------------- 6. datos demo
step(6, 'Datos de demostración');
// La carga es idempotente: si ya hay cuentas @demo.liga.invalid no hace nada.
const seed = run(
  'npm',
  ['run', 'db:seed:demo', '-w', '@liga/api', '--', '--confirm'],
  {
    capture: true,
  },
);
const seedOut = `${seed.stdout ?? ''}${seed.stderr ?? ''}`;
if (seed.status !== 0) {
  console.error(seedOut);
  fail('La carga de datos de demostración falló.');
}
const alreadyLoaded = /ya est[aá]n cargados/i.test(seedOut);
info(alreadyLoaded ? 'Ya estaban cargados: no se tocó nada' : 'Datos cargados');
let generatedPassword = null;
if (!alreadyLoaded && !demoPassword) {
  generatedPassword =
    /Contraseña de TODAS las cuentas:\s*(\S+)/.exec(seedOut)?.[1] ?? null;
}

// ---------------------------------------------------------------- 7. servicios
step(7, 'Iniciando API y web');
for (const [port, name] of [
  [3000, 'la API'],
  [5173, 'la web'],
]) {
  if (!(await portFree(port))) {
    fail(
      `El puerto ${port} (${name}) está ocupado. Cierre lo que lo usa y repita.`,
    );
  }
}

const children = [];
function launch(name, args, color) {
  const child = spawn('npm', args, {
    cwd: ROOT,
    shell: IS_WIN,
    detached: !IS_WIN, // grupo propio para poder cerrar el árbol en POSIX
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tag = c(color, `[${name}]`);
  const forward = (stream, out) =>
    stream.on('data', (chunk) => {
      for (const line of String(chunk).split(/\r?\n/))
        if (line.trim()) out(`${tag} ${line}`);
    });
  forward(child.stdout, console.log);
  forward(child.stderr, console.error);
  child.alive = true;
  child.on('exit', () => (child.alive = false));
  children.push(child);
  return child;
}

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  console.log('\nDeteniendo API y web…');
  for (const child of children) {
    if (!child.alive) continue;
    try {
      if (IS_WIN)
        spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
        });
      else process.kill(-child.pid, 'SIGTERM');
    } catch {
      // ya terminó
    }
  }
  console.log(
    'La base de datos sigue en Docker. Para detenerla: docker compose down',
  );
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const api = launch('api', ['run', 'start:prod', '-w', '@liga/api'], '35');
const web = launch('web', ['run', 'dev:web'], '33');

await waitFor(API_URL, 'La API', 60_000, () => api.alive);
await waitFor(WEB_URL, 'La web', 60_000, () => web.alive);

const password = demoPassword ?? generatedPassword;
console.log(`
${c('32;1', '============================================================')}
${c('32;1', ' Sistema listo para la demostración')}
${c('32;1', '============================================================')}
  Web:  ${WEB_URL}            (inicio de sesión: ${WEB_URL}/#/ingresar)
  API:  http://localhost:3000/api

  Cuentas de prueba (misma contraseña para todas):`);
for (const [email, role] of DEMO_ACCOUNTS)
  console.log(`    ${email.padEnd(38)} ${role}`);
console.log(
  `\n  Contraseña: ${
    password ??
    '(los datos ya existían con otra contraseña; defina DEMO_USER_PASSWORD o restaure el respaldo)'
  }\n\n  Ctrl+C para detener.\n`,
);

for (const child of children) {
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`\nUn servicio terminó inesperadamente (código ${code}).`);
      shutdown(1);
    }
  });
}
