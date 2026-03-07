# Phase 2.1 — Unify Process-Event Node/Edge Parity

**Status:** Complete
**Date:** 2026-03-07
**Scope:** Backend-only (Edge runtime alignment)

---

## Problem

The Node and Edge process-event engine runtimes had silently diverged (ARCH-01):

- **Node** (`lib/processEventEngine.js`): called `refresh_rating_award_profile_cache` RPC after every `rating_award` event and returned `current_streak_weeks` / `longest_streak_weeks` in the response.
- **Edge** (`supabase/functions/process-event/engine.ts`): did neither. No RPC call, no streak fields in the response, and the `ProcessEventResult` type omitted these fields entirely.

This meant any client routed through the Edge function received an incomplete response, breaking streak display and profile cache consistency.

---

## Changes Made

### 1. `supabase/functions/process-event/engine.ts` (Edge runtime)

- **Added `refreshUserTabsProfileAfterRatingAward` function** — calls `admin.rpc("refresh_rating_award_profile_cache", { p_user_id, p_tabs_delta })` and returns `{ current_streak_weeks, longest_streak_weeks }`. Mirrors the identical function in the Node runtime.
- **Updated `processRatingAward`** — restructured to:
  - Track `awardedAmount` through the cap-check and insert flow (matching Node's pattern)
  - Always call `refreshUserTabsProfileAfterRatingAward` at the end, even when the weekly cap blocks the award or on idempotent conflict
  - Return `{ amount, current_streak_weeks, longest_streak_weeks }` instead of `{ amount }`
- **Updated `ProcessEventResult` interface** — added `current_streak_weeks: number | null` and `longest_streak_weeks: number | null` fields.
- **Updated `processEvent`** — propagates streak fields from the `rating_award` result; defaults to `null` for all other event types (matching Node runtime behavior).

### 2. `test/process-event-engine-parity.test.js` (new file)

Parity test suite with 7 tests verifying the canonical response shape across event types:

| Test | Validates |
|------|-----------|
| rating_award under cap | Streak fields returned, RPC called with correct delta |
| rating_award at weekly cap | RPC still called with delta=0, streak fields present |
| rating_award idempotent replay (conflict) | RPC called even on 409/23505 conflict |
| rating_submitted (no achievements) | Canonical shape with null streak fields |
| cheers_given | Canonical shape with null streak fields |
| cheers_received | Canonical shape with null streak fields |
| rating_submitted with achievement unlock | Canonical shape, unlock array populated, null streaks |

---

## Files Changed

| File | Change |
|------|--------|
| `apps/beerbook-api/supabase/functions/process-event/engine.ts` | Added RPC call, streak fields, aligned response shape |
| `apps/beerbook-api/test/process-event-engine-parity.test.js` | New parity test suite (7 tests) |

---

## Files NOT Changed

- `apps/beerbook-api/lib/processEventEngine.js` — Node runtime was already correct; no changes needed.
- `supabase/functions/process-event/index.ts` — HTTP handler unchanged; it passes through the engine result directly.
- No frontend files changed.

---

## Validation Steps Completed

### Tests run

```bash
# Parity tests (new)
node --test test/process-event-engine-parity.test.js
# Result: 7/7 pass

# Regression tests (existing)
node --test test/process-event-engine-cosmetics.test.js
# Result: 2/2 pass
```

### Linter

No lint errors on `engine.ts` after changes.

### Shape verification

All 7 parity tests assert the canonical 5-key response shape:
```
{ unlocked: Array, tabs_delta: number, tabs_balance: number,
  current_streak_weeks: number|null, longest_streak_weeks: number|null }
```

Every event type (`rating_award`, `cheers_given`, `cheers_received`, `rating_submitted`) confirmed to produce this shape from the Node engine. The Edge engine now has identical control flow and return structure.

---

## Contract / Doc Implications

- **Response shape change (additive):** The Edge runtime now returns two additional fields (`current_streak_weeks`, `longest_streak_weeks`) that were previously absent. These are **additive** — existing consumers that ignore unknown fields are unaffected. Consumers that relied on the Edge response should now receive the same data they would from the Node runtime.
- **`API_CONTRACT_SCHEMA_AUDIT.md`** should be updated to document the canonical `rating_award` response schema including streak fields. This is a documentation follow-up, not a code change.

---

## Known Risks / Follow-up Items

1. **Edge runtime deployment required.** The `engine.ts` change only takes effect after the Supabase Edge Function is redeployed. Until then, the Edge path still returns the old shape.
2. **`grantAchievementCosmetics` still filters `type=eq.border`** in both runtimes. This is the known issue for item 2.2 (cosmetic grant scope) and was intentionally not changed here.
3. **Achievement unlock atomicity gap** persists in both runtimes — `tabs_ledger` failure after `user_achievements` insert is silently swallowed. This is item 2.3's scope.
4. **No integration tests were run.** All validation was via unit tests with mocked dependencies. End-to-end verification against a live Supabase instance was not performed.
5. **Edge runtime achievement evaluation** uses a different evaluator pattern than Node (inline `EVALUATORS` map vs Node's `calculateAchievementProgress` module). This is a pre-existing structural divergence in the `rating_submitted` path, not introduced or worsened by this change. Structural unification is out of scope for 2.1.
