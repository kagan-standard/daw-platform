# Deploy Runbook (DAW)

Always deploy using the explicit compose file (required on prod):

```bash
docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml --env-file /opt/daw-platform/infra/compose/.env up -d --remove-orphans
```

**Never run:** `docker compose down -v` (would destroy DB volumes).

After deploy:

- Run smoke tests (see `cursor/runbooks/smoke_tests.md` or `runbooks/smoke_tests.md`).
- Check logs for keycloak, beerbook-api, supabase-rest, supabase-realtime.
