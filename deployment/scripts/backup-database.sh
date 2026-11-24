#!/usr/bin/env bash
# ==============================================================================
# PrintFlow Production Database Backup Script
# Automated mysqldump with gzip compression and retention rotation
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/printflow/mysql}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/printflow_db_${TIMESTAMP}.sql.gz"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

DB_HOST="${DB_HOST:-mysql}"
DB_PORT="${DB_PORT:-3306}"
DB_NAME="${DB_DATABASE:-printflow}"
DB_USER="${DB_USERNAME:-printflow}"
DB_PASS="${DB_PASSWORD:-secret}"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -u)] Starting PrintFlow database backup..."
echo "[$(date -u)] Target database: ${DB_NAME} at ${DB_HOST}:${DB_PORT}"

# Execute mysqldump with transactional consistency
mysqldump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --user="${DB_USER}" \
  --password="${DB_PASS}" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  --default-character-set=utf8mb4 \
  "${DB_NAME}" | gzip -9 > "${BACKUP_FILE}"

# Verify integrity
if gzip -t "${BACKUP_FILE}"; then
  FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
  echo "[$(date -u)] Database backup completed successfully: ${BACKUP_FILE} (${FILE_SIZE})"
else
  echo "[$(date -u)] ERROR: Backup file integrity check failed!" >&2
  exit 1
fi

# Rotate older backups
echo "[$(date -u)] Pruning backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -type f -name "printflow_db_*.sql.gz" -mtime "+${RETENTION_DAYS}" -exec rm -f {} \;
echo "[$(date -u)] Pruning completed."
