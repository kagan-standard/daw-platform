# YG Bidirectional Scale — Product Decisions

This document records product/UX decisions for the YG scale -6 to +6 (bidirectional) and related features. See the migration addendum (`.cursor/plans/yg_scale_bidirectional_ratings_migration_addendum.md`) for implementation phases.

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
- **With bidirectional scale:** This sum can be negative if the user has many low (negative) YG ratings. It represents “net YG” for that user’s portfolio.

**Product implication:** Display and copy should make clear that this is a **total (sum)** and can be negative. No change to the formula is required for the -6..+6 migration.

---

## 3. Exchange cross-rate when values are negative

**Current behavior:** The exchange (e.g. GET `/api/exchange/beer/:beer_name/cross-rates`) computes a **cross-rate** as `ygA / ygB` (current beer’s `yg_rate` vs each of the top beers’ `yg_rate`). Code: `crossRate = ygB > 0 ? ygA / ygB : null`.

- If `yg_rate` on the view comes from **averages** of `yg_value`, then after migration those averages can be negative.
- **When `ygB <= 0`:** We already avoid division by zero and negative divisor by returning `null` for `cross_rate`.
- **When `ygA` is negative and `ygB` positive:** `cross_rate` is negative (e.g. “this beer is 0.5× the YG of the top beer” could be expressed as -0.5 for a negative-YG beer).
- **When both negative:** Ratio of two negatives is positive; interpret with care in UI (e.g. “relative to another low-YG beer”).

**Decision:** Keep current formula. When either rate is zero or negative, returning `null` for cross-rate is acceptable. If the product later wants to show “relative to top” for negative-YG beers, we can define a separate rule (e.g. show only when both rates are positive, or add a dedicated label for negative-YG comparison).

---

## Summary

| Topic                     | Decision / current behavior |
|---------------------------|-----------------------------|
| Leaderboard YG ranking     | By **sum** of `yg_value` (total YG). |
| `total_yg_portfolio`       | **Sum** of user’s `yg_value`s; can be negative. |
| Exchange cross-rate       | `ygA / ygB` when `ygB > 0`; else `null`. Negative `yg_rate` supported; UI can hide or label negative cross-rates. |

These choices are consistent with the YG bidirectional migration (Phases 1–3) and can be revisited in later product iterations.
