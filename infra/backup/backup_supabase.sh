#!/usr/bin/env bash
set -euo pipefail

TS="$(date +%Y%m%d_%H%M%S)"
OUT="/opt/backups/supabase_${TS}.sql.gz"
LOG="/var/log/daw/backup.log"

# Supabase postgres image typically uses postgres user by default.
DB_USER="${SUPABASE_DB_USER:-postgres}"
DB_NAME="${SUPABASE_DB_NAME:-postgres}"

echo "[$(date -Is)] supabase backup start -> ${OUT}" | tee -a "$LOG"
docker exec -i supabase-db pg_dump -U "$DB_USER" "$DB_NAME" | gzip -9 > "$OUT"
echo "[$(date -Is)] supabase backup done" | tee -a "$LOG"
