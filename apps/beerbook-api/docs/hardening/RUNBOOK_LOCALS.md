# Runbook Locals — discovered 2026-04-08

## Paths
- COMPOSE_FILE: /opt/daw-platform/infra/compose/docker-compose.yml
- ENV_FILE: /opt/daw-platform/infra/compose/.env
- APP_DIR: /opt/daw-platform/apps/beerbook-api
- CRON_SCRIPT_DIR: /opt/daw-platform/apps/beerbook-api/scripts
- MIGRATIONS_DIR: /opt/daw-platform/apps/beerbook-api/supabase/migrations

## Database
- DB_PASSWORD_ENV_VAR: SUPABASE_DB_PASSWORD
- DB_CONTAINER: supabase-db
- DB_USER: postgres
- DB_NAME: postgres

## API container
- API_CONTAINER: beerbook-api
- API_PORT: 3001
- HTTP_CLIENT_AVAILABLE: wget (no curl)
- NODE_VERSION: v20.18.1

## Standardized commands
- DB_EXEC: `docker exec -e PGPASSWORD=$(grep SUPABASE_DB_PASSWORD /opt/daw-platform/infra/compose/.env | cut -d= -f2) -i supabase-db psql -U postgres -d postgres`
- REBUILD_API: `docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml up -d --build beerbook-api`
- HEALTHCHECK_URL: https://api.beerbook.drinksafterwork.net/api/health

## Auth contract
- MIDDLEWARE_NAME: authMiddleware (async function in server.js:443)
- USER_ID_ACCESSOR: req.claims.sub
- CLAIMS_SHAPE: `{ sub, preferred_username, email, realm_access: { roles: [] } }`
- ADMIN_CHECK: `isAdmin(req.claims.sub)` — function at server.js:71, checks against ADMIN_USER_IDS Set
- ADMIN_MIDDLEWARE: `adminMiddleware` at server.js:552 — calls authMiddleware first implicitly (must be chained separately)
- SOFT_AUTH: `softAuthMiddleware` at server.js:506 — sets req.claims if token present, continues without error if not
- EXAMPLE_USAGE: `app.delete('/api/account', authMiddleware, async (req, res) => { ... req.claims.sub ... })`

## rest() helper (server.js — main app)
- LOCATION: server.js:112
- SIGNATURE: `async function rest(method, path, opts = {})`
- OPTS: `{ headers: {}, body: ... }`
- RETURN_SHAPE: `{ status: number, headers: object, body: parsed JSON | null }`
- NOTE: Body must be passed as `opts.body` (already JSON-stringified is NOT required — raw object), but it is passed to `fetch({ body: opts.body })` directly — so it must be a string or will be undefined. Actually checking: body is passed raw to fetch, so caller must JSON.stringify. Wait — looking at line 121: `body: opts.body` — this goes to fetch which expects string/Buffer/etc. So opts.body should be a JSON string.

## rest() helper (scripts — cron jobs)
- LOCATION: scripts/weekly-tabs-eval.js:40, scripts/streak-risk-check.js:32, etc.
- SIGNATURE: `async function rest(method, path, body)`
- BODY: Raw object (JSON.stringified internally at line 49)
- RETURN_SHAPE: Parsed JSON directly (no status wrapper)
- NOTE: Different signature than server.js rest(). Scripts use 3-arg form; server.js uses opts object.

## Health endpoint baseline
- Response: `{"status":"ok","service":"beerbook-api"}`
- Response time: ~55ms
- Tested: 2026-04-08
