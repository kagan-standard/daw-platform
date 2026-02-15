# Backup & Restore Runbook (DAW)

## Backups
- keycloak-db and supabase-db are backed up daily to /opt/backups on the server.
- retention: keep last N days.

## Restore (outline)
1) Take a fresh backup first
2) Stop writers (beerbook-api, etc.) if needed
3) Restore DB from backup
4) Restart services
5) Run smoke tests
