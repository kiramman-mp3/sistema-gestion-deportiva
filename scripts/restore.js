#!/usr/bin/env node
import { execSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Cargar variables de entorno desde .env si existe
function loadEnv() {
  const envPath = path.join(rootDir, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const dbUser = process.env.POSTGRES_USER || 'liga';
const dbPassword = process.env.POSTGRES_PASSWORD || '';
const dbName =
  process.env.RESTORE_DB || process.env.POSTGRES_DB || 'liga_quero';
const dbHost = process.env.POSTGRES_HOST || 'localhost';
const dbPort = process.env.POSTGRES_PORT || '5434';

const backupsDir = path.join(rootDir, 'backups');

// Identificar el archivo a restaurar
let targetFile = process.argv[2];

if (!targetFile) {
  if (!fs.existsSync(backupsDir)) {
    console.error('El directorio de respaldos no existe.');
    process.exit(1);
  }

  const files = fs
    .readdirSync(backupsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.error('No se encontraron archivos de respaldo (.sql) en backups/.');
    process.exit(1);
  }

  targetFile = path.join(backupsDir, files[0]);
}

if (!fs.existsSync(targetFile)) {
  console.error(`Archivo de respaldo no encontrado: ${targetFile}`);
  process.exit(1);
}

console.log('────────────────────────────────────────────────────────────');
console.log(' LIGA DEPORTIVA CANTONAL DE QUERO - RESTAURACIÓN DE BASE');
console.log('────────────────────────────────────────────────────────────');
console.log(`Base destino  : ${dbName}`);
console.log(`Archivo origen: ${targetFile}`);

// Verificar checksum si existe .sha256
const checksumFile = `${targetFile}.sha256`;
if (fs.existsSync(checksumFile)) {
  const expectedHash = fs
    .readFileSync(checksumFile, 'utf8')
    .trim()
    .split(/\s+/)[0];
  const actualHash = createHash('sha256')
    .update(fs.readFileSync(targetFile))
    .digest('hex');

  if (expectedHash !== actualHash) {
    console.error(
      '❌ Error de integridad: El SHA256 no coincide con el archivo de respaldo.',
    );
    console.error(`Esperado : ${expectedHash}`);
    console.error(`Obtenido : ${actualHash}`);
    process.exit(1);
  }
  console.log('✔ Verificación de integridad SHA256 superada.');
}

console.log('Iniciando restauración…');

// Comprobar si psql está disponible localmente
const hasLocalPsql = spawnSync('psql', ['--version']).status === 0;
let restoreSuccess = false;

if (hasLocalPsql) {
  try {
    execSync(
      `psql -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} -f "${targetFile}"`,
      {
        env: { ...process.env, PGPASSWORD: dbPassword },
        stdio: 'inherit',
      },
    );
    restoreSuccess = true;
  } catch (err) {
    console.warn(
      'Fallo con psql local, intentando a través del contenedor Docker…',
    );
  }
}

if (!restoreSuccess) {
  try {
    const inputContent = fs.readFileSync(targetFile);
    execSync(`docker exec -i liga-db-1 psql -U ${dbUser} -d ${dbName}`, {
      input: inputContent,
      maxBuffer: 100 * 1024 * 1024,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    restoreSuccess = true;
  } catch (err) {
    console.error('Error al restaurar a través del contenedor:', err.message);
    process.exit(1);
  }
}

console.log('────────────────────────────────────────────────────────────');
console.log('✔ Base de datos restaurada exitosamente.');
console.log('────────────────────────────────────────────────────────────');
