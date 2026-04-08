# BeerBook Pre-Launch Hardening Plan (v2)

**Audience:** Claude Code agent running on `ubuntu-2gb-ash-1` VPS
**Owner (human):** Anonymous
**Timeline:** 10 days, Day 0 = today
**Goal:** Take the backend from "works for 12 friendly users" to "ready for public TestFlight launch" by closing the Critical and High findings from the pre-launch audit, running a clean seeder kickoff in the middle, and landing observability before public exposure.

**Why v2:** This document supersedes v1. It was rewritten after two repo-grounded reviews caught path/env/middleware errors in v1, and after the human confirmed that direct SQL edits and migrations have been applied to the VPS without being committed back to the repo. The repo is therefore a *partial view* of the live system. This document treats the VPS as the source of truth, not the repo, and the discovery phase (P0.0) is mandatory.

---

## Operating Principles

**You are the backend execution agent.** Cursor handles the mobile repo. You handle everything in `/opt/daw-platform` on the VPS: backend code (`apps/beerbook-api`), database migrations, cron jobs, Docker compose, and verification.

**The VPS is the source of truth, not the repo.** The human has confirmed that direct SQL edits and migrations have been applied to the live database without being committed back to `apps/beerbook-api/supabase/migrations/`. This means: any time you reason about database state (functions, indexes, constraints, RPC behavior), you query the live database. The repo is supporting evidence, not authority. If they disagree, the live system wins and you surface the divergence in your report.

**The two-agent boundary is hard.** If a fix touches the mobile app — push payload shapes, API contract changes the client consumes, anything the iOS build needs to know about — STOP, document the contract change in `API_CONTRACT.md`, and surface it to the human. Do not edit anything outside `/opt/daw-platform`.

**Schema convergence principle.** Every migration you write during this plan goes in TWO places: applied to the live database AND committed to `apps/beerbook-api/supabase/migrations/` in the same hardening commit. By the end of the plan, the repo and the VPS converge for everything you touched, even if they were divergent going in. Existing live-only schema state is documented (in the discovery report) but NOT retroactively committed unless the human asks for it — that's a separate cleanup task.

**Reader-before-writer principle.** A write to a database field is only safe to remove when every reader of that field has been migrated to the new source of truth. Do not remove a write just because the field is "deprecated" or "becoming a cache." Verify readers first, then remove writes. This is why Day 3 only touches `lifetime_tabs_earned` and `tab_balance` and explicitly does not touch `ratings_this_week`.

**Stop-and-surface gates are mandatory.** This document has explicit human gates after Discovery (P0.0), end of Day 2, end of Day 8, and launch pre-flight. It has micro-gates inside Days 3 and 4. At each gate, you produce a status report (template at the end of this doc) and wait for explicit human approval before proceeding. Do not skip gates even if everything looks green.

**Verification is concrete or it didn't happen.** Every task in this plan has a verification step with an expected output. "Looks good" is not acceptable. If a verification step fails, STOP and report — do not attempt to fix forward unless the task explicitly says to.

**Commit discipline.** Every task gets its own commit on a working branch (`hardening/main`). Commit messages follow the pattern `[day-N] task description`. Tag the end of each day as `hardening-day-N-complete` so rollback is one command. Never force-push.

**When in doubt, stop.** The cost of stopping and asking is one chat message. The cost of plowing through and corrupting the tabs economy ledger is days of recovery and broken user trust. Default to stopping.

---

## Pre-flight Phase (Day 0)

Day 0 has two sub-phases. **P0.0 is discovery and is gated by a human review before P0.1 starts.** Do not run P0.1 until the human has approved the discovery report.

### P0.0 — Live System Discovery (READ-ONLY)

This phase is read-only. You write nothing to the database, edit no files, restart no containers. You produce a discovery report and stop.

**The point of this phase is to find the things the repo doesn't know about.** The human has confirmed that the live VPS has been modified directly via `docker exec ... psql` migrations that were never committed back. Your job here is to surface that drift before it bites.

#### P0.0.1 — Resolve runtime locals

Discover the actual values for the things v1 of this doc got wrong. Write findings to a file you'll create at `/opt/daw-platform/apps/beerbook-api/docs/hardening/RUNBOOK_LOCALS.md` (create the directory if it doesn't exist).

```bash
# Find the compose file
find /opt/daw-platform -name 'docker-compose*.yml' -not -path '*/node_modules/*' 2>/dev/null

# Find the env file and list keys only (no values)
find /opt/daw-platform -name '.env' -not -path '*/node_modules/*' 2>/dev/null
# For each .env found, list keys:
#   grep -E '^[A-Z_]+=' /path/to/.env | cut -d= -f1 | sort
# Look specifically for the DB password key (likely SUPABASE_DB_PASSWORD)

# Find the app directory
find /opt/daw-platform -type d -name beerbook-api -not -path '*/node_modules/*' 2>/dev/null

# Find the cron script directory
find /opt/daw-platform -type f -name 'weekly-tabs-eval.js' 2>/dev/null
find /opt/daw-platform -type f -name 'streak-risk-check.js' 2>/dev/null

# Find the API port from compose
grep -A2 -B2 'PORT:' /path/to/docker-compose.yml

# Check what HTTP client is in the API container
docker exec beerbook-api which curl 2>/dev/null || echo "no curl"
docker exec beerbook-api which wget 2>/dev/null || echo "no wget"
docker exec beerbook-api node --version
```

Record all findings in `RUNBOOK_LOCALS.md` with this structure:

```markdown
# Runbook Locals — discovered YYYY-MM-DD

## Paths
- COMPOSE_FILE: <full path>
- ENV_FILE: <full path>
- APP_DIR: <full path, expected /opt/daw-platform/apps/beerbook-api>
- CRON_SCRIPT_DIR: <full path, expected APP_DIR/scripts>
- MIGRATIONS_DIR: <full path, expected APP_DIR/supabase/migrations>

## Database
- DB_PASSWORD_ENV_VAR: <key name, expected SUPABASE_DB_PASSWORD>
- DB_CONTAINER: <container name, expected supabase-db>
- DB_USER: postgres
- DB_NAME: postgres

## API container
- API_CONTAINER: <name, expected beerbook-api>
- API_PORT: <number, expected 3001>
- HTTP_CLIENT_AVAILABLE: curl | wget | neither
- NODE_VERSION: <version>

## Standardized commands (substitute the values above)
- DB_EXEC: docker exec -e PGPASSWORD=$(grep <DB_PASSWORD_ENV_VAR> <ENV_FILE> | cut -d= -f2) -i <DB_CONTAINER> psql -U postgres -d postgres
- REBUILD_API: docker compose -f <COMPOSE_FILE> up -d --build <API_CONTAINER>
- HEALTHCHECK_URL: http://localhost:<API_PORT>/api/health
```

The standardized commands at the bottom are what every subsequent task in this plan refers to. Replace any literal `docker exec ... POSTGRES_PASSWORD ...` reference in your head with the actual `DB_EXEC` value you discovered. Same for paths.

**If any of these can't be discovered or don't match the expected value, note it in the report and surface to the human at the gate.** Don't guess.

#### P0.0.2 — Verify the standardized DB command actually works

Once you've populated `RUNBOOK_LOCALS.md`, smoke-test the `DB_EXEC` command:

```bash
# Substitute the actual values you found
<DB_EXEC> -c "SELECT count(*) FROM ratings;"
```

Expected: a number (the audit said ~56). If this errors with "password authentication failed" or similar, your env var resolution is wrong — STOP and re-discover P0.0.1.

#### P0.0.3 — Container deployment state

```bash
# Container image hash
docker inspect <API_CONTAINER> --format '{{.Image}}'
docker inspect <API_CONTAINER> --format '{{.Created}}'

# Repo HEAD on the VPS
cd <APP_DIR> && git log -1 --format='%H %s' && git status

# Try to find the git SHA baked into the container if there's a label
docker inspect <API_CONTAINER> --format '{{json .Config.Labels}}'

# Container uptime
docker ps --filter name=<API_CONTAINER> --format '{{.Status}}'
```

Record in the discovery report:
- Running container image hash
- Container created timestamp
- Repo HEAD on the VPS (commit hash and message)
- Whether `git status` is clean (if dirty, surface to human at gate — uncommitted local changes are a yellow flag)
- Container uptime

The reviewer flagged that the repo HEAD as of their review was `9733789` ("brilliant save"). If your VPS HEAD is older, that's important — it means the `ratings_this_week` semantic shift may not be live yet, which changes how you reason about Day 4. Note this explicitly in the report.

#### P0.0.4 — Database schema inventory

This is the most important part of discovery. You are looking for functions, indexes, and constraints that exist on the live database but NOT in the repo's migration files. These are the things only you can see.

```bash
# Every function in public schema
<DB_EXEC> -c "
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;
" > /tmp/live_functions.txt

# Full definition of every function touching the tabs economy fields
<DB_EXEC> -c "
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND (routine_definition ILIKE '%lifetime_tabs_earned%'
    OR routine_definition ILIKE '%tab_balance%'
    OR routine_definition ILIKE '%ratings_this_week%'
    OR routine_definition ILIKE '%current_streak_weeks%'
    OR routine_definition ILIKE '%current_tier%'
    OR routine_definition ILIKE '%weeks_inactive%'
    OR routine_definition ILIKE '%user_tabs_profile%');
" > /tmp/tabs_functions.txt

# For each function in /tmp/tabs_functions.txt, get the full definition:
<DB_EXEC> -c "\df+ <function_name>"
# Or:
<DB_EXEC> -c "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = '<function_name>';"

# Every index on tabs/ratings tables
<DB_EXEC> -c "
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('ratings','reactions','profiles','crews','user_tabs_profile','tabs_ledger')
ORDER BY tablename, indexname;
" > /tmp/live_indexes.txt

# Every constraint on user_tabs_profile and tabs_ledger
<DB_EXEC> -c "
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN ('public.user_tabs_profile'::regclass, 'public.tabs_ledger'::regclass)
ORDER BY conrelid, conname;
"
```

Now compare against the repo:

```bash
# List all migration files in the repo
ls <MIGRATIONS_DIR> | sort

# For each function in /tmp/tabs_functions.txt, grep the migrations directory
for fn in $(cat /tmp/tabs_functions.txt | grep -v '^$' | grep -v 'routine_name' | grep -v '^-' | grep -v '^(' | tr -d ' '); do
  if ! grep -rq "$fn" <MIGRATIONS_DIR> 2>/dev/null; then
    echo "LIVE-ONLY: $fn"
  fi
done

# Same for indexes
for idx in $(awk '/idx_/ {print $2}' /tmp/live_indexes.txt); do
  if ! grep -rq "$idx" <MIGRATIONS_DIR> 2>/dev/null; then
    echo "LIVE-ONLY INDEX: $idx"
  fi
done
```

**Anything tagged `LIVE-ONLY` is something the repo doesn't know about.** This is exactly the drift the human warned us about. Every LIVE-ONLY item goes into the discovery report with its full definition so the human can confirm it's intentional.

#### P0.0.5 — Cron state

```bash
crontab -l > /tmp/live_crontab.txt
cat /tmp/live_crontab.txt

# For each cron entry, check if the referenced script exists
while IFS= read -r line; do
  script=$(echo "$line" | grep -oE '/[^ ]+\.js' | head -1)
  if [ -n "$script" ]; then
    if [ -f "$script" ]; then
      echo "OK: $script"
    else
      echo "MISSING: $script (referenced in: $line)"
    fi
  fi
done < /tmp/live_crontab.txt
```

The audit said `streak-risk-check.js` is not scheduled. Verify this is still true. Also check the last run timestamps if log files exist:

```bash
ls -la /var/log/beerbook/ 2>/dev/null
# For each log file, get the last modification time
```

#### P0.0.6 — Auth middleware contract

The reviewer said v1 of this doc had the wrong auth shape. Verify the actual contract by reading the middleware:

```bash
grep -rn 'authMiddleware\|requireAuth' <APP_DIR>/lib/ <APP_DIR>/server.js | head -20
# Find the file that defines the middleware
# Read it and confirm:
#   - The function name
#   - The property it sets on req (req.claims? req.user? req.auth?)
#   - The shape of that property (sub? id? email?)
#   - How admin status is checked (isAdmin(req.claims.sub)? req.claims.is_admin?)
```

Document the actual contract in `RUNBOOK_LOCALS.md` under a new section:

```markdown
## Auth contract
- MIDDLEWARE_NAME: <e.g., authMiddleware>
- USER_ID_ACCESSOR: <e.g., req.claims.sub>
- ADMIN_CHECK: <e.g., isAdmin(req.claims.sub) — function imported from where?>
- EXAMPLE_USAGE: <paste a snippet from an existing authenticated route>
```

This becomes the template for all auth-related changes in Day 2 and Day 8.

#### P0.0.7 — `rest()` helper signature

```bash
grep -n 'function rest\|const rest' <APP_DIR>/server.js <APP_DIR>/lib/*.js | head
# Find the definition and document the signature
```

Document in `RUNBOOK_LOCALS.md`:

```markdown
## rest() helper
- LOCATION: <file:line>
- SIGNATURE: <e.g., async function rest(method, path, body)>
- RETURN_SHAPE: <e.g., { status, body } | direct body>
```

Day 2 and Day 4 will need this when writing example code.

#### P0.0.8 — DB snapshot (rollback baseline)

This is the only "write" in P0.0 — it writes a backup file, nothing in the database.

```bash
TS=$(date +%Y%m%d_%H%M%S)
mkdir -p /opt/daw-platform/backups/hardening
docker exec -e PGPASSWORD=$(grep <DB_PASSWORD_ENV_VAR> <ENV_FILE> | cut -d= -f2) <DB_CONTAINER> pg_dump -U postgres -d postgres -F c -f /tmp/preflight_${TS}.dump
docker cp <DB_CONTAINER>:/tmp/preflight_${TS}.dump /opt/daw-platform/backups/hardening/
ls -lh /opt/daw-platform/backups/hardening/preflight_${TS}.dump
```

Note the use of a single `TS` variable captured once. The v1 doc had a race condition where two `$(date)` calls could resolve to different minutes — this is the fix.

Record the dump filename in the discovery report. **This is the rollback baseline for the entire 10-day plan.** Do not skip.

#### Discovery report

Write the discovery report to `/opt/daw-platform/apps/beerbook-api/docs/hardening/live-system-inventory-YYYY-MM-DD.md` AND post a summary to chat.

The full file contains all six sections (Container/Deployment, DB Schema, Cron, Environment, Code Contracts, Backup). The chat summary is 30–60 lines covering:

1. Whether the live HEAD matches `9733789` (the reviewer's reference point)
2. Count of LIVE-ONLY functions touching tabs fields
3. Count of LIVE-ONLY indexes
4. Whether `streak-risk-check.js` is in crontab (expected: no)
5. The resolved auth contract one-liner (e.g., "auth uses `req.claims.sub`, admin via `isAdmin(req.claims.sub)`")
6. The rest() helper signature one-liner
7. The backup dump filename
8. Anything weird the human should know about

End the chat summary with: "Full report at <path>. Awaiting approval to proceed to P0.1."

### 🛑 HUMAN GATE — DISCOVERY APPROVAL

**Stop. Do not proceed to P0.1.** The human reads the discovery report (in chat or in the file) and either approves or asks for corrections. If there are LIVE-ONLY functions whose purpose is unclear, the human may ask you to investigate further before proceeding. Wait for explicit "approved, proceed to P0.1" or equivalent.

If the human flags something that changes the plan — for example, "there's already a partial `eval_user_weekly_tabs` function on the VPS" — STOP and surface immediately. Do not try to incorporate the change yourself; ask for guidance.

### P0.1 — Working branch

```bash
cd <APP_DIR>
# git status must be clean — confirmed in P0.0.3
git checkout -b hardening/main
git tag hardening-day-0-baseline
```

### P0.2 — Commit the discovery artifacts

```bash
cd <APP_DIR>
git add docs/hardening/RUNBOOK_LOCALS.md docs/hardening/live-system-inventory-*.md
git commit -m "[day-0] discovery: runbook locals + live system inventory"
```

Note: `RUNBOOK_LOCALS.md` may contain non-secret config that the human prefers stays uncommitted. If so, surface this and let the human decide. Default to committing it because it's a snapshot, not a secret store.

### P0.3 — Health endpoint baseline

```bash
curl -sf https://api.beerbook.drinksafterwork.net/api/health
time curl -sf https://api.beerbook.drinksafterwork.net/api/health > /dev/null
```

Record the response and the response time. We'll compare against this on Day 1, Day 7, and launch day.

If P0.1 through P0.3 succeed, file the Day 0 report (template at end of doc, plus the discovery summary) and proceed to Day 1.

---

## Day 1 — Crash Resistance

**Goal:** Make the API survive a single PostgREST hiccup without crashing the Node process. This is the #1 reliability risk in the audit and the entire rest of the plan depends on the API staying up.

**Audit findings addressed:** Section 4.1 (unhandled rejections), Section 4.2 (no generic error handler).

**Note on side effects:** `POST /api/ratings` and `PATCH /api/ratings/:id` now have catalog-backfill behavior added in HEAD `9733789`. The backfill is wrapped in its own internal try/catch, so it's isolated from the asyncHandler work below. The Day 1 verification step explicitly tests catalog backfill to confirm no regression.

### Tasks

**T1.1 — Add `unhandledRejection` and `uncaughtException` handlers**

In `<APP_DIR>/server.js`, near the top after imports but before any route definitions, add:

```javascript
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection at:', promise, 'reason:', reason);
  // Do not exit — let the request fail gracefully. Sentry will catch it on Day 6.
});

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
  // Exit so Docker restarts us cleanly. This is intentional.
  process.exit(1);
});
```

The asymmetry is deliberate: unhandled rejections in Node 20 are usually recoverable (a stray async without await); uncaught exceptions mean state is corrupted and we want a clean restart.

**T1.2 — Build an `asyncHandler` wrapper utility**

Create `<APP_DIR>/lib/asyncHandler.js`:

```javascript
// Wraps async route handlers so thrown errors propagate to Express's error middleware
// instead of becoming unhandled rejections.
module.exports = function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
```

**T1.3 — Find every unwrapped async handler in `server.js`**

The audit lists these specific lines: 1303, 1449, 1873, 1894, 2039, 2099, 2276, 2312, 2462. **Treat these as starting points, not the complete list.** The reviewer of v1 noted that v1's grep pattern was incomplete because it only matched `async (req, res)` and missed `async (req, res, next)` and named async handler functions.

Use multiple greps:

```bash
cd <APP_DIR>
grep -nE 'async \(req, res\)' server.js
grep -nE 'async \(req, res, next\)' server.js
grep -nE 'async function [a-zA-Z]+\(req, res' server.js
grep -nE '\.(get|post|patch|delete|put)\([^,]+, [a-zA-Z]+\)' server.js | head -50
```

Then read each candidate and check whether:
1. It's already wrapped in `asyncHandler(...)` — leave alone
2. It has a top-level try/catch that returns a response in the catch — leave alone
3. Neither of the above — it needs wrapping

Build a list of every handler that needs wrapping. **Before making changes**, paste the list into the Day 1 report so the human can sanity-check it. This is a soft micro-gate — you don't have to wait for explicit approval, but if the list looks wrong or surprisingly short/long, the human will tell you.

**T1.4 — Wrap the unwrapped handlers**

For each handler from T1.3:

```javascript
// before
app.get('/api/ratings', async (req, res) => { ... });

// after
const asyncHandler = require('./lib/asyncHandler');
app.get('/api/ratings', asyncHandler(async (req, res) => { ... }));
```

Add the `require` once at the top of `server.js`.

**T1.5 — Add a generic Express error middleware**

At the bottom of `server.js`, AFTER all routes but BEFORE `app.listen`. The existing Multer-only handler must remain — add this AFTER it so it catches everything Multer doesn't:

```javascript
app.use((err, req, res, next) => {
  const requestId = req.headers['x-request-id'] || 'unknown';
  console.error(`[ERROR] [${requestId}] ${req.method} ${req.path}:`, err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({
    error: 'internal_server_error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
    request_id: requestId,
  });
});
```

### Verification

**V1.1 — Syntax check**
```bash
cd <APP_DIR> && node -c server.js
```
Expected: no output, exit 0.

**V1.2 — Count `asyncHandler(` occurrences before/after**
```bash
git diff hardening-day-0-baseline -- server.js | grep -c '+.*asyncHandler('
```
Expected: matches the count from your T1.3 list. If it doesn't, you forgot to apply the wrapper somewhere.

**V1.3 — Rebuild and confirm container is healthy**
```bash
<REBUILD_API>
sleep 5
docker ps --filter name=<API_CONTAINER> --format '{{.Status}}'
curl -sf https://api.beerbook.drinksafterwork.net/api/health
```
Expected: container `Up`, health returns `{"status":"ok"}`.

**V1.4 — Force an error and confirm it returns JSON, not a stack trace**
```bash
curl -s -o /tmp/err.json -w "%{http_code}\n" https://api.beerbook.drinksafterwork.net/api/ratings/not-a-real-uuid
cat /tmp/err.json
docker logs <API_CONTAINER> --tail 50 2>&1 | grep -i 'ERROR\|FATAL'
```
Expected: HTTP code is 4xx or 500 (not a connection drop), the response body is valid JSON containing `request_id`, and the log line shows the error with the request ID.

**V1.5 — Smoke test the hot routes**

Ask the human for a fresh auth token for the test user (`061d5154-c846-49e5-9758-d279bb3ab8bd`). Don't proceed without it.

```bash
TOKEN=<paste from human>
for route in /api/profile /api/ratings /api/activity /api/tabs/profile; do
  status=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "https://api.beerbook.drinksafterwork.net$route")
  echo "$status $route"
done
```
Expected: all 200s.

**V1.6 — Catalog backfill regression check**

This is the new check. The reviewer noted that `POST /api/ratings` now has catalog-backfill side effects added in HEAD `9733789`. Confirm the backfill still fires after the asyncHandler wrap.

Coordinate with the human: have them submit a rating from the simulator for a beer that the user hasn't rated before. Capture before/after row counts:

```bash
# Before
<DB_EXEC> -c "SELECT count(*) FROM ratings WHERE user_id = '061d5154-c846-49e5-9758-d279bb3ab8bd';"

# (human submits rating)

# After
<DB_EXEC> -c "SELECT count(*) FROM ratings WHERE user_id = '061d5154-c846-49e5-9758-d279bb3ab8bd';"
# Look at the most recent rating
<DB_EXEC> -c "SELECT id, beer_id, beer_name, created_at FROM ratings WHERE user_id = '061d5154-c846-49e5-9758-d279bb3ab8bd' ORDER BY created_at DESC LIMIT 1;"

# Check logs for backfill activity
docker logs <API_CONTAINER> --tail 100 2>&1 | grep -i 'backfill\|catalog'
```
Expected: rating count incremented by 1, the new rating exists, log shows backfill activity (or at least no error from backfill).

### Rollback

```bash
cd <APP_DIR>
git reset --hard hardening-day-0-baseline
<REBUILD_API>
```

### Day 1 commit and tag

```bash
git add -A
git commit -m "[day-1] crash resistance: async handler wrapper + error middleware + process handlers"
git tag hardening-day-1-complete
```

File a Day 1 report including the T1.3 handler list and the V1.6 backfill verification. Proceed to Day 2.

---

## Day 2 — Quick Wins + Human Gate #1

**Goal:** Land four cheap, mechanical fixes that close audit findings, then STOP for the first hard human gate.

**Audit findings addressed:** #4 (streak cron), #7 partial (dead `tab_balance` writes), #2 partial (worst unbounded queries), Section 3.1 (unauthenticated tabs profile route).

### Tasks

**T2.1 — Add `streak-risk-check.js` to crontab**

```bash
crontab -l > /tmp/crontab.bak
crontab -l | grep -v 'streak-risk-check' > /tmp/crontab.new
echo "0 18 * * 3 cd <APP_DIR> && /usr/bin/node scripts/streak-risk-check.js >> /var/log/beerbook/streak-risk-check.log 2>&1" >> /tmp/crontab.new
crontab /tmp/crontab.new
crontab -l | grep streak-risk-check
```

The schedule (`0 18 * * 3` = Wednesday 6pm UTC) is a placeholder. **Surface this to the human in the Day 2 report and ask them to confirm the schedule before the gate.** The audit only says it's not scheduled, not what time it should run.

Note the path: scripts live in `<APP_DIR>/scripts/` (not `scripts/cron/` — v1 of this doc was wrong about that). Confirm the actual path from your discovery report before substituting.

**T2.2 — Auth on `GET /api/tabs/profile/:userId`**

The route currently lives in `routes/tabs.js` around line 782 and is unauthenticated. The fix uses the actual auth contract you discovered in P0.0.6 — substitute `<MIDDLEWARE_NAME>`, `<USER_ID_ACCESSOR>`, and `<ADMIN_CHECK>` with what you found.

Example assuming the contract is `authMiddleware` + `req.claims.sub` + `isAdmin(req.claims.sub)` (which is what the reviewer found in the repo, but verify against your own discovery):

```javascript
router.get('/tabs/profile/:userId', authMiddleware, async (req, res, next) => {
  try {
    const requesterId = req.claims.sub;
    const targetId = req.params.userId;
    if (requesterId !== targetId && !isAdmin(requesterId)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    // ... existing handler body
  } catch (e) {
    next(e);
  }
});
```

If `isAdmin` is not already imported in `routes/tabs.js`, add the import. Match how other admin checks in the codebase do it — don't invent a new pattern.

**T2.3 — Remove dead `tab_balance` writes**

Per Day 3's writer inventory (which you'll do tomorrow), `tab_balance` is the obvious dead-write target because nothing reads it as truth. Before removing writes, do a quick read-side verification:

```bash
cd <APP_DIR>
grep -rn 'tab_balance' lib/ routes/ scripts/ server.js | grep -v '//' | grep -v '\.md'
```

For each match, classify as READ or WRITE. If you find ANY read of `tab_balance` from `user_tabs_profile` (not from `profiles.tabs_balance`, which is the real one), STOP and surface to the human. The reader-before-writer principle says we don't remove writes when reads still exist.

Assuming all matches are writes or comments, remove the `tab_balance` field from any UPDATE/PATCH against `user_tabs_profile` in `lib/tabs.js`. Specifically:
- `awardTabsForRating` in `lib/tabs.js` around line 151
- `awardSingleSourceTabs` in `lib/tabs.js` around line 187

Remove ONLY the `tab_balance` line from each PATCH body. Leave `lifetime_tabs_earned` alone — that's Day 3's job. Leave `ratings_this_week` alone — that's a non-authoritative cache field with live readers (see Operating Principles).

**T2.4 — Add `LIMIT` clauses to the worst unbounded queries**

The audit's line numbers are a starting point but the reviewer of v1 noted some are stale (e.g., `routes/map.js` already caps ratings; the unbounded part there is the venues fetch). Don't trust line numbers — grep for unbounded patterns yourself:

```bash
cd <APP_DIR>
grep -rn "rest('GET'" routes/ | grep -v 'limit=' | grep -v '//'
grep -rn '/venues' routes/ | grep -v 'limit=' | grep -v '//'
```

For each result, read the surrounding code and decide whether the query needs a cap. The audit's worst offenders are:

- `routes/beers.js` — the beer detail route fetching all ratings for a beer name → cap at 500
- `routes/crews.js` around line 297 — ratings for all crew members → cap at 2000
- `routes/map.js` — the full `/venues` fetch (NOT the ratings query, which is already capped) → cap at 1000 with TODO comment about bbox filtering
- `routes/deals.js` lines 26-28 — full `venue_menus` and `happy_hours` → cap at 500 each

For each cap added, also add a code comment: `// TODO(scale): replace with paginated/filtered query post-launch`. We're not solving the scale problem today; we're removing the OOM ceiling.

If your grep finds an unbounded query that's NOT in the audit, surface it in the Day 2 report — don't cap it without confirmation.

**T2.5 — Document the cron schedule decision**

Create or append to `<APP_DIR>/docs/CRON_SCHEDULE.md` with a row for `streak-risk-check.js` showing the schedule and rationale. Document everything else in the crontab too while you're at it — this is the kind of context that gets lost.

### Verification

**V2.1 — Cron entry present**
```bash
crontab -l | grep streak-risk-check
```

**V2.2 — Tabs profile route returns 401 without auth and 403 for wrong user**
```bash
# Should be 401 (no auth)
curl -s -o /dev/null -w "%{http_code}\n" https://api.beerbook.drinksafterwork.net/api/tabs/profile/061d5154-c846-49e5-9758-d279bb3ab8bd

TOKEN=<from human>
# Should be 200 (matching user)
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" https://api.beerbook.drinksafterwork.net/api/tabs/profile/061d5154-c846-49e5-9758-d279bb3ab8bd

# Should be 403 (different user, assuming test user is not admin)
OTHER_USER=<any other user id, ask human>
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" https://api.beerbook.drinksafterwork.net/api/tabs/profile/$OTHER_USER
```

If the test user IS admin, V2.2 will return 200 instead of 403 for the third call. Surface this in the report and ask the human whether they have a non-admin token to test with.

**V2.3 — No remaining `tab_balance` writes (only reads are allowed if they exist)**
```bash
cd <APP_DIR>
grep -rn 'tab_balance' lib/ routes/ server.js | grep -v '//' | grep -v '\.md'
```
Expected: no PATCH/UPDATE/INSERT lines containing `tab_balance`. Reads are acceptable but should be flagged in the report.

**V2.4 — All capped routes still return data**
```bash
TOKEN=<from human>
for route in '/api/beers/search?q=ipa' '/api/map/venues' '/api/deals'; do
  status=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "https://api.beerbook.drinksafterwork.net$route")
  echo "$status $route"
done
```
All should be 200.

**V2.5 — Container still healthy**
```bash
<REBUILD_API>
sleep 5
curl -sf https://api.beerbook.drinksafterwork.net/api/health
```

### Rollback
```bash
cd <APP_DIR>
git reset --hard hardening-day-1-complete
crontab /tmp/crontab.bak
<REBUILD_API>
```

### Day 2 commit and tag
```bash
git add -A
git commit -m "[day-2] cron entry + tabs profile auth + dead-write removal + LIMIT clauses"
git tag hardening-day-2-complete
```

### 🛑 HUMAN GATE #1

File the Day 2 report. **Stop and wait for explicit human approval before starting Day 3.** In the report, surface:

1. The cron schedule you used for `streak-risk-check` and ask the human to confirm.
2. Whether the test user is admin (affects V2.2 interpretation).
3. Any unbounded queries you found that weren't in the audit.
4. The handler list from Day 1 T1.3 if the human didn't already approve it inline.
5. Any `tab_balance` reads still in the codebase.
6. Anything from discovery (P0.0) that the human flagged for follow-up but you haven't yet addressed.

Do not proceed until the human says "approved, proceed to Day 3" or equivalent.

---

## Day 3 — Tabs Economy Integrity (Part 1)

**Goal:** Resolve the `lifetime_tabs_earned` dual-writer (or triple-writer, or more) problem. This is a correctness fix on the financial-equivalent ledger of the app, so it gets its own day.

**Audit findings addressed:** #7 (lifetime_tabs_earned dual writer), Section 7.2 (stale denormalized fields).

**This day requires careful design work, not just paste-and-execute.** Read the entire day before doing anything.

### Tasks

**T3.1 — Exhaustive writer inventory**

Reviewer #1 of v1 caught that the inventory was too narrow — there are at least three writers, possibly more on the live VPS. Your job is to find ALL of them, code-side AND DB-side.

Code side:
```bash
cd <APP_DIR>
grep -rn 'lifetime_tabs_earned' lib/ routes/ scripts/ server.js workers/ 2>/dev/null
```

DB side (this is where v1 fell short — it didn't query the live system):
```bash
<DB_EXEC> -c "
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_definition ILIKE '%lifetime_tabs_earned%'
ORDER BY routine_name;
"

# For each function returned, get the full definition
<DB_EXEC> -c "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = '<function_name>';"
```

Cross-reference against your discovery report from P0.0.4 — any LIVE-ONLY functions you found there that touch `lifetime_tabs_earned` belong in this inventory.

Build a table:

```markdown
| Writer | Type | Location | Fires when | Source of truth? |
|---|---|---|---|---|
| awardTabsForRating | JS | lib/tabs.js:151 | Rating create (legacy path) | ? |
| awardSingleSourceTabs | JS | lib/tabs.js:187 | Various non-rating awards | ? |
| refresh_rating_award_profile_cache | RPC | DB function | Rating create (modern path) | ? |
| <any LIVE-ONLY function> | RPC | DB function | ??? | ??? |
```

Fill in the "Fires when" column by reading each writer's call sites. Leave "Source of truth?" blank — that's the human's call.

### 🛑 MICRO-GATE: Inventory review

Post the writer inventory table to chat (and append to the Day 3 report). **Stop and wait for the human to confirm:**

1. Whether this is the complete list (any writers you might have missed?)
2. Which writer is the source of truth (modern path vs legacy)
3. Whether to remove the loser(s) entirely or just remove the `lifetime_tabs_earned` line from them

Do not proceed to T3.2 without this confirmation. The cost of being wrong here is double-counted lifetime tabs that you only discover after the kickoff.

### T3.2 — Remove the losing writer(s)

Once the human confirms which writer wins, remove `lifetime_tabs_earned` writes from the losers. Be surgical: remove ONLY the `lifetime_tabs_earned` line unless the human explicitly approved removing the whole function. Other fields in the same PATCH (like `tab_balance`, which you already removed in Day 2, or `ratings_this_week`, which you must NOT touch) get handled separately.

Verify after each edit:
```bash
cd <APP_DIR>
grep -n 'lifetime_tabs_earned' lib/tabs.js
```
Should match only the writers the human said are the source of truth.

### T3.3 — Reconciliation migration

Write a one-shot reconciliation that recomputes `lifetime_tabs_earned` from `tabs_ledger` and updates any drift. **Verify the column names against the live schema before writing the SQL** — don't trust assumptions.

```bash
<DB_EXEC> -c "\d tabs_ledger"
<DB_EXEC> -c "\d user_tabs_profile"
```

Confirm the actual column names (the audit assumes `amount` but the reviewer didn't verify this — check it).

Save the migration as `<MIGRATIONS_DIR>/$(date +%Y%m%d%H%M%S)_hardening_reconcile_lifetime_tabs.sql`:

```sql
BEGIN;

WITH computed AS (
  SELECT user_id, COALESCE(SUM(<amount_column>) FILTER (WHERE <amount_column> > 0), 0) AS expected
  FROM tabs_ledger
  WHERE event_type IN (<list of award event types — verify against actual data>)
  GROUP BY user_id
)
UPDATE user_tabs_profile utp
SET lifetime_tabs_earned = c.expected
FROM computed c
WHERE utp.user_id = c.user_id
  AND utp.lifetime_tabs_earned IS DISTINCT FROM c.expected
RETURNING utp.user_id, utp.lifetime_tabs_earned AS new_value;

COMMIT;
```

The `event_type IN (...)` filter matters because you only want to count awards, not deductions or transfers. Query the live data to find the actual event types:

```bash
<DB_EXEC> -c "SELECT DISTINCT event_type FROM tabs_ledger ORDER BY event_type;"
```

### T3.4 — Apply and verify reconciliation

```bash
<DB_EXEC> < <MIGRATIONS_DIR>/<your-migration-file>
```

Capture the RETURNING output. If any rows were updated, that's evidence the dual-writer was actively double-counting. Note this in the report — it's a real finding.

### T3.5 — End-to-end test with the simulator

Coordinate with the human. Capture before-state, have them submit a rating from the simulator, capture after-state.

```bash
# Before
<DB_EXEC> -c "
SELECT lifetime_tabs_earned, tabs_balance
FROM user_tabs_profile utp
JOIN profiles p ON p.id = utp.user_id
WHERE utp.user_id = '061d5154-c846-49e5-9758-d279bb3ab8bd';
"

# (human submits one rating)

# After (same query)
```

The delta should match what the modern award path grants for one rating. Confirm with the human what value to expect (depends on tier + seeder status). If the delta is zero or doubled, STOP — something is wrong with the writer removal.

### Verification

**V3.1 — No drift after reconciliation**
```bash
<DB_EXEC> -c "
WITH computed AS (
  SELECT user_id, COALESCE(SUM(<amount_column>) FILTER (WHERE <amount_column> > 0), 0) AS expected
  FROM tabs_ledger
  WHERE event_type IN (<award types>)
  GROUP BY user_id
)
SELECT COUNT(*) AS drift_count
FROM user_tabs_profile utp
JOIN computed c ON c.user_id = utp.user_id
WHERE utp.lifetime_tabs_earned IS DISTINCT FROM c.expected;
"
```
Expected: `drift_count = 0`.

**V3.2 — Single-writer test passed (T3.5 above)**

**V3.3 — Container healthy**
```bash
<REBUILD_API>
curl -sf https://api.beerbook.drinksafterwork.net/api/health
```

### Rollback
```bash
cd <APP_DIR>
git reset --hard hardening-day-2-complete
# Restore from the Day 0 backup if reconciliation went wrong
docker exec -e PGPASSWORD=$(grep <DB_PASSWORD_ENV_VAR> <ENV_FILE> | cut -d= -f2) <DB_CONTAINER> pg_restore -U postgres -d postgres --clean /opt/daw-platform/backups/hardening/<backup-filename>
<REBUILD_API>
```

**Note:** restoring the dump destroys all data created since Day 0. Only use this with explicit human approval.

### Day 3 commit and tag
```bash
cd <APP_DIR>
git add -A
git commit -m "[day-3] tabs economy: writer inventory + remove dual writer + reconciliation"
git tag hardening-day-3-complete
```

File a Day 3 report including the writer inventory table, the reconciliation drift count, and the simulator test result.

---

## Day 4 — Tabs Economy Integrity (Part 2): Competing Writers Race

**Goal:** Eliminate the Monday 00:00 race between `weekly-tabs-eval.js` and concurrent rating submissions. This is the "Proper" fix the human chose.

**Audit findings addressed:** Section 2.3 (competing writers on user_tabs_profile).

**Important reframing from v1:** Reviewer #2 confirmed that `ratings_this_week` is migrating from authoritative state to non-authoritative cache. The live value is computed via the `count_ratings_this_week` RPC. The race that matters today is therefore NOT on `ratings_this_week` — it's on `current_tier`, `current_streak_weeks`, and `weeks_inactive`. Day 4's PL/pgSQL function fixes the race on those fields and explicitly leaves `ratings_this_week` as a cache update (because changing that requires the coordinated cache-removal task in Appendix D, which is post-launch).

**Critical invariant to preserve:** `weekly-tabs-eval.js` currently uses asymmetric signals:
- **Demotion** uses raw prior-week ratings count from a SELECT against the `ratings` table
- **Promotion** uses the cached `current_streak_weeks` field (which is itself maintained by the `refresh_rating_award_profile_cache` RPC, tier-aware since migration `20260426140000`)

If your PL/pgSQL function recomputes both from the same source, you change tier behavior in ways that won't show up until users hit promotion or demotion boundaries weeks later. **The function must preserve the asymmetry exactly.**

### Background

Currently `weekly-tabs-eval.js:118-188` does, per user:
1. `GET /user_tabs_profile?user_id=eq.X`
2. `GET /ratings?user_id=eq.X&created_at=gte.<from>&created_at=lte.<to>` (prior-week ratings count, used for demotion check)
3. Compute new tier/streak/weeks_inactive in JS
4. `PATCH /user_tabs_profile?user_id=eq.X` (write the result)

Concurrent rating submissions during the eval window can:
1. Read the same profile mid-eval (via `awardTabsForRating` or the modern RPC)
2. Compute and PATCH new state
3. Get overwritten by the eval's PATCH (which used a stale read)

The fix: a PL/pgSQL function `eval_user_weekly_tabs(p_user_id uuid)` that does the SELECT, the prior-week count, the computation, and the UPDATE inside a single transaction with `SELECT ... FOR UPDATE` on the profile row. The cron script becomes a thin loop that calls the RPC per user.

### Tasks

**T4.1 — Read and document the existing eval logic**

```bash
cat <APP_DIR>/scripts/weekly-tabs-eval.js
```

Document the EXACT computation in the Day 4 report under "Before snapshot." Include:
- How `currentTier` is determined
- How `maintenanceMin` is computed (tier-dependent)
- Where `currentStreak` comes from (cached field — confirm this)
- Where `weeksInactive` is incremented and decremented
- The promotion check (uses `currentStreak` against `nextReq.required_consecutive_weeks`)
- The demotion check (uses prior-week `ratingsCount` against `maintenanceMin`)
- The full set of fields written in the final PATCH

This documentation IS the spec for the PL/pgSQL function. If you can't write a clear "before snapshot," you don't understand the logic well enough to port it. STOP and read more.

### 🛑 MICRO-GATE: Eval logic understanding

Post the "Before snapshot" to chat (and append to the Day 4 report). **Stop and wait for the human to confirm** your understanding of:

1. Promotion uses cached `current_streak_weeks` (not recomputed from ratings)
2. Demotion uses raw prior-week ratings count (not from any cached field)
3. The full list of fields the function should write
4. Whether `ratings_this_week = 0` in the final PATCH should be preserved as a no-op cache update or removed

Do not proceed to T4.2 without this confirmation. This is the highest-risk migration in the entire 10-day plan.

### T4.2 — Write the migration

Save as `<MIGRATIONS_DIR>/$(date +%Y%m%d%H%M%S)_hardening_eval_user_weekly_tabs.sql`:

```sql
-- INVARIANT: This function MUST preserve the promotion-vs-demotion asymmetry
-- from the JS implementation in scripts/weekly-tabs-eval.js:
--
--   PROMOTION uses cached current_streak_weeks (maintained by
--   refresh_rating_award_profile_cache, tier-aware since 20260426140000).
--
--   DEMOTION uses raw prior-week ratings count from the ratings table.
--
-- If you change this function to recompute both from the same source, you
-- change tier behavior in ways that won't surface until users hit promotion
-- or demotion boundaries weeks later. Do not "simplify" this asymmetry.

BEGIN;

CREATE OR REPLACE FUNCTION eval_user_weekly_tabs(
  p_user_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz
)
RETURNS TABLE (
  user_id uuid,
  prev_tier text,
  new_tier text,
  prev_streak integer,
  new_streak integer,
  prev_weeks_inactive integer,
  new_weeks_inactive integer,
  prior_week_ratings_count integer,
  promoted boolean,
  demoted boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_profile record;
  v_current_tier text;
  v_current_streak integer;
  v_weeks_inactive integer;
  v_maintenance_min integer;
  v_required_consecutive integer;
  v_next_tier text;
  v_prior_count integer;
  v_promoted boolean := false;
  v_demoted boolean := false;
BEGIN
  -- Lock the profile row for the duration of the transaction.
  -- Concurrent rating submissions on this user will block here until commit.
  SELECT * INTO v_profile
  FROM user_tabs_profile
  WHERE user_tabs_profile.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_current_tier := COALESCE(v_profile.current_tier, 'taster');
  v_current_streak := COALESCE(v_profile.current_streak_weeks, 0);
  v_weeks_inactive := COALESCE(v_profile.weeks_inactive, 0);

  -- DEMOTION SIGNAL: raw prior-week ratings count (NOT from cache)
  SELECT COUNT(*) INTO v_prior_count
  FROM ratings
  WHERE ratings.user_id = p_user_id
    AND ratings.created_at >= p_window_start
    AND ratings.created_at <= p_window_end;

  -- Look up tier requirements
  -- TODO: Replicate the exact logic from weekly-tabs-eval.js for:
  --   - Reading tier requirements (table name? function?)
  --   - Computing maintenance_min for current_tier
  --   - Computing required_consecutive_weeks for next_tier
  --   - The demotion threshold (audit says "fewer than 2 ratings/week for 4 consecutive weeks")
  --   - The exact write set
  --
  -- DO NOT FILL THIS IN UNTIL THE MICRO-GATE ABOVE IS APPROVED.
  -- The skeleton above is the structural commitment; the logic below is
  -- where the human-confirmed spec from T4.1 gets implemented.

  -- (placeholder — replaced with real logic post-micro-gate)
  v_next_tier := NULL;

  -- PROMOTION SIGNAL: cached current_streak_weeks
  -- IF v_current_streak >= v_required_consecutive THEN
  --   v_current_tier := v_next_tier;
  --   v_current_streak := 0;
  --   v_promoted := true;
  -- END IF;

  -- DEMOTION: increment or reset weeks_inactive based on prior-week count
  -- IF v_prior_count < v_maintenance_min THEN
  --   v_weeks_inactive := v_weeks_inactive + 1;
  --   IF v_weeks_inactive >= 4 THEN
  --     -- demote
  --     v_demoted := true;
  --   END IF;
  -- ELSE
  --   v_weeks_inactive := 0;
  -- END IF;

  -- Write the result
  UPDATE user_tabs_profile
  SET
    current_tier = v_current_tier,
    current_streak_weeks = v_current_streak,
    weeks_inactive = v_weeks_inactive,
    -- ratings_this_week = 0 is preserved here as a non-authoritative cache update
    -- (matches existing JS behavior; see Appendix D for the post-launch removal task)
    ratings_this_week = 0,
    updated_at = now()
  WHERE user_tabs_profile.user_id = p_user_id;

  RETURN QUERY SELECT
    p_user_id,
    v_profile.current_tier,
    v_current_tier,
    COALESCE(v_profile.current_streak_weeks, 0),
    v_current_streak,
    COALESCE(v_profile.weeks_inactive, 0),
    v_weeks_inactive,
    v_prior_count::integer,
    v_promoted,
    v_demoted;
END;
$$;

COMMIT;
```

This is a structural skeleton with the invariant baked in as a comment. **You fill in the actual logic only after the next micro-gate.**

### 🛑 MICRO-GATE: Migration SQL review

Post the completed migration (with real logic, not just the skeleton) to chat. **Stop and wait for the human to confirm:**

1. The promotion-vs-demotion asymmetry is preserved
2. The field write set matches what `weekly-tabs-eval.js` currently writes
3. The `FOR UPDATE` lock is in place
4. The migration is idempotent (re-running it should be safe — it uses `CREATE OR REPLACE`)

Do not run the migration without explicit approval.

### T4.3 — Apply the migration

```bash
<DB_EXEC> < <MIGRATIONS_DIR>/<your-migration-file>
```

Verify the function exists:
```bash
<DB_EXEC> -c "\df eval_user_weekly_tabs"
```

### T4.4 — Update `weekly-tabs-eval.js` to call the RPC

Replace the per-user GET + computation + PATCH block with a single RPC call. Keep the surrounding loop, error handling, and `claim_job_run` / `fail_job_run` logic intact. Pass the window start/end from the existing JS computation:

```javascript
for (const profile of allProfiles) {
  try {
    const result = await rest('POST', '/rpc/eval_user_weekly_tabs', {
      p_user_id: profile.user_id,
      p_window_start: from,  // existing variable
      p_window_end: to,       // existing variable
    });
    // log result for observability
    console.log(`[weekly-eval] ${profile.user_id}:`, result);
  } catch (err) {
    console.error(`[weekly-eval] ${profile.user_id} failed:`, err);
    // continue to next user — don't crash the whole eval
  }
}
```

Match the exact `rest()` signature you discovered in P0.0.7. If `rest()` returns `{ status, body }` instead of just the body, adjust accordingly.

### T4.5 — Dry-run the new path against the test user

```bash
<DB_EXEC> -c "
SELECT * FROM eval_user_weekly_tabs(
  '061d5154-c846-49e5-9758-d279bb3ab8bd',
  '<window start matching current eval window>',
  '<window end>'
);
"
```

Expected: returns one row with the computed transitions. **Compare against what the JS would have produced for the same user with the same window.** If they differ, STOP and investigate — the logic port is wrong.

### Verification

**V4.1 — Function exists and is callable**
```bash
<DB_EXEC> -c "\df eval_user_weekly_tabs"
```

**V4.2 — Race test (manual, coordinate with human)**

Open two terminals. Terminal A calls the RPC for the test user. Terminal B simultaneously POSTs a rating from the simulator. Verify:
- Both operations complete without error
- The rating's effects are not lost (check `lifetime_tabs_earned` delta)
- The eval's `current_tier` / `current_streak_weeks` updates are intact

The exact procedure depends on the test user's current state — coordinate with the human.

**V4.3 — Cron syntax check**
```bash
cd <APP_DIR> && node -c scripts/weekly-tabs-eval.js
```

**V4.4 — Container healthy**
```bash
curl -sf https://api.beerbook.drinksafterwork.net/api/health
```

### Rollback
```bash
cd <APP_DIR>
git reset --hard hardening-day-3-complete
<DB_EXEC> -c "DROP FUNCTION IF EXISTS eval_user_weekly_tabs(uuid, timestamptz, timestamptz);"
<REBUILD_API>
```

### Day 4 commit and tag
```bash
git add -A
git commit -m "[day-4] tabs economy: atomic eval_user_weekly_tabs RPC with FOR UPDATE lock"
git tag hardening-day-4-complete
```

File a Day 4 report. The next day is the kickoff — you don't execute, you monitor.

---

## Day 5 — Seeder Kickoff (Human Event, Agent Monitors Only)

**Goal:** The human runs the seeder kickoff with their 12+ users. Your job is to watch.

**You execute zero code changes today.** No commits, no migrations, no rebuilds. If you find a bug, document it, do not fix it. Day 6 is for triage.

### Monitoring tasks

**M5.1 — Tail logs throughout the kickoff window**
```bash
docker logs -f <API_CONTAINER> 2>&1 | tee /tmp/kickoff_$(date +%Y%m%d).log
```

**M5.2 — Watch for these specific patterns and report immediately**

- `[FATAL]` — process-level error
- `[ERROR]` from the new error middleware
- `unhandledRejection`
- HTTP 500 in any response
- PostgREST connection errors
- Container restart events (`docker ps` shows a new uptime)

**M5.3 — Snapshot the tabs ledger before and after**
```bash
TS=$(date +%Y%m%d_%H%M%S)
# Before kickoff
<DB_EXEC> -c "
SELECT user_id, tabs_balance, lifetime_tabs_earned, ratings_this_week, current_streak_weeks, current_tier
FROM user_tabs_profile
ORDER BY user_id;
" > /tmp/kickoff_before_${TS}.txt

# After kickoff (coordinate timing with human)
<DB_EXEC> -c "<same query>" > /tmp/kickoff_after_${TS}.txt

diff /tmp/kickoff_before_${TS}.txt /tmp/kickoff_after_${TS}.txt > /tmp/kickoff_diff_${TS}.txt
```

**M5.4 — Verify the reconciliation query still shows zero drift**
```bash
# Same query as V3.1 — drift_count must remain 0
```

If drift > 0 appears during the kickoff, that's evidence the dual-writer fix on Day 3 is incomplete OR the new RPC is double-counting. Surface immediately to the human — do not attempt to fix mid-kickoff.

### What to report at end of day

A monitoring summary including:
- Total ratings submitted during the window
- Any errors (with timestamps and request IDs)
- Whether the tabs ledger drift query returned zero
- Any container restarts
- Any cron jobs that fired (and their exit codes)
- Anything weird the human should know about before Day 6

**Do not commit anything. Do not tag.** Day 5 is intentionally a no-op for git history.

---

## Day 6 — Observability + Kickoff Triage

**Goal:** Add Sentry, fix anything the kickoff surfaced, and add the missing indexes.

**Audit findings addressed:** Section 4.3 (no error monitoring), #5 (composite indexes).

### Tasks

**T6.1 — Triage kickoff issues first**

Read the Day 5 report. For any bug surfaced during the kickoff, create a task list and present it to the human BEFORE doing the rest of Day 6. The human decides whether each bug is fix-now, fix-later, or no-fix. **This is a micro-gate.**

### T6.2 — Sentry integration

The human will provide:
- A Sentry DSN (`SENTRY_DSN` env var)
- Confirmation of the project name and environment label

Add to `<ENV_FILE>`:
```
SENTRY_DSN=<from human>
SENTRY_ENVIRONMENT=production
```

Install:
```bash
cd <APP_DIR> && npm install @sentry/node
```

**Check the installed version before integrating:**
```bash
cd <APP_DIR> && cat node_modules/@sentry/node/package.json | grep '"version"'
```

The Sentry Node SDK changed its middleware API meaningfully between v7 and v8. Match the integration pattern to the version you actually installed:

- **v7.x:** Use `Sentry.Handlers.requestHandler()` and `Sentry.Handlers.errorHandler()`
- **v8.x:** Use `Sentry.setupExpressErrorHandler(app)` after all routes; request tracing is automatic

Document which version you installed in the commit message so the next agent doesn't have to guess.

In `server.js`, BEFORE the `unhandledRejection` handler from Day 1, add:
```javascript
const Sentry = require('@sentry/node');

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || 'production',
    tracesSampleRate: 0.1,
  });
}
```

Update the `unhandledRejection` handler to call `Sentry.captureException(reason)` if Sentry is initialized.

Update the generic error middleware (from Day 1) to call `Sentry.captureException(err)` before responding.

Apply Sentry's request handler at the top of the middleware stack and Sentry's error handler before the generic error middleware, using the API that matches your installed version.

### T6.3 — Trigger a test error and confirm it lands in Sentry

Add a one-time test route (REMOVE before commit):
```javascript
app.get('/api/__sentry_test', (req, res) => { throw new Error('Sentry test error'); });
```

```bash
<REBUILD_API>
sleep 5
curl -s https://api.beerbook.drinksafterwork.net/api/__sentry_test
```

Ask the human to confirm the error appears in their Sentry dashboard within 60 seconds. Then remove the test route and rebuild.

### T6.4 — Add the missing indexes

Save as `<MIGRATIONS_DIR>/$(date +%Y%m%d%H%M%S)_hardening_missing_indexes.sql`:
```sql
BEGIN;

CREATE INDEX IF NOT EXISTS idx_ratings_user_id_created_at_desc
  ON ratings (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ratings_venue_id
  ON ratings (venue_id)
  WHERE venue_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reactions_user_id
  ON reactions (user_id);

CREATE INDEX IF NOT EXISTS idx_reactions_rating_id_reaction_type
  ON reactions (rating_id, reaction_type);

CREATE INDEX IF NOT EXISTS idx_profiles_created_at
  ON profiles (created_at);

CREATE INDEX IF NOT EXISTS idx_crews_invite_code
  ON crews (invite_code);

COMMIT;
```

**Before applying, cross-reference against the live indexes you found in P0.0.4.** If any of these already exist with a different name, drop them from the migration to avoid creating duplicates. The `IF NOT EXISTS` clause protects against name collisions but not against semantic duplicates (same columns, different name).

```bash
<DB_EXEC> < <MIGRATIONS_DIR>/<your-migration-file>
```

### Verification

**V6.1 — Sentry test error visible in dashboard** (human confirms)

**V6.2 — All expected indexes present**
```bash
<DB_EXEC> -c "
SELECT indexname FROM pg_indexes
WHERE tablename IN ('ratings','reactions','profiles','crews')
  AND indexname LIKE 'idx_%'
ORDER BY indexname;
"
```
Expected: includes the 6 indexes from the migration plus any pre-existing ones.

**V6.3 — Container healthy + no errors in logs**
```bash
curl -sf https://api.beerbook.drinksafterwork.net/api/health
docker logs <API_CONTAINER> --tail 50 2>&1 | grep -i 'error\|fatal'
```

### Day 6 commit and tag
```bash
cd <APP_DIR>
git add -A
git commit -m "[day-6] sentry @sentry/node@<version> + missing indexes + kickoff triage"
git tag hardening-day-6-complete
```

---

## Day 7 — Infrastructure Resilience

**Goal:** Docker healthcheck, memory limit, PostgREST pool tuning. Cheap, mechanical, high-leverage.

**Audit findings addressed:** Section 6 (no healthcheck, no memory limit, default pool).

### Tasks

**T7.1 — Docker healthcheck on `beerbook-api`**

The API container does NOT have curl installed (the v1 doc was wrong about this). Use `wget` if available, or a Node one-liner if not. Check what your discovery report (P0.0.1) said.

Edit `<COMPOSE_FILE>`. Under the `beerbook-api` service, add:

**If wget is available:**
```yaml
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3001/api/health || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
```

**If only node is available:**
```yaml
    healthcheck:
      test: ["CMD-SHELL", "node -e \"require('http').get('http://localhost:3001/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))\""]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
```

Use the actual port from `RUNBOOK_LOCALS.md` (3001 per the reviewer, but verify).

### T7.2 — Memory limit

Under the same service:
```yaml
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
    mem_limit: 512m  # legacy compose-v2 fallback
```

512M is a starting point. If the container is currently using more than that under normal load, bump to 768M or 1G — check `docker stats` first to see baseline usage.

### T7.3 — PostgREST pool tuning

Find the PostgREST service name in the compose file (likely `supabase-rest` per the reviewer's snippet). Add to its environment:
```yaml
      PGRST_DB_POOL: "25"
      PGRST_DB_MAX_ROWS: "5000"
```

### T7.4 — Apply and verify

```bash
docker compose -f <COMPOSE_FILE> up -d
sleep 30
docker ps --format '{{.Names}}\t{{.Status}}' | grep -E 'beerbook|rest'
```
Expected: `beerbook-api` shows `(healthy)` after the start period; PostgREST is `Up`.

### Verification

**V7.1 — Healthcheck reports healthy**
```bash
docker inspect <API_CONTAINER> --format '{{.State.Health.Status}}'
```
Expected: `healthy` (after waiting past `start_period`).

**V7.2 — Memory limit enforced**
```bash
docker stats <API_CONTAINER> --no-stream --format '{{.MemUsage}}'
```
Expected: shows `/ 512MiB` as the limit.

**V7.3 — PostgREST pool size active**
```bash
docker logs supabase-rest 2>&1 | grep -i 'pool\|connection' | tail -5
```

**V7.4 — End-to-end smoke test**
```bash
TOKEN=<from human>
for route in /api/profile /api/ratings /api/activity; do
  curl -sf -H "Authorization: Bearer $TOKEN" "https://api.beerbook.drinksafterwork.net$route" > /dev/null && echo "OK $route" || echo "FAIL $route"
done
```

### Rollback
```bash
cd <APP_DIR>
git reset --hard hardening-day-6-complete
docker compose -f <COMPOSE_FILE> up -d
```

### Day 7 commit and tag
```bash
git add -A
git commit -m "[day-7] docker healthcheck + memory limit + postgrest pool tuning"
git tag hardening-day-7-complete
```

---

## Day 8 — Final Sweep + Human Gate #2

**Goal:** Close remaining loose ends and stop for the final approval before launch.

### Tasks

**T8.1 — Add structured logging at the entry/error boundary**

Install pino:
```bash
cd <APP_DIR> && npm install pino pino-http
```

Replace the generic error middleware's `console.error` with a pino logger instance. Add `pino-http` as request middleware near the top of `server.js` (after Sentry's request handler if present). Configure the logger to include `x-request-id` in every log line.

**Do not** attempt to replace all 189 `console.log` calls. That's a post-launch task. We are only adding structured logging at the entry/exit boundary and in the error handler.

### T8.2 — Add per-user rate limit on `POST /api/ratings`

Use the existing `express-rate-limit`:
```javascript
const rateLimit = require('express-rate-limit');
const ratingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,  // 20 ratings per minute per user
  keyGenerator: (req) => req.claims?.sub || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
});
app.post('/api/ratings', ratingLimiter, asyncHandler(async (req, res) => { ... }));
```

Note the `keyGenerator` uses `req.claims?.sub` per the auth contract you discovered, not `req.user.id`.

### T8.3 — Verify all cron jobs are still scheduled
```bash
crontab -l
```
Expected: all jobs from your P0.0.5 inventory plus `streak-risk-check.js` from Day 2.

### T8.4 — Confirm Sentry is still capturing

Recreate the test route temporarily, trigger it, confirm with human, remove.

### T8.5 — Run the full smoke test suite
```bash
TOKEN=<from human>
for route in /api/health /api/profile /api/ratings /api/activity /api/tabs/profile /api/achievements/catalog; do
  status=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "https://api.beerbook.drinksafterwork.net$route")
  echo "$status $route"
done
```
Expected: all 200s (or 401 for `/api/health` if you didn't pass the token there — that's fine).

### T8.6 — Reconciliation sanity check

Re-run V3.1 drift query. Expected: 0.

### T8.7 — Verify the Day 0 backup is still on disk

```bash
ls -lh /opt/daw-platform/backups/hardening/
```
Expected: the preflight dump from P0.0.8 is present and unchanged in size.

### Day 8 commit and tag
```bash
git add -A
git commit -m "[day-8] structured logging + per-user rate limit + final smoke tests"
git tag hardening-day-8-complete
```

### 🛑 HUMAN GATE #2 — LAUNCH READINESS

File the Day 8 report including:
- A checklist of every audit Critical and High finding addressed (with the day it was fixed)
- The Sentry dashboard link (human confirms it's receiving)
- Tabs ledger drift count (must be 0)
- Cron schedule (full `crontab -l` output)
- Any deferred items the human should know about (point to Appendix D)
- Smoke test results
- Any LIVE-ONLY schema items from discovery that remain undocumented in the repo

**Wait for explicit human approval before Day 9.**

---

## Day 9 — Buffer Day

**Goal:** Catch anything that surfaces, address any human feedback from Gate #2, and let the system run untouched for 24 hours to confirm stability.

**No new features. No new tasks unless the human explicitly assigns one.** Use this day for:

- Tailing logs and Sentry
- Re-running the drift query periodically
- Confirming all crons fired on schedule
- Documentation updates
- Anything the Day 8 gate flagged

If the day is genuinely uneventful, that is the desired outcome. File a brief end-of-day report saying so.

---

## Day 10 — Launch Day

**Goal:** Public launch. You are in pure monitoring mode.

### Pre-launch checklist (run before the human flips the public switch)

```bash
# 1. Container health
docker ps --format '{{.Names}}\t{{.Status}}' | grep -v 'Up.*healthy' && echo "WARNING: unhealthy containers"

# 2. Disk space
df -h / | awk 'NR==2 {print $5}' | sed 's/%//' | awk '{if ($1 > 80) print "WARNING: disk at " $1 "%"}'

# 3. Tabs ledger drift (V3.1 query)

# 4. Sentry connectivity (human confirms)

# 5. Health endpoint
curl -sf https://api.beerbook.drinksafterwork.net/api/health || echo "WARNING: health endpoint failed"

# 6. All crons present
crontab -l | wc -l
crontab -l | grep -c streak-risk-check  # must be 1
```

If anything reports a warning, STOP and surface to the human before launch.

### During launch

Tail logs continuously. Watch Sentry. If a Critical issue appears (process crashes, sustained 5xx, ledger drift), STOP and surface immediately. Do not attempt to fix anything live without human approval — the cost of a bad fix during launch is worse than the bug.

### End of day

File a launch-day report: total requests, error count, any incidents, Sentry summary.

---

## Appendix A — Status Report Template

Use this format for every end-of-day report. File it as `<APP_DIR>/docs/hardening/day-N-report.md` and also paste it into the chat for the human.

```markdown
# Day N Report — YYYY-MM-DD

## Summary
One-paragraph plain-English description of what happened today.

## Tasks completed
- [x] T-N.1 Description — DONE
- [ ] T-N.2 Description — BLOCKED on <thing>

## Verification results
- V-N.1: <expected> / <actual> — PASS or FAIL
- V-N.2: ...

## Commits and tags
- <hash> [day-N] commit message
- Tag: hardening-day-N-complete

## Issues surfaced
Anything weird, unexpected, or that needs human attention.

## Questions for human
Any blockers or decisions needed before proceeding.

## Next day
Ready to proceed / Blocked on <thing>.
```

---

## Appendix B — Audit Finding Coverage Map

| Audit finding | Severity | Day addressed |
|---|---|---|
| #1 Unhandled rejections crashing process | Critical | Day 1 |
| #2 Worst unbounded queries | Critical | Day 2 (worst 4 only) |
| #3 Docker healthcheck + memory limit | Critical | Day 7 |
| #4 streak-risk-check cron not scheduled | High | Day 2 |
| #5 Missing composite indexes | High | Day 6 |
| #6 Activity feed refactor | High | DEFERRED post-launch |
| #7 Dead writes on tab_balance | High | Day 2 |
| #7 Dual writer on lifetime_tabs_earned | High | Day 3 |
| #8 Queue achievement evaluation | High | DEFERRED post-launch |
| #9 Structured logging | Medium | Day 8 (entry/error only) |
| #10 PostgREST pool tuning | Medium | Day 7 |
| Section 2.3 competing writers on user_tabs_profile | High | Day 4 |
| Section 3.1 unauthenticated tabs profile route | Medium (elevated to High) | Day 2 |
| Section 4.3 no error monitoring (Sentry) | High | Day 6 |
| RLS on 33 tables | Medium | DEFERRED post-launch |
| elo-snapshot idempotency | High (audit) / Low (real risk) | DEFERRED post-launch |
| File uploads to S3/CDN | Medium | DEFERRED post-launch |
| Per-user rate limiting | Medium | Day 8 (POST /api/ratings only) |

---

## Appendix C — Emergency Rollback (Full Plan)

If something goes catastrophically wrong and you need to revert the entire 10-day plan:

```bash
cd <APP_DIR>
git reset --hard hardening-day-0-baseline
crontab /tmp/crontab.bak  # if Day 2 was reached
docker exec -e PGPASSWORD=$(grep <DB_PASSWORD_ENV_VAR> <ENV_FILE> | cut -d= -f2) <DB_CONTAINER> pg_restore -U postgres -d postgres --clean /opt/daw-platform/backups/hardening/<preflight-dump-filename>
<REBUILD_API>
```

**Restoring the dump destroys all data created since Day 0.** Only use this in true emergencies and only with explicit human approval.

---

## Appendix D — What's NOT in this plan (and why)

- **Activity feed refactor (audit #6)** — Multi-day design work. Will not break at launch scale. Schedule for week 2 post-launch.

- **Achievement evaluation queue (audit #8)** — Architectural decision (BullMQ? pg-boss?) deserves a dedicated sprint. 200-600ms latency is annoying but not broken at launch scale.

- **Coordinated `ratings_this_week` cache removal** — `ratings_this_week` is migrating from authoritative to cache, with the live value computed via the `count_ratings_this_week` RPC. The legacy writers (`awardTabsForRating`, `awardSingleSourceTabs`, the weekly eval) still write to the cached field. Removing those writes is NOT safe today because there are still readers (`streak-risk-check.js`, possibly others). The post-launch task is: (1) audit every reader of `user_tabs_profile.ratings_this_week`, (2) migrate each reader to `count_ratings_this_week` RPC, (3) THEN remove the writes. This is a coordinated cache-removal task, not a small cleanup, and it does not belong in pre-launch hardening.

- **Replacing 189 console.log calls** — Day 8 adds structured logging at entry/error boundaries only. Full replacement is post-launch hygiene.

- **RLS on 33 tables** — Defense in depth, not active vulnerability. BFF pattern means service_role bypasses anyway. Post-launch.

- **File uploads to S3/CDN** — Disk is at 77% but stable. Move post-launch when there's time to do it right.

- **elo-snapshot idempotency** — Cron runs once daily, you'd have to manually re-run to create duplicates. Genuinely low risk pre-launch.

- **Cron failure alerting** — Sentry covers the API. Cron alerting is a separate integration (Slack webhook from each script). Post-launch.

- **Retroactively committing LIVE-ONLY schema items to the repo** — The discovery phase (P0.0.4) will surface functions/indexes that exist on the VPS but not in the repo migration files. This plan documents them but does not commit them retroactively. That's a separate cleanup task because deciding the right migration timestamp and ordering for already-applied schema is its own design question.

If the human wants any of these elevated, surface it at Gate #1 or Gate #2.
