# Phase 4.6 — Missing Test Coverage

**Status:** Implemented (2026-03-07)  
**Issue addressed:** BE-H-07  
**Root cause:** Critical paths (scheduler, Edge parity, migration safety, nav) untested

---

## Summary

Added backend test coverage for scheduler idempotency, scheduler population >10k, notification dedupe contract, and documented migration safety policy in CI. Node-vs-Edge parity remains covered by existing `process-event-engine-parity.test.js`. Frontend navigation reachability tests were not implemented: no frontend app (React Navigation / route manifest) exists in this workspace.

---

## Files Changed

| File | Change |
|------|--------|
| `apps/beerbook-api/scripts/weekly-tabs-eval.js` | Refactored to accept optional `rest` for tests; export `run(restFn)`, `previousWeekRange`, `JOB_NAME`, `PAGE_SIZE`. `createRest()` used when run as main; `SERVICE_ROLE_KEY` check only when `require.main === module`. |
| `apps/beerbook-api/scripts/streak-risk-check.js` | Refactored to accept optional `rest` for tests; export `run(restFn)`, `JOB_NAME`, `PAGE_SIZE`. Same main-vs-require guard. |
| `apps/beerbook-api/test/scheduler-idempotency-and-coverage.test.js` | **New.** Four tests: weekly_tabs_eval idempotency (claim false → skip), streak_risk_check idempotency (claim false → skip), weekly_tabs_eval population >10k (paginated 11k users, `complete_job_run` receives total), notification dedupe (streak script uses `insert_scheduler_notification` with `p_week_start`). |
| `apps/beerbook-api/test/README.md` | **New.** Test suites list and CI policy: run `npm test` and `npm run ci:check-migrations`; recommendation to add both to CI. |

---

## Validation Steps Completed

### Tests run

- Full suite: `npm test` in `apps/beerbook-api` — **29 tests pass**, 0 failures.
- New suite only: `node --test test/scheduler-idempotency-and-coverage.test.js` — **4 tests pass**.
- Migration safety: `npm run ci:check-migrations` — **15 migration files scanned, no destructive patterns.**

### Exact validation commands

```bash
cd c:\Users\kenyo\OneDrive\Desktop\daw-platform\daw-platform\apps\beerbook-api
npm test
node --test test/scheduler-idempotency-and-coverage.test.js
npm run ci:check-migrations
```

### Regression

Existing tests (process-event parity, cosmetics, achievements, cosmetics integration) remain green; no behavior change to HTTP/API.

---

## Contract / Doc Implications

- **HTTP/API:** No contract changes. Scheduler scripts are internal (cron/job runner); only testability refactor (optional `rest` injection) and exports for tests.
- **CI policy docs:** `test/README.md` documents test suites and that migration safety check should run in CI (`npm run ci:check-migrations`). No existing project-level CI workflow was modified (none found under `daw-platform` for beerbook-api).

---

## Known Risks and Follow-Up Items

1. **Frontend navigation reachability:** PHASE_4_EXECUTION_PLAN item 4.6 includes “Frontend: navigation reachability (every registered route has ≥1 entry path).” Not implemented in this workspace — no frontend app or route manifest present. Add in the frontend repo when available.
2. **Migration safety in CI:** The migration check is documented and runnable; wiring it into a concrete CI workflow (e.g. GitHub Actions) is left to the project’s CI setup.
3. **Scheduler scripts when required as module:** Loading the scripts via `require()` (e.g. in tests) no longer requires `SUPABASE_SERVICE_ROLE_KEY`; only running them as main does. Safe for test environment.

---

## What Was Not Done (scope limit)

- No other Phase 4 items (4.1–4.5, 4.7).
- No refactor of code unrelated to scheduler testability or test/docs for 4.6.
- No frontend tests (navigation reachability) — frontend not in workspace.
