# Day 3 Report — Tabs Economy Integrity

**Date:** 2026-04-09
**Branch:** hardening/main
**Commits:** `ccf1318` through `891b2ac` (6 commits)

---

## Tasks

### T3.1 — Writer inventory for lifetime_tabs_earned and tab_balance

**Status: DONE**

Full audit of every code path that writes to `user_tabs_profile.lifetime_tabs_earned` and `profiles.tabs_balance`.

**lifetime_tabs_earned writers:**

| Writer | Event type | Live/Dead | Notes |
|---|---|---|---|
| `refresh_rating_award_profile_cache` RPC | rating_award | **Live** | Called by processEventEngine after `award_rating_tabs_with_cap` |
| `award_tabs` RPC | admin_grant | **Live** | Called directly by `routes/tabs.js` (admin adjust, submission approval) and `workers/challenge-resolver.js` |
| `lib/tabs.js:awardTabsForRating` | rating_award | **Dead** | Legacy JS writer, never called |
| `lib/tabs.js:awardSingleSourceTabs` | cheers, achievements | **Dead** | Legacy JS writer, never called |

**profiles.tabs_balance writers:**

| Writer | Mechanism | Live/Dead |
|---|---|---|
| `tabs_ledger_after_insert` trigger | `UPDATE profiles SET tabs_balance += NEW.amount` on every ledger INSERT | **Live** — sole active writer |
| `lib/tabs.js:awardTabsForRating` | Direct PATCH via PostgREST | **Dead** |
| `lib/tabs.js:awardSingleSourceTabs` | Direct PATCH via PostgREST | **Dead** |

**Key finding:** 5 of 8 event_types insert into `tabs_ledger` but do NOT update `lifetime_tabs_earned`. Only `rating_award` (via `refresh_rating_award_profile_cache`) and `admin_grant` (via `award_tabs`) increment the field. The existing reconciliation formula `SUM(amount) FILTER (WHERE amount > 0)` was correct because legacy JS writers historically counted all positive inflows.

### T3.2 — Remove dead tabs writer functions

**Status: DONE** (`ccf1318`)

Deleted 4 dead JS functions from `lib/tabs.js`:
- `awardTabsForRating` (lines 140-168)
- `awardSingleSourceTabs` (lines 170-199)
- `awardTabsForCheers` (wrapper around awardSingleSourceTabs)
- `awardTabsForBeerApproval` (wrapper around awardSingleSourceTabs)

All were unreachable — `processEventEngine.js` replaced them but the old functions were never deleted.

### T3.3/T3.4 — lifetime_tabs_earned reconciliation

**Status: DONE** (`2786f2c`)

Migration `20260408213548_hardening_reconcile_lifetime_tabs.sql` corrected all 8 users with ledger activity:

| User (prefix) | Before | After (ledger truth) | Drift |
|---|---|---|---|
| `061d5154` (rambo) | 48 | 169 | -121 |
| `e09f8c40` | 0 | 117 | -117 |
| `81a26a3f` | 0 | 116 | -116 |
| `31bb807d` | 0 | 119 | -119 |
| `07702810` | 0 | 65 | -65 |
| `6d9b95d9` | 0 | 28 | -28 |
| `f946f132` | 0 | 20 | -20 |
| `0c69de4b` | 0 | 4 | -4 |

Formula: `lifetime_tabs_earned = SUM(amount) FILTER (WHERE amount > 0)` from `tabs_ledger`.

This was a real historical finding: 7 of 8 users had `lifetime_tabs_earned = 0` because the legacy JS writers were the only path that set it for cheers/achievements, and those writers were dead by the time users accumulated activity through the new engine.

### T3.5 — First simulator test (rating path)

**Status: PASS**

User `061d5154` rated a beer. Before: `lifetime_tabs_earned = 169`. After: `171`. Delta = +2 (rating_award amount). Post-reconciliation drift check: 0.

### T3.7 — Consolidate lifetime_tabs_earned into tabs_ledger trigger

**Status: DONE** (`e160a31`)

Migration `20260409004427_hardening_lifetime_tabs_via_trigger.sql` — three parts:

1. **Extended `tabs_ledger_after_insert` trigger** to upsert `user_tabs_profile.lifetime_tabs_earned` for all positive ledger inserts. This is now the single source of truth — every event type (rating_award, cheers, achievements, admin_grant, beer_back payouts) gets counted automatically.

2. **Stripped `refresh_rating_award_profile_cache`** — removed the 2-line `lifetime_tabs_earned` accumulator from the `updated_profile` CTE. Diff verified: exactly 2 lines removed, nothing else changed.

3. **Stripped `award_tabs`** — removed the `IF v_inserted AND p_amount > 0 THEN ... END IF;` block that upserted into `user_tabs_profile`. The ledger INSERT, idempotency, and return value are unchanged.

Post-migration simulator test confirmed +2 delta with zero drift and no double-counting.

### Rating-delete gap — documented, deferred

**Status: DOCUMENTED** (`f849a4d`)

`DELETE /api/ratings/:id` hard-deletes the rating row but does not touch `tabs_ledger`. Users who earned a `rating_award` keep the tabs after deletion.

**Why this is safe for launch:**
- The weekly cap counts `tabs_ledger` rows (not `ratings` rows), so delete-and-re-rate does not bypass the cap
- Worst case is leaderboard/profile inconsistency (0 ratings but N lifetime_tabs_earned)
- Launch cohort is 16 trusted seeders

**Proper fix:** Soft-delete pattern on `ratings` table + compensating ledger entries. Candidate for first post-launch sprint.

Comment added to the DELETE handler in `server.js:1886`. Entry added to Appendix D of the hardening plan.

### T3.8 — Reconcile profiles.tabs_balance against tabs_ledger

**Status: DONE** (`62d8210`)

Migration `20260409012100_hardening_reconcile_profiles_tabs_balance.sql`.

Investigation found a 27-tab drift (`profiles.tabs_balance = 124`, `SUM(tabs_ledger.amount) = 151`) isolated to the test user `061d5154`. All other users had zero drift.

**Ruled out:**
- Pre-trigger inserts (trigger created 2025-03-04, all ledger rows from 2026-03-07+)
- JS-side direct writes (all matches were READs)
- Non-trigger DB function writes (`cash_out_back`, `purchase_cosmetic` were false positives — they SELECT balance but write through the ledger)
- Trigger disabled (no evidence in logs, migrations, or backups)
- Ongoing trigger bug (second simulator test confirmed +2 delta)

**Most likely cause:** Legacy direct PATCH or manual dev-time UPDATE to `profiles.tabs_balance` that bypassed the ledger. Frozen artifact, not recurring.

Reconciliation updated 1 row: test user set to `tabs_balance = 153`. Post-reconciliation drift: 0.

### T3.6a — Migrate admin stats tabs_in_circulation reader

**Status: DONE** (`891b2ac`)

`GET /api/admin/tabs/stats` previously computed `tabs_in_circulation` by summing `user_tabs_profile.tab_balance` — a dead-write column that had drifted to zero for all users. The admin panel would have shown `tabs_in_circulation: 0`.

Replaced with a third parallel fetch: `profiles?select=tabs_balance&tabs_balance=gt.0&limit=10000`. The `profiles.tabs_balance` field is trigger-maintained and now reconciled to ledger ground truth.

DB verification: `SELECT SUM(tabs_balance) FROM profiles WHERE tabs_balance > 0` = **470**.

Tier distribution and seeder count logic unchanged (still reads from `user_tabs_profile` correctly).

---

## Verification Results

| ID | Check | Result |
|---|---|---|
| V3.1 | Dead function removal — `lib/tabs.js` no longer exports award functions | **PASS** |
| V3.2 | lifetime_tabs_earned reconciliation drift = 0 | **PASS** |
| V3.3 | Simulator test #1: rating_award +2 delta, drift 0 | **PASS** |
| V3.4 | T3.7 trigger consolidation: no double-counting after rating | **PASS** |
| V3.5 | Simulator test #2: profiles.tabs_balance +2 delta | **PASS** |
| V3.6 | profiles.tabs_balance reconciliation drift = 0 | **PASS** |
| V3.7 | All 3 functions exist with correct signatures | **PASS** |
| V3.8 | Container health after rebuild | **PASS** |
| V3.9 | DB: expected tabs_in_circulation = 470 | **PASS** |

---

## Open Questions for Post-Launch

1. **Multiplier audit** — Spot-check 10 recent `rating_award` ledger breakdowns to verify base + photo + price + review + tier + seeder math reconciles to the recorded amount. Small standalone task, not a bug — a "does the economy reward what we think it rewards" confidence check.

2. **Root cause of test user's 27-tab historical drift** — Most likely a dev-time manual UPDATE to `profiles.tabs_balance`. We didn't find the smoking gun, but it's isolated to the test user and doesn't recur. Acceptable for launch.

3. **Edge function `supabase/functions/process-event/engine.ts`** — Exists in the repo but is not deployed (no edge runtime container running). Recommend either delete from repo or deploy. Currently dead code.

4. **`processSingleAward` vs `award_tabs` parallel admin_grant paths** — `processEventEngine` handles `admin_grant` via `processSingleAward` (raw PostgREST insert), while `routes/tabs.js` admin endpoints call the `award_tabs` RPC directly. Both produce `admin_grant` ledger rows with different breakdown shapes. This works because the trigger handles both, but architectural cleanup is warranted to converge on a single path.

5. **Full soft-delete pattern on ratings** — Required to close the rating-delete gap. Product decision (not a bug fix). Candidate for first post-launch sprint.

---

## Product Observations

- **Cheers herocard reads correctly**, but the fact that cheers also grant lifetime tabs is implicit. May warrant UX clarification (e.g., "You earned 1 tab from this cheers!").

- **All 8 active users were historically under-counted on `lifetime_tabs_earned`** by 4-121 tabs. If leaderboard was visible pre-reconciliation, users' rankings may have been wrong. Worth mentioning in release notes if users ever saw their pre-reconciliation numbers.

---

## Commits

| Hash | Message |
|---|---|
| `ccf1318` | [day-3] remove dead tabs writer functions from lib/tabs.js |
| `2786f2c` | [day-3] reconciliation migration: lifetime_tabs_earned = SUM(amount > 0) |
| `e160a31` | [day-3] consolidate lifetime_tabs_earned into tabs_ledger trigger |
| `f849a4d` | [day-3] document rating delete/ledger gap for post-launch |
| `62d8210` | [day-3] reconcile profiles.tabs_balance against tabs_ledger sum |
| `891b2ac` | [day-3] migrate admin stats tabs_in_circulation to profiles.tabs_balance |
