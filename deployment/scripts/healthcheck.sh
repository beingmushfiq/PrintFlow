#!/usr/bin/env bash
# ==============================================================================
# PrintFlow Production Health & Smoke Verification Script
# Verifies database, cache, storage, and web server connectivity
# ==============================================================================

set -euo pipefail

EXIT_CODE=0

echo "======================================================================"
echo " PrintFlow Production Health & Smoke Check"
echo " Date: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "======================================================================"

# 1. Database Connectivity Ping
echo -n "Checking MySQL Database... "
DB_HOST="${DB_HOST:-mysql}"
DB_USER="${DB_USERNAME:-printflow}"
DB_PASS="${DB_PASSWORD:-secret}"
if mysqladmin ping -h "${DB_HOST}" -u "${DB_USER}" -p"${DB_PASS}" --silent >/dev/null 2>&1; then
  echo "UP [PONG]"
else
  echo "FAILED"
  EXIT_CODE=1
fi

# 2. Redis Connectivity Ping
echo -n "Checking Redis Cache & Queue... "
REDIS_HOST="${REDIS_HOST:-redis}"
REDIS_PASS="${REDIS_PASSWORD:-redispassword}"
if [ -n "${REDIS_PASS}" ]; then
  REDIS_RESP=$(redis-cli -h "${REDIS_HOST}" -a "${REDIS_PASS}" ping 2>/dev/null || echo "FAIL")
else
  REDIS_RESP=$(redis-cli -h "${REDIS_HOST}" ping 2>/dev/null || echo "FAIL")
fi

if [[ "${REDIS_RESP}" == *"PONG"* ]]; then
  echo "UP [PONG]"
else
  echo "FAILED"
  EXIT_CODE=1
fi

# 3. MinIO S3 Object Storage Check
echo -n "Checking MinIO Storage Bucket... "
ENDPOINT="${AWS_ENDPOINT:-http://minio:9000}"
BUCKET="${AWS_BUCKET:-printflow-storage}"
if curl -s -f -o /dev/null -m 5 "${ENDPOINT}/minio/health/live" 2>/dev/null; then
  echo "UP [${BUCKET}]"
else
  echo "FAILED"
  EXIT_CODE=1
fi

# 4. HTTP API Health Check
echo -n "Checking Web API Health Endpoint... "
API_URL="${API_URL:-http://localhost/api/v1/health}"
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -m 5 "${API_URL}" 2>/dev/null || echo "000")
if [ "${API_STATUS}" -eq 200 ]; then
  echo "UP [HTTP 200]"
else
  echo "FAILED [HTTP ${API_STATUS}]"
  EXIT_CODE=1
fi

echo "======================================================================"
if [ "${EXIT_CODE}" -eq 0 ]; then
  echo "[SUCCESS] All system health checks passed cleanly (Exit 0)."
else
  echo "[FAILURE] One or more components failed health check."
fi
echo "======================================================================"

exit ${EXIT_CODE}
