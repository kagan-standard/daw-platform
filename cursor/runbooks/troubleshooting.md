# Troubleshooting (DAW)

## Data 'missing'

Most common cause: running compose from the wrong directory/project. Always use:

```bash
docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml ...
```

Check that DBs use named volumes:

```bash
docker inspect keycloak-db | jq '.[0].Mounts'
docker inspect supabase-db | jq '.[0].Mounts'
```

Expect `Type: "volume"` and names containing `keycloak_db_data`, `supabase_db_data`.

## supabase-realtime crash-loop

Ensure `_realtime` schema and `supabase_realtime` publication exist. Apply `apps/beerbook/docs/database-schema.sql`, then:

```bash
docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml restart supabase-realtime
```

See `runbooks/troubleshooting.md` for full log locations, restart commands, and common errors.
