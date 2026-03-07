# Phase 2.2 — Fix Achievement Cosmetic Grant Scope

**Status:** Complete
**Date:** 2026-03-07
**Scope:** Backend-only (Node + Edge runtime cosmetic grant fix)
**Issue resolved:** BE-E-02 (High)
**Prerequisite:** 2.1 (Engine parity) — confirmed complete

---

## Problem

`grantAchievementCosmetics` in both the Node and Edge runtimes hardcoded a `type=eq.border` filter and `limit=1` when querying the `cosmetics` table for achievement-linked cosmetics. This meant:

- Only `border`-type cosmetics were ever auto-granted on achievement unlock.
- `title`-type (or any other future type) cosmetics linked to achievements were silently skipped.
- The `limit=1` prevented granting multiple cosmetics even if multiple borders were linked to one achievement.

This is a continuation of the ARCH-01 dual-runtime drift pattern addressed in 2.1.

---

## Changes Made

### 1. `apps/beerbook-api/lib/processEventEngine.js` (Node runtime)

- **Removed `type=eq.border` filter** from the cosmetics query in `grantAchievementCosmetics`.
- **Removed `limit=1`** — the query now returns all cosmetics linked to the achievement key.
- **Added loop** over all returned cosmetic rows, upserting each into `user_cosmetics` with the existing idempotent conflict resolution (`on_conflict=user_id,cosmetic_id`, `resolution=ignore-duplicates`).

Before:
```
/cosmetics?achievement_key=eq.${key}&type=eq.border&select=id&limit=1
```

After:
```
/cosmetics?achievement_key=eq.${key}&select=id
```

### 2. `apps/beerbook-api/supabase/functions/process-event/engine.ts` (Edge runtime)

- **Removed `.eq("type", "border")`** from the Supabase client query chain.
- **Removed `.limit(1)`** — query now returns all matching rows.
- **Added loop** over all returned cosmetic rows, upserting each into `user_cosmetics` with the existing `onConflict: "user_id,cosmetic_id"`, `ignoreDuplicates: true` options.

Before:
```typescript
.eq("achievement_key", achievementKey)
.eq("type", "border")
.limit(1)
```

After:
```typescript
.eq("achievement_key", achievementKey)
```

### 3. `apps/beerbook-api/test/process-event-engine-cosmetics.test.js` (test updates)

- **Updated existing test** (`rating_submitted auto-grants linked border cosmetic`) to match the new query path (no `type=eq.border`, no `limit=1`).
- **Added new test**: `achievement with border AND title cosmetics grants both types` — verifies that when the cosmetics table returns two rows (border + title), both are upserted into `user_cosmetics`.
- **Added new test**: `achievement with no linked cosmetics still unlocks without error` — verifies the zero-cosmetics edge case produces no `user_cosmetics` calls and no errors.

---

## Files Changed

| File | Change |
|------|--------|
| `apps/beerbook-api/lib/processEventEngine.js` | Removed `type=eq.border` filter and `limit=1`; loop over all cosmetics |
| `apps/beerbook-api/supabase/functions/process-event/engine.ts` | Removed `.eq("type", "border")` and `.limit(1)`; loop over all cosmetics |
| `apps/beerbook-api/test/process-event-engine-cosmetics.test.js` | Updated existing test path; added 2 new tests (multi-type grant, no-cosmetics edge case) |

## Files NOT Changed

- No frontend files changed. Frontend already renders cosmetics from `user_cosmetics`; the backend gate was the issue.
- `supabase/functions/process-event/index.ts` — HTTP handler unchanged.
- `routes/` — no HTTP route changes; API contract unchanged.
- No migration files needed — the `cosmetics` table already stores all types; only the query filter was wrong.

---

## Validation Steps Completed

### Tests run

```bash
# Cosmetics tests (updated + 2 new)
node --test test/process-event-engine-cosmetics.test.js
# Result: 4/4 pass

# Parity regression tests (from 2.1)
node --test test/process-event-engine-parity.test.js
# Result: 7/7 pass
```

### Linter

No lint errors on any of the three changed files.

### Test coverage for 2.2 validation criteria

| Criterion | Test | Result |
|-----------|------|--------|
| Achievement with both border AND title cosmetics grants both | `achievement with border AND title cosmetics grants both types` | PASS |
| Achievement with only border cosmetic still works (backward compat) | `rating_submitted auto-grants linked border cosmetic via idempotent insert` | PASS |
| Fix applied in both Node and Edge (parity) | Code inspection — identical logic change in both runtimes | Confirmed |
| Existing border-only cosmetic grants unaffected | `rating_submitted auto-grants linked border cosmetic` + parity test #7 | PASS |
| No-cosmetics edge case | `achievement with no linked cosmetics still unlocks without error` | PASS |

---

## Contract / Doc Implications

- **No HTTP API contract change.** Request and response shapes for `/internal/process-event` are unchanged. The fix is internal to the engine's cosmetic grant logic.
- **Behavioral change (broadening):** The cosmetics query now returns all types, not just `border`. This is additive — achievements that previously granted only borders will continue to do so. Achievements with additional cosmetic types (e.g., `title`) will now also grant those.
- **Cosmetics grant documentation** should be updated to reflect that `grantAchievementCosmetics` now grants all achievement-linked cosmetic types. This is a documentation follow-up, not a code change.

---

## Known Risks / Follow-up Items

1. **Edge runtime deployment required.** The `engine.ts` change only takes effect after the Supabase Edge Function is redeployed. Until then, the Edge path still uses the old `type=border` filter.
2. **Existing achievements with title cosmetics** — if any achievements already have title-type cosmetics in the `cosmetics` table, users who previously unlocked those achievements did not receive the title cosmetic. A backfill query may be needed to grant missed cosmetics retroactively:
   ```sql
   INSERT INTO user_cosmetics (user_id, cosmetic_id, acquired_via)
   SELECT ua.user_id, c.id, 'achievement'
   FROM user_achievements ua
   JOIN achievements a ON a.id = ua.achievement_id
   JOIN cosmetics c ON c.achievement_key = a.key
   LEFT JOIN user_cosmetics uc ON uc.user_id = ua.user_id AND uc.cosmetic_id = c.id
   WHERE uc.id IS NULL
   ON CONFLICT (user_id, cosmetic_id) DO NOTHING;
   ```
3. **Achievement unlock atomicity gap** persists — `tabs_ledger` failure after `user_achievements` insert is still silently swallowed. This is item 2.3's scope and depends on 2.2 being complete (which it now is).
4. **No integration tests were run.** All validation was via unit tests with mocked dependencies. End-to-end verification against a live Supabase instance was not performed.
5. **Sequential upsert pattern** — the loop upserts cosmetics one at a time. For achievements with many cosmetics this could be slow, but in practice achievement cosmetic counts are very small (1-3). Batch upsert optimization is not warranted now but could be a Phase 4 consideration.
