#!/usr/bin/env bash
set -euo pipefail

LOG="/var/log/daw/backup.log"
DAYS="${RETENTION_DAYS:-14}"

echo "[$(date -Is)] retention start (keep ${DAYS} days)" | tee -a "$LOG"
find /opt/backups -type f -name "*.sql.gz" -mtime +"$DAYS" -print -delete | tee -a "$LOG"
echo "[$(date -Is)] retention done" | tee -a "$LOG"
