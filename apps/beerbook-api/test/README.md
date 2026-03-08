# BeerBook API — Test Suites

Backend tests for the BeerBook BFF (Node, `node --test`). Phase 4.6 adds scheduler and CI policy coverage.

## Running tests

```bash
cd apps/beerbook-api
npm test
```

Runs all `*.test.js` and `*.integration.test.js` under `test/` via `node --test`.

## Test suites

| Suite | Description |
|-------|-------------|
| `process-event-engine-parity.test.js` | Node vs Edge process-event parity: same input → same response shape (canonical keys, streak fields, RPC calls). |
| `process-event-engine-cosmetics.test.js` | Process-event cosmetics: achievement unlock → border/title grants, cap behavior, idempotency, error propagation. |
| `achievements-fallback.integration.test.js` | GET /api/achievements fallback and next; user-scoped and foreign profile. |
| `achievements-profile-scope.integration.test.js` | Achievements and profile scope. |
| `cosmetics.integration.test.js` | Cosmetics purchase, equip, user cosmetics. |
| `scheduler-idempotency-and-coverage.test.js` | **Phase 4.6.** Scheduler idempotency (weekly_tabs_eval, streak_risk_check double-run no-op), population >10k pagination, notification dedupe contract. |

## CI policy (migration safety)

Migration files in `supabase/migrations/` must not contain destructive patterns. Run before commit or in CI:

```bash
npm run ci:check-migrations
```

This scans all `.sql` files for:

- `TRUNCATE … CASCADE`
- Unguarded `DROP TABLE`
- `DELETE FROM table;` without `WHERE`

Exit code 1 if any violation is found. See `scripts/check-migration-safety.js`.

**Recommendation:** Add `npm run ci:check-migrations` and `npm test` to your CI pipeline (e.g. GitHub Actions) so migration safety and all tests run on every PR.
