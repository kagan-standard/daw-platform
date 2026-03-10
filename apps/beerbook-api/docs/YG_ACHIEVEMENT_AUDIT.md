# YG Scale — Achievement Rules Audit

Phase 4 of the YG bidirectional ratings migration addendum: ensure no achievement **rules** reference the old YG scale (e.g. 1–12) in a way that breaks with the new -6..+6 scale.

**Status: MIGRATED** — Five star-based achievements have been migrated to YG wording and `yg_value`-based rules. The achievement engine (`achievementProgress.js`) now evaluates `yg_gte`, `yg_lte`, `yg_eq`, and `distribution_yg` using the `yg_value` column via PostgREST.

---

## 1. Migrated achievements

| Key | Old copy (stars) | New copy (YG) | Rule |
| --- | --- | --- | --- |
| `first_five_star` | "Give your first 5-star rating." | "Give your first top-tier YG rating (YG ≥ 5)." | `comparison`, field `yg_value`, op `>=`, value `5` |
| `first_one_star` | "Give your first 1-star rating." | "Give your first low YG rating (YG ≤ -2)." | `comparison`, field `yg_value`, op `<=`, value `-2` |
| `top_shelf_10` | "Give 10 beers 4+ stars." | "Give 10 beers a YG of 4 or higher." | `count_where`, `where.yg_gte: 4`, `gte: 10` |
| `harsh_10` | "Give 10 beers 2 stars or less." | "Give 10 beers a YG of -1 or lower." | `count_where`, `where.yg_lte: -1`, `gte: 10` |
| `balanced_palette` | "Have at least 10 ratings in each bucket: ≤2, 3, ≥4." | "Have at least 10 ratings in each YG bucket: low (≤-1), mid (1–2), high (≥3)." | `distribution` with YG buckets |

---

## 2. Engine support

`achievementProgress.js` supports the following YG metrics:

- **`yg_gte`** — counts ratings where `yg_value >= threshold` (PostgREST filter: `yg_value=gte.<threshold>`)
- **`yg_lte`** — counts ratings where `yg_value <= threshold` (PostgREST filter: `yg_value=lte.<threshold>`)
- **`yg_eq`** — counts ratings where `yg_value = threshold` (PostgREST filter: `yg_value=eq.<threshold>`)
- **`distribution_yg`** — evaluates per-bucket counts using combinations of `yg_gte`, `yg_lte`, `yg_eq` filters; progress = min(bucket counts)

These are resolved from three rule types:
- `comparison` with `field: "yg_value"` and `op: ">="` / `"<="` / `"="` / `"eq"`
- `count_where` with `where.yg_gte`, `where.yg_lte`, or `where.yg_eq`
- `distribution` with YG-based buckets (each bucket having at least one of `yg_gte`, `yg_lte`, `yg_eq`)

Star-based metrics (`stars_gte`, `stars_lte`) remain for backward compatibility with any non-migrated rules.

---

## 3. YG scale reference

The YG scale is **-6 to +6** (from `20260316100000_ratings_yg_bidirectional_and_source.sql`). Thresholds used:
- Top-tier: YG ≥ 5
- High: YG ≥ 3
- Mid: YG 1–2
- Low: YG ≤ -1
- Bottom: YG ≤ -2

---

## 4. Seed file

All five achievements are updated in `supabase/seed/2026marchachievements.sql` with YG copy and `yg_value`-based rules. The seed uses `ON CONFLICT (key) DO UPDATE`, so re-running it will update existing rows.
