# Backup & Restore Runbook (DAW)

## Backups

- keycloak-db and supabase-db backed up daily (e.g. to `/opt/backups` on server).
- Retention: e.g. keep last 7 daily, 4 weekly. Document path and retention in `runbooks/backup_restore.md`.
- Log backup runs (cron or script log) for audit.

## Restore (outline)

1. Take a fresh backup first.
2. Stop writers using explicit compose path:  
   `docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml stop <services>`
3. Restore DB from backup (see `runbooks/backup_restore.md` for exact commands).
4. Start services, run smoke tests.

## Validation

- List backups: `ls -la /opt/backups` (or your backup dir).
- Verify volumes: `docker inspect keycloak-db | jq '.[0].Mounts'` and same for `supabase-db` (expect named volumes).
