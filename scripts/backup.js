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
const dbName = process.env.POSTGRES_DB || 'liga_quero';
const dbHost = process.env.POSTGRES_HOST || 'localhost';
const dbPort = process.env.POSTGRES_PORT || '5434';

// Crear directorio de respaldos
const backupsDir = path.join(rootDir, 'backups');
if (!fs.existsSync(backupsDir)) {
  fs.mkdirSync(backupsDir, { recursive: true });
}

const now = new Date();
const timestamp = now
  .toISOString()
  .replace(/[:.]/g, '-')
  .replace('T', '_')
  .slice(0, 19);

const outputFile = path.join(backupsDir, `backup_${dbName}_${timestamp}.sql`);

console.log('────────────────────────────────────────────────────────────');
console.log(' LIGA DEPORTIVA CANTONAL DE QUERO - RESPALDO DE BASE DE DATOS');
console.log('────────────────────────────────────────────────────────────');
console.log(`Base de datos : ${dbName}`);
console.log(`Usuario       : ${dbUser}`);
console.log(`Destino       : ${outputFile}`);
console.log('Iniciando volcado con pg_dump…');

// Comprobar si pg_dump está disponible localmente
const hasLocalPgDump = spawnSync('pg_dump', ['--version']).status === 0;

let dumpSuccess = false;

if (hasLocalPgDump) {
  try {
    execSync(
      `pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} --clean --if-exists --no-owner --no-privileges -f "${outputFile}"`,
      {
        env: { ...process.env, PGPASSWORD: dbPassword },
        stdio: 'inherit',
      },
    );
    dumpSuccess = true;
  } catch (err) {
    console.warn(
      'Fallo en pg_dump local, intentando a través del contenedor Docker…',
    );
  }
}

if (!dumpSuccess) {
  // Intentar mediante docker exec en el contenedor liga-db-1
  try {
    const dumpCmd = `docker exec -i liga-db-1 pg_dump -U ${dbUser} -d ${dbName} --clean --if-exists --no-owner --no-privileges`;
    const output = execSync(dumpCmd, { maxBuffer: 100 * 1024 * 1024 });
    fs.writeFileSync(outputFile, output);
    dumpSuccess = true;
  } catch (err) {
    console.error('Error al ejecutar pg_dump en el contenedor:', err.message);
    process.exit(1);
  }
}

if (dumpSuccess && fs.existsSync(outputFile)) {
  const fileBytes = fs.statSync(outputFile).size;
  const hash = createHash('sha256')
    .update(fs.readFileSync(outputFile))
    .digest('hex');

  const checksumFile = `${outputFile}.sha256`;
  fs.writeFileSync(checksumFile, `${hash}  ${path.basename(outputFile)}\n`);

  console.log('────────────────────────────────────────────────────────────');
  console.log('✔ Respaldo generado exitosamente');
  console.log(`  Tamaño   : ${(fileBytes / 1024).toFixed(2)} KB`);
  console.log(`  SHA256   : ${hash}`);
  console.log(`  Verif.   : ${checksumFile}`);
  console.log('────────────────────────────────────────────────────────────');
} else {
  console.error('No se pudo generar el archivo de respaldo.');
  process.exit(1);
}
