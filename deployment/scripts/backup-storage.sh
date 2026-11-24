#!/usr/bin/env bash
# ==============================================================================
# PrintFlow Object Storage (MinIO / S3) Backup Script
# Synchronizes customer documents storage bucket to encrypted backup location
# ==============================================================================

set -euo pipefail

STORAGE_BACKUP_DIR="${STORAGE_BACKUP_DIR:-/var/backups/printflow/storage}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BUCKET_NAME="${AWS_BUCKET:-printflow-storage}"
ENDPOINT="${AWS_ENDPOINT:-http://minio:9000}"
ACCESS_KEY="${AWS_ACCESS_KEY_ID:-printflow_admin}"
SECRET_KEY="${AWS_SECRET_ACCESS_KEY:-printflow_secret}"

mkdir -p "${STORAGE_BACKUP_DIR}"

echo "[$(date -u)] Starting MinIO storage sync for bucket: ${BUCKET_NAME}..."

# Setup MinIO client alias
if command -v mc >/dev/null 2>&1; then
  mc alias set local "${ENDPOINT}" "${ACCESS_KEY}" "${SECRET_KEY}" --api S3v4
  mc mirror --overwrite --remove "local/${BUCKET_NAME}" "${STORAGE_BACKUP_DIR}/latest"
  echo "[$(date -u)] Storage mirror completed successfully to ${STORAGE_BACKUP_DIR}/latest"
elif command -v aws >/dev/null 2>&1; then
  aws --endpoint-url="${ENDPOINT}" s3 sync "s3://${BUCKET_NAME}" "${STORAGE_BACKUP_DIR}/latest"
  echo "[$(date -u)] AWS S3 sync completed successfully."
else
  echo "[$(date -u)] WARNING: Neither 'mc' nor 'aws' CLI found. Skipping mirror."
fi
