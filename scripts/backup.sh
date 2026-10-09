#!/bin/bash
set -euo pipefail

# Script de respaldo para la base de datos de la Liga Cantonal de Quero
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUPS_DIR="${ROOT_DIR}/backups"

mkdir -p "${BACKUPS_DIR}"

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
DB_USER="${POSTGRES_USER:-liga}"
DB_NAME="${POSTGRES_DB:-liga_quero}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5434}"
BACKUP_FILE="${BACKUPS_DIR}/backup_${DB_NAME}_${TIMESTAMP}.sql"

echo "Iniciando respaldo de ${DB_NAME}..."

if command -v pg_dump >/dev/null 2>&1; then
  PGPASSWORD="${POSTGRES_PASSWORD:-}" pg_dump -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists --no-owner --no-privileges -f "${BACKUP_FILE}"
elif docker ps --format '{{.Names}}' | grep -q "liga-db-1"; then
  docker exec -i liga-db-1 pg_dump -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists --no-owner --no-privileges > "${BACKUP_FILE}"
else
  echo "Error: No se encontró pg_dump ni el contenedor docker liga-db-1." >&2
  exit 1
fi

sha256sum "${BACKUP_FILE}" > "${BACKUP_FILE}.sha256"
echo "✔ Respaldo completado: ${BACKUP_FILE}"
echo "✔ Checksum generado: ${BACKUP_FILE}.sha256"
