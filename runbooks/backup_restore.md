# Backup & Restore — Phase 1

Two databases:

- **keycloak-db** — Keycloak (realm, users, clients).
- **supabase-db** — BeerBook data (profiles, ratings).

## Backup

### Keycloak DB

```bash
docker exec keycloak-db pg_dump -U keycloak keycloak > backup_keycloak_$(date +%Y%m%d_%H%M%S).sql
```

### Supabase DB

```bash
docker exec supabase-db pg_dump -U postgres postgres > backup_supabase_$(date +%Y%m%d_%H%M%S).sql
```

Store backups off the VM (e.g. S3, another server). Do not commit to git.

## Restore

### Keycloak DB

1. Stop Keycloak:  
   `docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml stop keycloak`
2. Restore:  
   `docker exec -i keycloak-db psql -U keycloak keycloak < backup_keycloak_YYYYMMDD_HHMMSS.sql`
3. Start Keycloak:  
   `docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml start keycloak`

### Supabase DB

1. Stop services that use Postgres:  
   `docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml stop supabase-rest supabase-realtime beerbook-api`
2. Restore:  
   `docker exec -i supabase-db psql -U postgres postgres < backup_supabase_YYYYMMDD_HHMMSS.sql`
3. Start again:  
   `docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml start supabase-rest supabase-realtime beerbook-api`

## Schedule and retention

- Daily dumps (cron) to `/opt/backups` (or chosen path). Document actual path in this runbook when set.
- Retention: e.g. keep last 7 daily, 4 weekly. Prune with cron or script; do not commit backups to git.
- Logs: ensure cron or backup script logs to a known path (e.g. `/var/log/daw-backup.log`) for audit.

## Validation commands (VPS)

- List recent backups: `ls -la /opt/backups` (or your backup dir).
- Verify DB volume mounts (named volumes, no bind-mount drift):
  - `docker inspect keycloak-db | jq '.[0].Mounts'`
  - `docker inspect supabase-db | jq '.[0].Mounts'`
  - Expect `Type: "volume"` and names `*_keycloak_db_data`, `*_supabase_db_data`.

## Tested restore (acceptance)

1. Take a fresh backup.
2. Stop writers (see Restore sections above) using **explicit compose path**:
   `docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml stop ...`
3. Restore from backup file as in Restore sections (paths as above).
4. Start services, run smoke tests from `runbooks/smoke_tests.md`.
5. Document any env-specific path (e.g. backup dir) so restore is repeatable.
