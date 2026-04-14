# T3.10 — ELO Mechanic Audit

**Date:** 2026-04-09
**Type:** Read-only audit, no code changes

---

## 1. Schema inventory

### beer_elo_ratings (22 rows)

| Column | Type | Nullable | Default |
|---|---|---|---|
| `beer_id` | text | NOT NULL | — (PK) |
| `global_elo` | integer | NOT NULL | 0 |
| `comparison_count` | integer | NOT NULL | 0 |
| `updated_at` | timestamptz | NOT NULL | now() |

Indexes: PK on `beer_id`, `global_elo DESC`, `updated_at DESC`
Check constraints: `global_elo` 0-10000, `comparison_count` >= 0
FK: `beer_id` → `beers(id) ON DELETE CASCADE`
Timestamps: min `2026-03-16`, max `2026-04-09`

### beer_elo_events (0 rows)

| Column | Type |
|---|---|
| `id` | uuid (PK) |
| `result_id` | uuid NOT NULL → `head_to_head_results(id) ON DELETE CASCADE` |
| `beer_id` | text NOT NULL → `beers(id) ON DELETE CASCADE` |
| `old_elo` | integer NOT NULL |
| `new_elo` | integer NOT NULL |
| `k_used` | integer NOT NULL |
| `created_at` | timestamptz NOT NULL |

### beer_elo_history (64 rows)

| Column | Type |
|---|---|
| `id` | uuid (PK) |
| `beer_id` | text NOT NULL → `beers(id)` |
| `elo_score` | integer NOT NULL |
| `tier` | text NOT NULL |
| `recorded_at` | timestamptz NOT NULL |

Timestamps: min `2026-04-07`, max `2026-04-09`
Written by: `elo-snapshot.js` cron (daily at 02:00 UTC) and `update_beer_elo_from_yg` (on tier changes)

---

## 2. Writer inventory

### JS-side writers

| File:line | Function | Table | Type | Triggered by | Live? |
|---|---|---|---|---|---|
| `lib/elo.js:76` | `getOrCreateBeerElo` | `beer_elo_ratings` | INSERT (seed new beer at ELO_INITIAL=0) | H2H complete handler | **Live** |
| `lib/elo.js:144` | `updateEloAfterComparison` | `beer_elo_ratings` | PATCH (global_elo, comparison_count) | H2H complete handler | **Live** |
| `lib/elo.js:152` | `updateEloAfterComparison` | `beer_elo_ratings` | PATCH (loser) | H2H complete handler | **Live** |
| `lib/elo.js:164` | `updateEloAfterComparison` | `beer_elo_events` | INSERT (winner audit) | H2H complete (when resultId truthy) | **Live** |
| `lib/elo.js:174` | `updateEloAfterComparison` | `beer_elo_events` | INSERT (loser audit) | H2H complete (when resultId truthy) | **Live** |
| `workers/elo-snapshot.js:65` | `run` | `beer_elo_history` | INSERT (daily snapshot) | Cron (02:00 UTC) | **Live** |

### DB-side writers

| Function | Table | Type | Triggered by |
|---|---|---|---|
| `update_beer_elo_from_yg` | `beer_elo_ratings` | INSERT (seed) or UPDATE (global_elo, updated_at) | `trigger_update_elo_on_rating` on ratings INSERT/UPDATE |
| `update_beer_elo_from_yg` | `beer_elo_history` | INSERT (on tier change) | Same trigger |
| `trigger_update_elo_on_rating` | — | Calls `update_beer_elo_from_yg` | AFTER INSERT OR UPDATE ON ratings |

### Readers (notable)

| File | What it reads | Purpose |
|---|---|---|
| `routes/highlights.js:51` | `beer_elo_ratings.global_elo, comparison_count` | Power score display |
| `routes/rankings.js:24` | `beers_with_elo` view | Rankings page |
| `lib/eloTrend.js:108-111` | `beer_elo_history` + `beer_elo_ratings` | Trend chips (30-day delta) |
| `lib/backingLookup.js:41` | `beer_elo_ratings.global_elo` | Backing payout tier lookup |
| `routes/backs.js:62,174` | `beer_elo_ratings` | Backing stake/cashout tier |
| `cash_out_back` RPC | `beer_elo_ratings` via `elo_tier_name()` | Payout calculation |

---

## 3. Mechanic mapping

| Mechanic | Expected behavior | Code path | Evidence of activity | Status |
|---|---|---|---|---|
| **Initial seed** | First YG rating creates ELO row with YG-derived score (0-1500) | `trigger_update_elo_on_rating` → `update_beer_elo_from_yg` | 22 beers with ELO rows; 2 beers with ratings but missing ELO rows (both have only 1 rating each — YG ratings with `yg_value = NULL` or `-1` would produce ELO=0 and might not create a row) | **WIRED** |
| **Drift on re-rating** | Later ratings recalculate YG-derived ELO | Same trigger path | All 22 ELO rows show `updated_at` timestamps more recent than their earliest rating, confirming the trigger fires on each new rating | **WIRED** |
| **H2H win/loss** | `updateEloAfterComparison` with real Elo math | `POST /api/head-to-head/:id/complete` → `updateEloAfterComparison` | 2 beers with `comparison_count=1` (see Section 5 for explanation); 0 beer_elo_events (cascade-deleted); 0 head_to_head_results (cascade-deleted) | **WIRED** (code is correct; 1 completion occurred but evidence was cascade-deleted) |

### Missing ELO rows investigation

2 beers have ratings but no ELO row:
- `2c8cc042-dfd4-4e95-9a21-ffd2750df640` (1 rating)
- `1a756b20-4e31-4f89-b6b5-d076bae8e3f5` (1 rating)

The `update_beer_elo_from_yg` function creates the ELO row with `global_elo = 0` if none exists, then computes `compute_yg_elo`. If the rating has `yg_value IS NULL` or `yg_value = -1`, `compute_yg_elo` returns 0 and the row gets `global_elo = 0`. The trigger should still have created the row. These may be ratings with `beer_id` values that predate the trigger installation (migration `20260407000003`), but the backfill loop at the end of that migration should have caught them if they had valid YG values. Likely these are beers with only `yg_value = -1` or NULL ratings — the backfill only processes `WHERE yg_value IS NOT NULL AND yg_value > 0`.

---

## 4. Elo math verification

### 4a. Expected score formula — YES, present

`lib/elo.js:19-21`:
```javascript
function expectedScore(ratingA, ratingB) {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}
```

This is the standard Elo expected score formula: `E_a = 1 / (1 + 10^((R_b - R_a) / 400))`.

### 4b. K-factor

`lib/elo.js:28-30`:
```javascript
function kForMaturity(comparisonCount) {
  return comparisonCount < ELO_MATURITY_CAP ? ELO_K_NEW : ELO_K_MATURE;
}
```

| Constant | Default | Env var |
|---|---|---|
| `ELO_K_NEW` | 32 | `ELO_K_NEW` |
| `ELO_K_MATURE` | 16 | `ELO_K_MATURE` |
| `ELO_MATURITY_CAP` | 30 | `ELO_MATURITY_CAP` |

K=32 for beers with <30 comparisons, K=16 for beers with >=30 comparisons. Each beer gets its own K based on its own comparison_count (asymmetric K is possible if winner is mature and loser is new).

### 4c. Verbatim formulas

`lib/elo.js:41-54`:
```javascript
function computeNewElos(winnerElo, loserElo, winnerComparisonCount, loserComparisonCount) {
  const EWinner = expectedScore(winnerElo, loserElo);
  const ELoser = expectedScore(loserElo, winnerElo);
  const KWinner = kForMaturity(winnerComparisonCount);
  const KLoser = kForMaturity(loserComparisonCount);
  const winnerNewElo = Math.round(winnerElo + KWinner * (1 - EWinner));
  const loserNewElo = Math.round(loserElo + KLoser * (0 - ELoser));
  return {
    winnerNewElo: Math.max(0, Math.min(10000, winnerNewElo)),
    loserNewElo: Math.max(0, Math.min(10000, loserNewElo)),
    winnerK: KWinner,
    loserK: KLoser,
  };
}
```

Standard Elo: `new = old + K * (score - expected)` where winner score=1, loser score=0.
Clamped to 0-10000.

Additionally, `updateEloAfterComparison` (lib/elo.js:134-140) applies a **YG floor clamp**:
```javascript
const winnerNewElo = Math.max(rawWinnerElo, winnerFloor);
const loserNewElo = Math.max(rawLoserElo, loserFloor);
```
This means H2H losses cannot push a beer below its YG-derived score. A beer with a YG-derived score of 700 can never drop below 700 via H2H, even if it loses repeatedly.

### 4d. Simulation results

All cases use both beers as "new" (comparison_count=0, K=32) unless noted:

| Case | Winner | Loser | Winner delta | Loser delta | Notes |
|---|---|---|---|---|---|
| **A: Even (1500 v 1500)** | 1500 → 1516 | 1500 → 1484 | +16 | -16 | Symmetric, as expected |
| **B: Expected win (1800 v 900)** | 1800 → 1800 | 900 → 900 | **0** | **0** | Barely moves — correct Elo behavior |
| **C: Huge upset (900 v 1800)** | 900 → 932 | 1800 → 1768 | **+32** | **-32** | Nearly full K transfer — correct |
| **D: Upset, mature (K=16)** | 900 → 916 | 1800 → 1784 | +16 | -16 | Half the movement with mature K |

**Verdict: This is REAL Elo.** The expected-score formula correctly weights upsets. A 900-rated beer beating an 1800-rated beer gains nearly the full K=32 points (the maximum possible), while an 1800 beating a 900 gains essentially nothing. This matches the user's intended mechanic.

### 4e. Seed value for new beers

**STARTING_ELO = 0** (from `lib/eloTiers.js:5`).

When a beer is first encountered in H2H, `getOrCreateBeerElo` inserts it at ELO_INITIAL=0. But for the YG-based path, `update_beer_elo_from_yg` creates the row at 0 and then immediately updates it with the YG-derived score (0-1500 scale).

The YG-derived seed formula (`compute_yg_elo`):
```
weighted_avg = (avg_yg * count + 5.5 * 10) / (count + 10)   -- Bayesian prior
yg_elo = ROUND(((weighted_avg - 1.0) / 9.0) * 1500)         -- Scale to 0-1500
```

- YG=10 (perfect) with many ratings → ~1500
- YG=5.5 (neutral) → ~750
- YG=1 (terrible) with many ratings → ~0
- First rating pulls toward the 5.5 prior heavily (confidence=10)

**Design:** YG-based scores are capped at 1500. Only H2H can push above 1500 into "Legend" territory (1600+). The `update_beer_elo_from_yg` function skips beers with `global_elo > 1500` to protect H2H-earned scores.

---

## 5. comparison_count anomaly resolution

### The evidence

Two beers have `comparison_count = 1` but zero rows in `head_to_head_results`, `beer_elo_events`, and `head_to_head_prompts`.

| beer_id | global_elo | comparison_count | updated_at |
|---|---|---|---|
| `284b8f8c...` | 654 | 1 | 2026-04-09 00:49:31.458 |
| `d48792c6...` | 712 | 1 | 2026-04-09 00:49:31.458 |

### Root cause: cascade deletion after rating delete

The `updated_at` timestamp (`00:49:31.458`) is 13 seconds after a rating_award ledger entry at `00:49:18.416` for beer `d48792c6` by user `061d5154` (the test user). That rating **no longer exists** in the `ratings` table (confirmed: rating `fc5f0c42` is in tabs_ledger but not in ratings — the known delete gap).

The cascade chain:
1. User rated beer `d48792c6` → `trigger_update_elo_on_rating` fired → ELO updated
2. `maybeOfferHeadToHead` found a challenger (`284b8f8c`) → created a `head_to_head_prompts` row with `current_rating_id = fc5f0c42`
3. User completed H2H → `head_to_head_results` inserted → `updateEloAfterComparison` ran → both beers got `comparison_count` incremented via PATCH and `beer_elo_events` inserted
4. User (or test) deleted the rating → FK cascade: `head_to_head_prompts.current_rating_id` → `ON DELETE CASCADE` → prompt deleted → `head_to_head_results.prompt_id` → `ON DELETE CASCADE` → result deleted → `beer_elo_events.result_id` → `ON DELETE CASCADE` → events deleted
5. But the `beer_elo_ratings` PATCHes (comparison_count, global_elo) are direct UPDATEs with no FK — they survive the cascade

**Classification: Cascade-deletion artifact from the known rating-delete gap.** Not a bug in the ELO code. The ELO system worked correctly; the audit trail was destroyed by cascading deletes when the originating rating was hard-deleted.

### Secondary finding: H2H prompts are destroyed when ratings are deleted

This is a more severe consequence of the rating-delete gap than previously documented. Not only do users keep phantom tabs, but:
- H2H prompts referencing deleted ratings are cascade-destroyed
- Completed H2H results are cascade-destroyed
- ELO audit trail (beer_elo_events) is cascade-destroyed
- The ELO score changes themselves persist (no FK on beer_elo_ratings)

This creates an inconsistency: ELO scores reflect H2H outcomes for which no audit trail exists. At current scale (1 completion) this is cosmetic. At larger scale, this could make ELO scores unauditable.

---

## 6. Summary of findings

| Finding | Severity | Category |
|---|---|---|
| **Elo math is real** — standard expected-score formula, K-factor by maturity, upset weighting correct | N/A (positive) | Verification |
| **All three mechanics are WIRED** — seed, drift, and H2H paths all exist and function | N/A (positive) | Verification |
| **2 beers missing ELO rows** — likely beers with only `yg_value = -1` or NULL ratings, excluded by backfill filter | Low | Gap |
| **YG floor clamp** — H2H losses cannot push below YG-derived score; this is an intentional design choice, not a bug | N/A | Design note |
| **comparison_count anomaly explained** — cascade deletion from rating delete, not a code bug | N/A | Resolved |
| **H2H cascade-deletion** — deleting a rating cascade-deletes all H2H prompts, results, and elo_events referencing it, while ELO score changes persist without audit trail | Medium | Design gap (extends known rating-delete gap) |

---

## 7. Open questions for the user to decide

1. **The 2 beers without ELO rows:** Should the backfill be re-run to include beers with only `yg_value = -1` or NULL ratings? These beers would get `global_elo = 0` which is the default anyway. Low priority.

2. **H2H cascade-deletion:** The `ON DELETE CASCADE` from `head_to_head_prompts.current_rating_id → ratings(id)` means deleting a rating destroys all H2H history for that rating. Options:
   - Change to `ON DELETE SET NULL` (preserves H2H history, prompt loses its rating reference)
   - Part of the broader soft-delete design for ratings (post-launch)
   - Accept for now (single completion to date, all seeders are trusted)

3. **ELO floor clamp visibility:** The YG floor clamp means a beer can never drop below its YG-derived score via H2H. This is probably the right behavior (prevents grief-tanking well-rated beers) but users might be confused if a beer keeps winning H2H but its score doesn't rise (because it's already at its YG ceiling of 1500 and needs H2H to push above). Consider documenting this mechanic in the app's help/FAQ.

4. **STARTING_ELO = 0 for H2H-only path:** If a beer enters the system through H2H (no YG ratings), it starts at 0 and the first H2H win could push it to 32 at most. This is probably fine since all beers should have YG ratings first, but worth noting.
