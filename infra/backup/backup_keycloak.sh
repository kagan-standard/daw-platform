#!/usr/bin/env bash
set -euo pipefail

TS="$(date +%Y%m%d_%H%M%S)"
OUT="/opt/backups/keycloak_${TS}.sql.gz"
LOG="/var/log/daw/backup.log"

# Adjust user/db if your compose uses different values.
DB_USER="${KEYCLOAK_DB_USER:-keycloak}"
DB_NAME="${KEYCLOAK_DB_NAME:-keycloak}"

echo "[$(date -Is)] keycloak backup start -> ${OUT}" | tee -a "$LOG"
docker exec -i keycloak-db pg_dump -U "$DB_USER" "$DB_NAME" | gzip -9 > "$OUT"
echo "[$(date -Is)] keycloak backup done" | tee -a "$LOG"
