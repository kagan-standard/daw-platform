# Phase 2.3 — Fix Achievement Unlock/Reward Atomicity

**Status:** Complete (2026-03-07)
**Issue resolved:** BE-E-01 (High)
**Root cause:** ARCH-03 — Non-atomic multi-step writes in achievement unlock path

---

## Problem

Achievement unlock in `processRatingSubmitted` performed three sequential non-transactional writes:

1. `INSERT INTO user_achievements` (direct PostgREST / Supabase client)
2. `grantAchievementCosmetics` (query cosmetics, loop insert into user_cosmetics)
3. `INSERT INTO tabs_ledger` (reward payout)

If step 3 failed, the user_achievements row persisted (achievement unlocked) but the tabs reward was silently dropped. The `tabs_ledger` insert failure was not treated as a hard error — `tabsDelta` was simply not incremented, leaving users with achievement state but no corresponding payout.

---

## Solution

### New SQL RPC: `unlock_achievement_with_rewards`

Single PL/pgSQL function that wraps all three steps in one database transaction:

1. `INSERT INTO user_achievements ... ON CONFLICT DO NOTHING` — returns `already_unlocked: true` on PK conflict (idempotent)
2. `FOR v_cosmetic IN SELECT id FROM cosmetics WHERE achievement_key = ...` — grants all linked cosmetics via `INSERT ... ON CONFLICT DO NOTHING`
3. `INSERT INTO tabs_ledger` — hard failure rolls back the entire transaction

If any step fails, PostgreSQL rolls back the entire function call. No partial state is possible.

### Reconciliation function: `reconcile_orphaned_achievement_rewards`

SQL function that returns `user_achievements` rows for reward-bearing achievements that have no corresponding `tabs_ledger` entry. Use for data healing of existing drift from pre-2.3 behavior.

### Runtime patches

Both Node and Edge runtimes now call `unlock_achievement_with_rewards` via RPC instead of performing individual writes. The `grantAchievementCosmetics` function is no longer called from `processRatingSubmitted` (now handled inside the SQL RPC).

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/20260307200000_achievement_unlock_atomic_rpc.sql` | **New.** Atomic RPC `unlock_achievement_with_rewards` + reconciliation function `reconcile_orphaned_achievement_rewards`. |
| `lib/processEventEngine.js` | `processRatingSubmitted` replaced 3-step non-atomic writes with single RPC call. RPC errors are hard errors. |
| `supabase/functions/process-event/engine.ts` | `processRatingSubmitted` replaced 3-step non-atomic writes with single RPC call. Parity with Node runtime. |
| `test/process-event-engine-cosmetics.test.js` | Updated mocks from direct PostgREST calls to RPC. Added 2 new tests: idempotent re-evaluation, hard error propagation. |
| `test/process-event-engine-parity.test.js` | Updated test 7 mock from direct PostgREST to RPC for achievement unlock path. |

---

## Validation Steps Completed

### Tests run

```bash
node --test test/process-event-engine-cosmetics.test.js   # 6/6 pass
node --test test/process-event-engine-parity.test.js       # 7/7 pass
node --test test/achievements-fallback.integration.test.js # 4/4 pass
node --test test/cosmetics.integration.test.js             # 6/6 pass
```

**Total: 23/23 tests pass, 0 failures.**

### Structural validation

- `unlock_achievement_with_rewards` is called from both Node (line 200) and Edge (line 327) runtimes.
- No direct `tabs_ledger` inserts with `event_type = 'achievement_unlock'` remain in either runtime.
- No direct `user_achievements` inserts remain in `processRatingSubmitted` in either runtime.
- `grantAchievementCosmetics` is no longer called from `processRatingSubmitted` (only defined, not invoked).
- RPC failures propagate as hard errors in both runtimes (verified by test).
- Already-unlocked achievements return `already_unlocked: true` and are skipped (verified by test).

### Test coverage added (2.3-specific)

| Test | What it validates |
|------|-------------------|
| `already-unlocked achievement is skipped (idempotent re-evaluation)` | RPC returns `already_unlocked: true`, no double-unlock, no tabs awarded |
| `atomic RPC failure propagates as hard error (tabs_ledger failure)` | RPC 500 response throws instead of silently dropping reward |

---

## Contract/Doc Implications

- **No HTTP API contract changes.** The `processEvent` response shape (`unlocked`, `tabs_delta`, `tabs_balance`, `current_streak_weeks`, `longest_streak_weeks`) is unchanged.
- **New SQL RPC added:** `unlock_achievement_with_rewards(p_user_id, p_achievement_id, p_achievement_key, p_reward_tabs, p_progress, p_context)` — returns JSONB `{ already_unlocked, reward_tabs_granted, cosmetic_ids_granted }`.
- **New SQL function added:** `reconcile_orphaned_achievement_rewards()` — returns table of orphaned unlock rows for ad-hoc data healing.
- Migration `20260307200000_achievement_unlock_atomic_rpc.sql` must be applied before deploying the updated engine code.

---

## Known Risks and Follow-Up Items

1. **`grantAchievementCosmetics` is now dead code** in both runtimes. It is defined but never called. Safe to remove in a future cleanup pass (Phase 4.3 dead code cleanup).

2. **Previously-silent `tabs_ledger` failures will now surface as hard errors.** The RPC failure rolls back the entire unlock, so the achievement won't be recorded either. Monitor error rates after deploy to confirm no systemic `tabs_ledger` constraint issues exist.

3. **Reconciliation query should be run post-deploy** to identify any existing orphaned achievements (unlocked without reward) from pre-2.3 behavior. Remediation (inserting missing `tabs_ledger` rows) is a manual operational step — not automated by this change.

4. **Edge runtime evaluation logic (`evaluate()`) differs from Node (`calculateAchievementProgress`).** This is a pre-existing asymmetry not introduced or modified by 2.3. Both runtimes now use the same atomic RPC for the unlock-and-reward step.

5. **The `tabs_ledger_after_insert` trigger** (which increments `profiles.tabs_balance`) fires inside the RPC transaction. If the trigger fails, the entire RPC rolls back — this is correct behavior but means a trigger bug could block achievement unlocks entirely.

---

## Phase 3 Gate

2.3 completion unblocks **3.1 (Atomic Read-Then-Write)** — cap enforcement in the engine now operates on atomically-committed achievement state.
