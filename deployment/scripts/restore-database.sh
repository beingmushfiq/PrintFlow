#!/usr/bin/env bash
# ==============================================================================
# PrintFlow Database Restore Script
# Restores MySQL database from a specified compressed backup archive
# ==============================================================================

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <path_to_backup_file.sql.gz>" >&2
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: Backup file not found: ${BACKUP_FILE}" >&2
  exit 1
fi

DB_HOST="${DB_HOST:-mysql}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_DATABASE:-printflow}"
DB_USER="${DB_USERNAME:-printflow}"
DB_PASS="${DB_PASSWORD:-secret}"

echo "[$(date -u)] Verifying integrity of ${BACKUP_FILE}..."
gzip -t "${BACKUP_FILE}"

echo "[$(date -u)] Restoring database ${DB_NAME} from ${BACKUP_FILE}..."
gunzip -c "${BACKUP_FILE}" | mysql \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USER}" \
  --password="${DB_PASS}" \
  "${DB_NAME}"

echo "[$(date -u)] Database restore completed successfully."
