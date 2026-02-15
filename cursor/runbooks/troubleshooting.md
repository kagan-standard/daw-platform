# Troubleshooting

## Data 'missing'
Most common cause: running compose from the wrong directory/project.
Always use:
docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml ...

Check mounts:
docker inspect keycloak-db | jq '.[0].Mounts'
docker inspect supabase-db | jq '.[0].Mounts'
"@

Write-TextFile (Join-Path C:\Users\kenyo\OneDrive\Desktop\daw-platform\daw-platform\cursor "prompts\01_phase_1_5.md") @"
# Phase 1.5 — Stabilize & Polish

Apply /cursor/prompts/00_system.md rules.

## Objectives
- Verify named volumes + mounts for keycloak-db and supabase-db
- Daily backups + retention + logs (already implemented on server; ensure documented + tested restore)
- Fix any remaining infra drift (repo matches prod)
- Investigate/fix crash-looping services (supabase-realtime currently restarting)
- Update runbooks: deploy, backup/restore, smoke tests, troubleshooting

## Must output
- plan (<=12 bullets)
- changes made
- validation commands
- rollback steps
