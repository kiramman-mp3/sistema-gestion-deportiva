#!/bin/bash
set -euo pipefail

# Script de restauración para la base de datos de la Liga Cantonal de Quero
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUPS_DIR="${ROOT_DIR}/backups"

TARGET_FILE="${1:-}"

if [ -z "${TARGET_FILE}" ]; then
  TARGET_FILE=$(ls -t "${BACKUPS_DIR}"/backup_*.sql 2>/dev/null | head -n 1)
  if [ -z "${TARGET_FILE}" ]; then
    echo "Error: No se encontró ningún archivo de respaldo en ${BACKUPS_DIR}" >&2
    exit 1
  fi
fi

if [ ! -f "${TARGET_FILE}" ]; then
  echo "Error: Archivo no encontrado: ${TARGET_FILE}" >&2
  exit 1
fi

if [ -f "${TARGET_FILE}.sha256" ]; then
  echo "Verificando integridad SHA256..."
  sha256sum -c "${TARGET_FILE}.sha256"
fi

DB_USER="${POSTGRES_USER:-liga}"
DB_NAME="${RESTORE_DB:-${POSTGRES_DB:-liga_quero}}"
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5434}"

echo "Restaurando base de datos ${DB_NAME} desde ${TARGET_FILE}..."

if command -v psql >/dev/null 2>&1; then
  PGPASSWORD="${POSTGRES_PASSWORD:-}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -f "${TARGET_FILE}"
elif docker ps --format '{{.Names}}' | grep -q "liga-db-1"; then
  docker exec -i liga-db-1 psql -U "${DB_USER}" -d "${DB_NAME}" < "${TARGET_FILE}"
else
  echo "Error: No se encontró psql ni el contenedor docker liga-db-1." >&2
  exit 1
fi

echo "✔ Base de datos ${DB_NAME} restaurada exitosamente."
