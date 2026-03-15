# Phase 1.7 — Destructive Migration Safety

**Date:** 2026-03-07
**Issue:** BE-H-05 (High)
**Status:** Implemented

---

## Problem

The standard Supabase migration file `20260306_ledger_migration_reset.sql` contained unconditional `TRUNCATE … CASCADE` across 12 user-generated data tables plus `UPDATE` resets for `user_tabs_profile` and `profiles`. There was no environment check — running this migration in staging or production would silently wipe all user data.

---

## Files Changed

| File | Change |
|---|---|
| `apps/beerbook-api/supabase/migrations/20260306_ledger_migration_reset.sql` | Replaced destructive SQL with a no-op `SELECT 1` stub; added comment explaining relocation |
| `apps/beerbook-api/scripts/manual-ledger-reset.sql` | **New.** Contains the original destructive SQL with an environment guard that blocks execution unless `app.env = 'development'` |
| `apps/beerbook-api/scripts/check-migration-safety.js` | **New.** CI policy check that scans all migration files for forbidden destructive patterns (`TRUNCATE … CASCADE`, unguarded `DROP TABLE`, `DELETE FROM` without `WHERE`) |
| `apps/beerbook-api/package.json` | Added `ci:check-migrations` npm script |

---

## What Changed

### 1. Migration neutered to no-op

The migration file now contains only `SELECT 1` and a comment block explaining the relocation. Supabase migration tracking remains consistent for environments that already applied the original migration.

### 2. Manual runbook script with environment guard

All destructive SQL was moved to `scripts/manual-ledger-reset.sql`. The script begins with:

```sql
DO $$
BEGIN
  IF current_setting('app.env', true) IS NULL
     OR current_setting('app.env', true) != 'development'
  THEN
    RAISE EXCEPTION 'manual-ledger-reset.sql BLOCKED: app.env must be set to ''development''.';
  END IF;
END $$;
```

Operators must explicitly `SET app.env = 'development';` before the script will execute. Any other value (or unset) causes an immediate exception.

### 3. CI policy check

`scripts/check-migration-safety.js` scans every `.sql` file in `supabase/migrations/` for:

- `TRUNCATE … CASCADE`
- `DROP TABLE` without `IF EXISTS`
- `DELETE FROM` without a `WHERE` clause

SQL comments are stripped before scanning to avoid false positives. The script exits non-zero on any violation, suitable for CI pipelines or pre-commit hooks.

---

## Validation Steps

1. **CI check passes on current migrations** — run `npm run ci:check-migrations` and confirm exit code 0 with all 7 migration files clean.
2. **CI check catches violations** — temporarily add a `TRUNCATE TABLE foo CASCADE;` line to any migration file and re-run; confirm the script exits non-zero and reports the violation.
3. **Environment guard blocks non-dev execution** — connect to a Supabase database via psql *without* setting `app.env` and run `\i scripts/manual-ledger-reset.sql`; confirm the `RAISE EXCEPTION` fires.
4. **Environment guard allows dev execution** — connect to a local dev database, run `SET app.env = 'development';` then `\i scripts/manual-ledger-reset.sql`; confirm it completes with `NOTICE` messages for each truncated table.

---

## Contract / Doc Implications

- **Migration safety policy:** All future migrations must pass `npm run ci:check-migrations`. Destructive operations (data wipes, bulk deletes, table drops) belong in `scripts/` with environment guards, never in `supabase/migrations/`.
- **No API contract changes** — this item is purely backend infrastructure; no endpoints or response shapes were modified.
- **No frontend impact** — item 1.7 has no frontend-visible behavior changes.

---

## Phase 2 Gate

Item 1.7 has no direct Phase 2 dependencies, but the CI policy check establishes a safety net for all future migration work across Phase 2+ batches.
