# YG Scale — Achievement Rules Audit

Phase 4 of the YG bidirectional ratings migration addendum: ensure no achievement **rules** reference the old YG scale (e.g. 1–12) in a way that breaks with the new -6..+6 scale.

---

## 1. Audit query (run against your DB)

Run this against the database that has the `achievements` table (e.g. Supabase SQL editor or `psql`):

```sql
SELECT id, key, rules
FROM achievements
WHERE rules::text ILIKE '%yg%';
```

- **If no rows:** No achievement rules reference YG; no changes needed.
- **If rows exist:** Inspect `rules` for thresholds or logic that assume the old scale (e.g. 1–12 or “top” meaning 12). Update rules or achievement copy as needed.

---

## 2. Codebase audit (seed and migrations)

**Result:** In the beerbook-api repo, **no achievement definitions reference `yg` in their `rules`.**

- **Seed:** `supabase/seed/2026marchachievements.sql` defines 76 achievements. Their `rules` use: `count`, `entity: "ratings"`, `stars`, `stars_gte`, `stars_lte`, `has_field`, `min_length`, `count_where`, `count_in_window`, `daily_streak`, `distribution`, `distinct_count`, `style_contains`, etc. **None of these rules mention `yg` or `yg_value`.**
- **Migrations:** No migrations that create or update achievements reference YG in achievement rules.

So **no code changes to achievements are required** for the YG bidirectional migration. If you add new achievements later that depend on YG (e.g. “Rate 10 beers with YG ≥ 4”), define them for the -6..+6 scale.

---

## 3. Optional: future YG-based achievements

If you later add achievements that use `yg_value` (e.g. “High roller: 5 ratings with yg_value ≥ 4”), the process-event engine (and any rule evaluator) must interpret thresholds in the **-6 to 6** range. The current engine does not evaluate YG in rules; this note is for when that is implemented.
