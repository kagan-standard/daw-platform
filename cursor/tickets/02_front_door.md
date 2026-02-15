# Ticket: Phase 2 — DAW Web Front Door

## Status: Implemented

- [x] Task 0: daw-web service in docker-compose.yml
- [x] Task 1: Keycloak client `daw-web` documented in deploy runbook
- [x] Task 2: apps/daw-web/config.js
- [x] Task 3: index.html rewritten — Keycloak OIDC + PKCE, logged-out / logged-in states, service cards
- [x] Task 4: signup.html removed (was not present in apps/daw-web)
- [x] Task 5: Runbooks, ARCHITECTURE.md, DECISIONS.md updated
- [x] Task 6: Smoke tests added
- [x] Task 7: Operator retire daw-signup documented in deploy.md

Operator: create Keycloak client `daw-web` per runbooks/deploy.md §6 step 6, then deploy daw-web and run smoke tests. Retire old daw-signup only after verification.
