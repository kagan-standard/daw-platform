# Phase 1.5 — Deliverable

Scope: Stabilize & Polish. No architectural changes. Rules: `cursor/prompts/00_system.md`.

---

## Plan (≤12 bullets)

1. Verify named volumes in compose (keycloak-db, supabase-db) and document validation.
2. Document backups: daily path, retention (e.g. 7 daily, 4 weekly), logs.
3. Document restore procedure with explicit prod compose path and “tested restore” steps.
4. Fix supabase-realtime crash-loop: add `_realtime` schema and ensure `supabase_realtime` publication in DB schema.
5. Ensure repo runbooks use prod path `/opt/daw-platform/infra/compose/docker-compose.yml` where applicable.
6. Update runbooks: deploy, backup_restore, smoke_tests, troubleshooting, rollback.
7. Fix corrupted `cursor/runbooks/troubleshooting.md` (remove PowerShell/prompt junk).
8. Add troubleshooting section for realtime crash-loop and volume verification.
9. Add validation commands and rollback steps to this deliverable.
10. No `docker compose down -v`; backup before changes; document restore.

---

## Changes made

| Area | File(s) | Change |
|------|--------|--------|
| Realtime fix | `apps/beerbook/docs/database-schema.sql` | Added `CREATE SCHEMA IF NOT EXISTS _realtime`. Added `CREATE PUBLICATION supabase_realtime` (with DO block) so publication exists before `ADD TABLE ratings`. |
| Backup/restore | `runbooks/backup_restore.md` | Prod path `/opt/daw-platform/...` for stop/start. Added Schedule and retention, Validation commands (backup list, volume inspect), Tested restore steps. |
| Deploy | `runbooks/deploy.md` | Prod compose path for up, restart, build. |
| Troubleshooting | `runbooks/troubleshooting.md` | Section “Verify named volumes” with inspect commands; section “Supabase Realtime crash-loop” with schema/restart steps; prod path in restart commands. |
| Rollback | `runbooks/rollback.md` | Prod path for all compose commands; note “Do not use down -v” in nuclear option. |
| Cursor runbooks | `cursor/runbooks/troubleshooting.md` | Replaced corrupted content with short DAW runbook (data missing, volume check, realtime crash-loop, pointer to full runbook). |
| Cursor runbooks | `cursor/runbooks/backup_restore.md` | Restore outline with prod path; validation (backup list, volume inspect). |
| Cursor runbooks | `cursor/runbooks/deploy.md` | Prod command in code block; never down -v; smoke test pointer. |
| Cursor runbooks | `cursor/runbooks/smoke_tests.md` | Commands in code block; pointer to full smoke_tests. |

Compose `docker-compose.yml`: already uses named volumes `keycloak_db_data`, `supabase_db_data` — no change.

---

## Acceptance criteria

- [ ] keycloak-db and supabase-db use named volumes (no bind-mount drift); documented how to verify.
- [ ] Backups: path, retention, and log location documented; restore procedure uses prod compose path.
- [ ] Restore procedure includes “tested restore” steps and validation (list backups, volume inspect).
- [ ] supabase-realtime: `_realtime` schema and `supabase_realtime` publication in DB schema; after re-applying schema, realtime container can start without crash-loop.
- [ ] All runbooks that run compose on prod use `docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml` (and env-file path where needed).
- [ ] Troubleshooting runbook covers “data missing” (wrong path), volume check, and realtime crash-loop.
- [ ] No architectural changes; no `docker compose down -v` on prod.

---

## Validation commands (VPS-side)

Run on production (or target VPS). Exact commands:

```bash
# 1. Named volumes (expect Type: "volume", names *keycloak_db_data*, *supabase_db_data*)
docker inspect keycloak-db | jq '.[0].Mounts'
docker inspect supabase-db | jq '.[0].Mounts'

# 2. Backups present (adjust path if different)
ls -la /opt/backups

# 3. Realtime running (after applying schema and restart)
docker ps --filter name=supabase-realtime
docker logs supabase-realtime --tail 30

# 4. Smoke (from host that can reach URLs)
curl -fsSI https://beerbook.drinksafterwork.net | head
curl -fsSI https://auth.drinksafterwork.net | head
curl -fsSI https://drinksafterwork.net | head
```

If schema was changed (Phase 1.5): re-apply schema then restart realtime:

```bash
docker exec -i supabase-db psql -U postgres < /opt/daw-platform/apps/beerbook/docs/database-schema.sql
docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml --env-file /opt/daw-platform/infra/compose/.env restart supabase-realtime
```

---

## Rollback steps (exact)

If Phase 1.5 changes cause issues:

1. **Revert repo**  
   - `git revert <commit(s)>` or restore from backup the modified files:  
     `apps/beerbook/docs/database-schema.sql`, `runbooks/*.md`, `cursor/runbooks/*.md`.

2. **If only schema was applied and realtime/DB misbehave**  
   - Restore supabase-db from backup (see `runbooks/backup_restore.md`).  
   - Do **not** run `docker compose down -v`.

3. **Redeploy / restart**  
   ```bash
   docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml --env-file /opt/daw-platform/infra/compose/.env up -d --remove-orphans
   ```

4. **Verify**  
   - Run smoke tests.  
   - Check `docker ps` and `docker logs` for keycloak, beerbook-api, supabase-rest, supabase-realtime.

5. **Document**  
   - Note in `runbooks/rollback.md` or runbook notes what was reverted and when.
