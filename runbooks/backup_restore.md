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
   `docker compose -f infra/compose/docker-compose.yml stop keycloak`
2. Restore:  
   `docker exec -i keycloak-db psql -U keycloak keycloak < backup_keycloak_YYYYMMDD_HHMMSS.sql`
3. Start Keycloak:  
   `docker compose -f infra/compose/docker-compose.yml start keycloak`

### Supabase DB

1. Stop services that use Postgres:  
   `docker compose -f infra/compose/docker-compose.yml stop supabase-rest supabase-realtime beerbook-api`
2. Restore:  
   `docker exec -i supabase-db psql -U postgres postgres < backup_supabase_YYYYMMDD_HHMMSS.sql`
3. Start again:  
   `docker compose -f infra/compose/docker-compose.yml start supabase-rest supabase-realtime beerbook-api`

## Schedule

- Recommended: daily dumps (cron) plus retention policy (e.g. keep 7 daily, 4 weekly).
