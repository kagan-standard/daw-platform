# YG scale — product decisions (leaderboard, portfolio, exchange)

This document records product/UX decisions for how **aggregates and exchange** behave given user `yg_value` on ratings.

**Stored scale (current):** After migration `20260330100000_ratings_yg_value_canonical_half_steps.sql`, `ratings.yg_value` is **canonical**: `-1` or `1`–`10` in **0.5** steps (no `0`). Legacy integer rows `-6..7` were backfilled to this scale in that migration. API validation matches the DB `CHECK`. Full write contract, error strings, and **analytics / legacy mapping** table: [API_CONTRACT.md — Appendix: YG](API_CONTRACT.md#appendix-yg-yg_value--validation-rounding-analytics).

Earlier bidirectional work used a wider negative integer range; **negative sentiment is now a single bucket** (`-1`) for new writes.

---

## 1. Leaderboard: rank by sum vs average

**Current behavior (implemented):** The leaderboard ranks users by **sum** of `yg_value` (total YG), not by average.

- **Source:** `leaderboard_aggregate` RPC in `20260309000000_phase4_aggregation_rpcs.sql`: `top_yg_values` is built from `sum(yg_value::numeric) AS total_yg` per user, ordered by `total_yg DESC`.
- **Implication:** Users with more ratings can rank higher even if their average YG is lower. Rewards volume as well as positivity.

**Alternatives considered:**

- **Rank by average YG:** Would favor users who rate fewer beers but rate them highly. Could be added as a separate leaderboard slice (e.g. “Top by average YG” with a minimum rating count).
- **Hybrid (e.g. sum with minimum count):** Only show in “top YG” if user has at least N ratings, to avoid one very high rating dominating.

**Decision:** Keep **rank by sum** for the main leaderboard. Revisit adding an “average YG” or “quality” slice in a future iteration if product wants it.

---

## 2. `total_yg_portfolio` meaning

**Definition:** For a given user, `total_yg_portfolio` is the **sum** of all their rating `yg_value`s (nullable values treated as 0 in the sum).

- **Source:** `get_profile_rating_stats` (and profile/activity responses):  
  `round((SELECT coalesce(sum(yg_value), 0)::numeric FROM ratings WHERE user_id = p_user_id), 2)`.
- **With canonical scale:** The only negative stored value is `-1` per rating; sums can still be negative if a user has multiple negative reviews. It represents “net YG” for that user’s portfolio.

**Product implication:** Display and copy should make clear that this is a **total (sum)** and can be negative. The formula is unchanged; units are canonical YG after the half-step migration.

---

## 3. Exchange cross-rate when values are negative

**Current behavior:** The exchange (e.g. GET `/api/exchange/beer/:beer_name/cross-rates`) computes a **cross-rate** as `ygA / ygB` (current beer’s `yg_rate` vs each of the top beers’ `yg_rate`). Code: `crossRate = ygB > 0 ? ygA / ygB : null`.

- If `yg_rate` on the view comes from **averages** of `yg_value`, then after migration those averages can be negative.
- **When `ygB <= 0`:** We already avoid division by zero and negative divisor by returning `null` for `cross_rate`.
- **When `ygA` is negative and `ygB` positive:** `cross_rate` is negative (e.g. “this beer is 0.5× the YG of the top beer” could be expressed as -0.5 for a negative-YG beer).
- **When both negative:** Ratio of two negatives is positive; interpret with care in UI (e.g. “relative to another low-YG beer”).

**Decision:** Keep current formula. When either rate is zero or negative, returning `null` for cross-rate is acceptable. If the product later wants to show “relative to top” for negative-YG beers, we can define a separate rule (e.g. show only when both rates are positive, or add a dedicated label for negative-YG comparison).

---

## 4. Migration cutoff and comparing historical totals

**Cutoff:** Treat **application of** `20260330100000_ratings_yg_value_canonical_half_steps.sql` as the boundary after which all **stored** `yg_value` values are canonical. Leaderboard **`total_yg`** and beer **`avg_yg_value`** are computed from current rows; they are **not** automatically comparable to pre-migration sums without applying the same legacy→canonical row mapping (documented in [API_CONTRACT.md](API_CONTRACT.md#appendix-yg-yg_value--validation-rounding-analytics)).

**Runbook (high level):** For ad-hoc analysis on old exports, map legacy integers with the table in that appendix; for live app data, rely on migrated DB values only.

---

## Summary

| Topic                     | Decision / current behavior |
|---------------------------|-----------------------------|
| Leaderboard YG ranking     | By **sum** of `yg_value` (total YG). |
| `total_yg_portfolio`       | **Sum** of user’s `yg_value`s; can be negative. |
| Exchange cross-rate       | `ygA / ygB` when `ygB > 0`; else `null`. Negative `yg_rate` supported; UI can hide or label negative cross-rates. |
| Historical vs live totals | After canonical migration, use appendix mapping to compare old exports; live DB rows are already canonical. |

These choices remain consistent with post-migration canonical YG and can be revisited in later product iterations.
