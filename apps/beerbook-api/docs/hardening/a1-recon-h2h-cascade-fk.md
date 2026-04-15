# A1 RECON REPORT — H2H Cascade FK Audit

**Date:** 2026-04-15
**Branch:** hardening/main
**Phase:** READ-ONLY recon

---

## A.1 — FKs targeting ratings.id

| child_schema | child_table | child_column | parent_table | parent_column | on_delete | on_update | fk_name |
|---|---|---|---|---|---|---|---|
| public | head_to_head_prompts | challenger_rating_id | ratings | id | **CASCADE** | NO ACTION | head_to_head_prompts_challenger_rating_id_fkey |
| public | head_to_head_prompts | current_rating_id | ratings | id | **CASCADE** | NO ACTION | head_to_head_prompts_current_rating_id_fkey |
| public | price_logs | rating_id | ratings | id | SET NULL | NO ACTION | price_logs_rating_id_fkey |
| public | rating_comments | rating_id | ratings | id | **CASCADE** | NO ACTION | rating_comments_rating_id_fkey |
| public | reactions | rating_id | ratings | id | **CASCADE** | NO ACTION | reactions_rating_id_fkey |
| public | tab_transactions | rating_id | ratings | id | SET NULL | NO ACTION | tab_transactions_rating_id_fkey |

**4 CASCADE FKs** target ratings.id: two on head_to_head_prompts, one on rating_comments, one on reactions.

**2 SET NULL FKs** already exist on price_logs and tab_transactions — these are the desired behavior pattern.

## A.2 — FKs targeting H2H tables (head_to_head_prompts, head_to_head_results)

**Zero rows returned.** Neither `head_to_head_prompts` nor `head_to_head_results` has any child FK pointing at it.

This means the cascade chain is **one level deep only**: `ratings.id` → `head_to_head_prompts`. There is no second-level cascade from `head_to_head_prompts` → `head_to_head_results` or `head_to_head_prompts` → `beer_elo_events`.

**`beer_elo_events.result_id`** is a UUID column with **no FK constraint** — it's an unconstrained reference to `head_to_head_results.id`. Its only FK is `beer_elo_events_beer_id_fkey` → `beers.id` (CASCADE). Deleting a rating does NOT cascade into `beer_elo_events` through any FK path.

**`head_to_head_results`** has no FK to `head_to_head_prompts` or to `ratings`. It is not reachable via the cascade chain from `ratings.id` deletion.

## A.3 — Nullability of CASCADE FK child columns

| table_name | column_name | is_nullable | data_type |
|---|---|---|---|
| head_to_head_prompts | challenger_rating_id | **NO** | text |
| head_to_head_prompts | current_rating_id | **NO** | text |
| rating_comments | rating_id | **NO** | text |
| reactions | rating_id | **NO** | text |

**BLOCKER: All 4 cascade FK child columns are NOT NULL.**

A simple `ALTER ... ON DELETE SET NULL` will not work on any of them — PostgreSQL will reject SET NULL on a NOT NULL column (the SET NULL would violate the NOT NULL constraint at delete time). Each column must first be altered to allow NULLs, OR a different strategy is needed.

## A.4 — LIVE-ONLY inventory check

The inventory file's LIVE-ONLY sections cover:
- **Functions (Section 2b):** 6 LIVE-ONLY functions — none are related to ratings, H2H, or ELO tables.
- **Indexes (Section 2c):** 12 LIVE-ONLY indexes — several are on `ratings` (`idx_ratings_beer_id`, `idx_ratings_beer_name`, `idx_ratings_created_at`, `idx_ratings_rating`, `idx_ratings_serve_type`, `idx_ratings_style`, `idx_ratings_user_id`) and `reactions` (`idx_reactions_rating`), but these are indexes, not tables or constraints.

The inventory does not list any tables as LIVE-ONLY. The affected tables (`ratings`, `head_to_head_prompts`, `head_to_head_results`, `beer_elo_events`, `beer_elo_ratings`, `rating_comments`, `reactions`) all exist in the committed schema.

**No affected tables appear in LIVE-ONLY.** No FK constraint names from A.1/A.2 are called out in the inventory.

## A.5 — Row counts

| table | rows |
|---|---|
| ratings | 58 |
| head_to_head_prompts | 1 |
| head_to_head_results | 0 |
| beer_elo_events | 0 |
| beer_elo_ratings | 24 |

Small data set. Blast radius of any schema change is minimal at current scale.

## A.6 — Code references

### Rating deletion paths

Three code paths delete ratings:

1. **`server.js:1943`** — `DELETE /api/ratings/:id` — single-rating delete by owner (JWT or guest). Uses `rest('DELETE', '/ratings?id=eq.${id}')`. Has documented KNOWN GAP comment (hardening Day 3).

2. **`server.js:2149`** — inside `POST /api/head-to-head/:id/complete` — deletes the *losing* rating after H2H completion: `rest('DELETE', '/ratings?id=eq.${encodeURIComponent(row.id)}')`. This is the path most directly relevant to A1 — completing an H2H deletes a rating, which currently cascades and destroys the H2H prompt that references it.

3. **`lib/deleteAccount.js:43`** — bulk account deletion: `rest('DELETE', '/ratings?user_id=eq.${userId}')`. Also deletes H2H prompts explicitly at line 40: `rest('DELETE', '/head_to_head_prompts?user_id=eq.${userId}')`.

### H2H / ELO code references

- **`lib/headToHead.js:78`** — creates H2H prompts via `rest('POST', '/head_to_head_prompts', {...})`.
- **`server.js:2181`** — reads H2H prompt for completion flow.
- **`server.js:2205`** — inserts into `head_to_head_results` on H2H completion.
- **`server.js:2226`** — patches H2H prompt status to 'completed' after completion.
- **`server.js:2293`** — reads H2H prompt for skip flow.
- **`server.js:2305`** — patches H2H prompt status to 'skipped'.
- **`lib/elo.js:164-174`** — writes `beer_elo_events` (winner + loser rows) with `result_id` referencing the H2H result. This is the audit trail that Appendix D wants to protect.

### Code that assumes CASCADE behavior

**`server.js:2149`** (H2H complete) deletes the losing rating and does NOT separately delete the H2H prompt — it relies on CASCADE to clean up the prompt row. If we flip to SET NULL, this path would leave the H2H prompt alive with a NULL `challenger_rating_id` or `current_rating_id` instead of deleting it. This is likely the **desired** behavior (preserve the prompt as an audit record), but the code does not currently read or use orphaned prompts.

**`lib/deleteAccount.js:40-43`** deletes H2H prompts explicitly BEFORE deleting ratings, so it does not rely on CASCADE for cleanup. This path would be unaffected by the FK change.

---

## RECON SUMMARY

| Question | Answer |
|---|---|
| How many CASCADE FKs target ratings.id directly? | **4** (2 on head_to_head_prompts, 1 on rating_comments, 1 on reactions) |
| How many CASCADE FKs target H2H tables (indirect chain)? | **0** — no child FKs exist on head_to_head_prompts or head_to_head_results |
| Are all candidate child columns nullable? | **NO** — all 4 are NOT NULL |
| Are any affected tables LIVE-ONLY? | **No** |
| Are there any code paths that delete ratings? | **Yes** — 3 paths: single-rating delete (server.js:1943), H2H loser delete (server.js:2149), account deletion (deleteAccount.js:43) |
| `beer_elo_events` reachable via cascade? | **No** — `beer_elo_events.result_id` has no FK constraint. It is an unconstrained UUID reference. Rating deletion does not touch `beer_elo_events` through any FK path. |

### Scope assessment

**A simple FK flip (ALTER CONSTRAINT ... ON DELETE SET NULL) will not work as-is** because all 4 child columns are NOT NULL. The fix requires:

1. `ALTER COLUMN ... DROP NOT NULL` on each of the 4 child columns first.
2. Then `ALTER TABLE ... DROP CONSTRAINT` + re-add with `ON DELETE SET NULL` on each.

This is still a straightforward migration (no data backfill, no code changes required for correctness), but it is 8 ALTER statements instead of 4.

### Scope decision needed: rating_comments and reactions

The original Appendix D item focused on H2H and ELO audit trail preservation. The recon found that `rating_comments` and `reactions` also CASCADE from `ratings.id`. These are separate from the H2H concern:

- **rating_comments**: When a rating is deleted, all its comments are destroyed. SET NULL would leave orphaned comments with no parent rating. Is this desired, or should comments still cascade-delete with their rating?
- **reactions** (cheers): When a rating is deleted, all cheers on it are destroyed. SET NULL would leave orphaned cheers. Same question.

The human should decide whether A1 scope includes all 4 CASCADE FKs or only the 2 on `head_to_head_prompts`.
