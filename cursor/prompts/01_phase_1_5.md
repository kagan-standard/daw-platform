# Phase 1.5 — Stabilize & Polish

Apply cursor/prompts/00_system.md rules.

## Objectives
- Verify named volumes for keycloak-db and supabase-db
- Ensure daily backups + retention are documented and restorable
- Fix infra drift (repo matches production)
- Investigate and fix crash-looping services (supabase-realtime)
- Update runbooks: deploy, backup/restore, smoke tests, troubleshooting

## Required Output
1. Plan (max 12 bullets)
2. Specific file changes
3. Validation commands (VPS-side)
4. Rollback steps

## Constraints
- No architectural changes
- No infra rewrites
- No docker commands executed locally
- All deploy instructions must target:
  /opt/daw-platform/infra/compose/docker-compose.yml
