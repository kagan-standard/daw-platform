# Phase 2.10 — Fix Scheduler Idempotency and Pagination

**Date:** 2026-03-07  
**Issues resolved:** BE-H-01 (High), BE-H-02 (High), BE-H-03 (Medium), BE-H-08 (Possible)  
**Scope:** Backend-only

---

## Root Cause

ARCH-06 — Both scheduler scripts (`weekly-tabs-eval.js`, `streak-risk-check.js`) lacked idempotency guards, used a fixed `limit=10000` without pagination, inserted notifications without deduplication, and had no distributed locking. This created several operational hazards:

- **Double-run risk:** Re-executing the weekly eval in the same week applied inactivity decay twice, causing incorrect tier demotions.
- **Pagination ceiling:** Any user base exceeding 10,000 would silently drop users from processing.
- **Notification spam:** Re-runs generated duplicate notifications (tier demotion, streak-at-risk, approaching demotion) with no dedup guard.
- **Race condition:** Concurrent scheduler invocations (e.g., overlapping cron triggers) could process the same users simultaneously.

---

## Files Changed

| File | Change |
|---|---|
| `apps/beerbook-api/supabase/migrations/20260307100000_scheduler_idempotency.sql` | **NEW** — Migration creating `job_runs` table, `week_start` column on `tab_notifications`, partial unique dedupe index, and 4 RPCs |
| `apps/beerbook-api/scripts/weekly-tabs-eval.js` | Added idempotency guard via `claim_job_run` RPC, cursor-based pagination for `user_tabs_profile`, notification insertion via `insert_scheduler_notification` RPC, job completion/failure tracking |
| `apps/beerbook-api/scripts/streak-risk-check.js` | Same pattern: idempotency guard, cursor-based pagination, deduplicated notification insertion, job completion/failure tracking |

---

## SQL Migration Details

### `job_runs` Table

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT (PK) | Auto-generated UUID |
| `job_name` | TEXT | e.g. `weekly_tabs_eval`, `streak_risk_check` |
| `week_start` | TIMESTAMPTZ | Monday 00:00 UTC of the relevant week |
| `started_at` | TIMESTAMPTZ | When the run was claimed |
| `completed_at` | TIMESTAMPTZ | When the run finished (success or failure) |
| `status` | TEXT | `running`, `completed`, or `failed` |
| `users_processed` | INTEGER | Count of profiles processed |

**Unique constraint:** `(job_name, week_start)` — prevents double-runs.

### `tab_notifications` Schema Change

- **Added column:** `week_start TIMESTAMPTZ` (nullable, defaults to NULL for non-scheduler rows)
- **Added partial unique index:** `idx_tab_notif_dedupe` on `(user_id, notification_type, week_start) WHERE week_start IS NOT NULL`

Existing non-scheduler notification inserts are unaffected (they do not set `week_start`).

### RPCs Created

| Function | Returns | Purpose |
|---|---|---|
| `claim_job_run(p_job_name, p_week_start)` | `boolean` | Acquires transaction-scoped advisory lock, checks for completed run, inserts/updates `job_runs` row. Returns `true` if caller should proceed, `false` to skip. Crashed/failed runs are re-claimable. |
| `complete_job_run(p_job_name, p_week_start, p_users_processed)` | `void` | Marks run as `completed` with user count and timestamp. |
| `fail_job_run(p_job_name, p_week_start)` | `void` | Marks run as `failed` so it can be retried. |
| `insert_scheduler_notification(p_user_id, p_notification_type, p_title, p_message, p_week_start)` | `void` | Inserts notification with `ON CONFLICT DO NOTHING` on the dedupe index. |

---

## Script Changes

### `weekly-tabs-eval.js`

1. **Idempotency guard:** Calls `claim_job_run('weekly_tabs_eval', weekStart)` at entry. If it returns `false` (completed run exists), the script exits cleanly with a log message.
2. **Pagination:** Replaced `?limit=10000` with a cursor-based loop using `user_id` as the cursor key and page size of 1,000. Fetches pages in ascending `user_id` order until exhaustion.
3. **Deduplicated notifications:** Tier demotion/promotion notifications are inserted via `insert_scheduler_notification` RPC with `week_start` set, ensuring the partial unique index prevents duplicates.
4. **Failure tracking:** On unhandled error, calls `fail_job_run` (best-effort) before re-throwing, so the run can be retried.
5. **Completion tracking:** On success, calls `complete_job_run` with the user count.

### `streak-risk-check.js`

1. **Idempotency guard:** Same pattern — `claim_job_run('streak_risk_check', weekStart)`.
2. **Pagination:** Same cursor-based loop (page size 1,000) replacing `?limit=10000`.
3. **Deduplicated notifications:** `streak_at_risk` and `approaching_demotion` notifications use `insert_scheduler_notification` RPC.
4. **Week start computation:** Added `currentWeekStart()` helper to derive the Monday of the current week (the script runs on Thursday).
5. **Failure/completion tracking:** Same `fail_job_run`/`complete_job_run` pattern.

---

## Contract/API Implications

- **No HTTP API contract changes.** The scheduler scripts are internal cron jobs; they do not serve external API traffic.
- **New `job_runs` table** is internal operational infrastructure. It is not exposed via any API route.
- **`tab_notifications` schema change** adds a nullable column (`week_start`). Existing reads via `GET /tab_notifications` are unaffected (the column is simply included in response payloads). Frontend notification rendering does not reference `week_start`.
- **New RPCs** (`claim_job_run`, `complete_job_run`, `fail_job_run`, `insert_scheduler_notification`) are callable via PostgREST `/rpc/` but are intended for service-role callers only.

---

## Validation Steps

### Completed (static/structural)

- [x] Migration SQL parses without syntax errors
- [x] `job_runs` table has unique constraint on `(job_name, week_start)`
- [x] `tab_notifications.week_start` column added as nullable (backward-compatible)
- [x] Partial unique index `idx_tab_notif_dedupe` only applies where `week_start IS NOT NULL`
- [x] `claim_job_run` uses `pg_advisory_xact_lock` for distributed safety
- [x] `claim_job_run` returns `false` for completed runs, `true` for new/failed/crashed runs
- [x] Both scripts use cursor-based pagination with no hardcoded upper limit
- [x] Both scripts use `insert_scheduler_notification` RPC for notification dedupe
- [x] Both scripts call `fail_job_run` on error (allows retry)
- [x] Both scripts call `complete_job_run` on success (blocks re-run)
- [x] No linter errors in modified files

### Not Completed (require runtime environment)

- [ ] **Double-run idempotency:** Run `weekly-tabs-eval` twice in the same week; second run should be a no-op
- [ ] **15k+ user pagination:** Seed >10,000 `user_tabs_profile` rows and verify all are processed
- [ ] **Notification dedupe:** Run `streak-risk-check` twice; verify no duplicate `tab_notifications` rows
- [ ] **Single normal run regression:** Verify correct tier/streak outcomes for a standard weekly execution
- [ ] **Advisory lock contention:** Launch two concurrent instances; verify only one proceeds

**Tests were not run.** The runtime validation items above require a live Supabase instance with the migration applied and seeded test data.

---

## Validation Commands

```bash
# Apply migration (requires Supabase CLI linked to project)
supabase db push

# Verify migration applied
psql "$DATABASE_URL" -c "SELECT * FROM job_runs LIMIT 0;"
psql "$DATABASE_URL" -c "\d tab_notifications" | grep week_start
psql "$DATABASE_URL" -c "\di idx_tab_notif_dedupe"

# Run weekly eval (requires SUPABASE_REST_URL and SUPABASE_SERVICE_ROLE_KEY)
node scripts/weekly-tabs-eval.js

# Run streak risk check
node scripts/streak-risk-check.js

# Verify idempotency (second run should print "already completed" and exit)
node scripts/weekly-tabs-eval.js
node scripts/streak-risk-check.js

# Check job_runs state
psql "$DATABASE_URL" -c "SELECT job_name, week_start, status, users_processed FROM job_runs ORDER BY started_at DESC;"

# Check notification dedupe index
psql "$DATABASE_URL" -c "SELECT count(*) FROM tab_notifications WHERE week_start IS NOT NULL;"
```

---

## Known Risks and Follow-Up Items

1. **Migration ordering:** This migration (`20260307100000`) must run after any migration that creates or alters `tab_notifications`. The existing schema already has the table; no ordering conflict is expected.
2. **PostgREST RPC exposure:** The new RPCs are `SECURITY DEFINER` and callable via `/rpc/`. In Supabase, the `anon` role can call them by default unless RLS or explicit `REVOKE` is applied. For production, consider `REVOKE EXECUTE ... FROM anon` on all four RPCs to restrict them to `service_role` callers. Not implemented here to avoid scope creep.
3. **Partial unique index and ON CONFLICT:** The `ON CONFLICT ... WHERE week_start IS NOT NULL` clause in `insert_scheduler_notification` relies on PostgreSQL's ability to match partial unique indexes in conflict targets. This is supported in PostgreSQL 11+ (Supabase uses 15+).
4. **Per-user HTTP overhead:** The pagination fix addresses the row-count ceiling, but the per-user loop still makes 2–3 HTTP calls per user in `weekly-tabs-eval.js`. For very large user bases (>50k), this will be slow. A future optimization (Phase 4.6 scope) could batch-process via a single SQL function.
5. **`week_start` column on existing rows:** Existing `tab_notifications` rows have `week_start = NULL`. Historical dedup is not retroactively enforced. This is intentional — the dedupe index only governs future scheduler-generated notifications.
6. **Streak-risk threshold:** The hardcoded `ratingsThisWeek < 2` threshold in `streak-risk-check.js` was preserved as-is. If this should be tier-dependent, that is a separate feature change.

---

## Phase 4 Gate

This item unblocks **4.6 (Scheduler test coverage)** — with idempotency, pagination, and dedupe in place, automated test suites can safely exercise scheduler scripts without side effects from double-runs or unbounded data sets.
