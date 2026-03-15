# Phase 3.2 — Fix Comment Counter Transactionality

**Status:** Implemented (2026-03-07)
**Issues resolved:** BE-C-03 (Medium)
**Root cause:** ARCH-03 continuation — Comment create/delete and counter updates were separate non-transactional calls; counter drifts on partial failures.

---

## Summary

Replaced direct PostgREST insert/delete for comments plus separate `increment_comment_count` / `decrement_comment_count` RPCs with two atomic SQL RPCs: `create_comment_and_increment` and `delete_comment_and_decrement`. Comment insert/delete and `ratings.comment_count` update now run in a single transaction so the counter cannot drift on partial failures. Added a reconciliation view for periodic data healing.

---

## Files Changed

| File | Change |
|------|--------|
| `apps/beerbook-api/supabase/migrations/20260308100000_comment_counter_atomic_rpcs.sql` | **New.** RPCs: `create_comment_and_increment`, `delete_comment_and_decrement`. View: `ratings_comment_count_drift` for reconciliation. |
| `apps/beerbook-api/server.js` | POST `/api/ratings/:id/comments` now calls `create_comment_and_increment` RPC only; DELETE `/api/ratings/:id/comments/:commentId` now calls `delete_comment_and_decrement` RPC only. Removed separate insert/delete + increment/decrement RPC calls. |

---

## RPC Signatures (for docs)

- **create_comment_and_increment**(`rating_id` text, `user_id` text, `user_name` text, `content` text) → jsonb  
  Transactional: insert into `rating_comments` + increment `ratings.comment_count` for the rating. Returns the new comment row as JSONB. Raises if rating not found (no_data_found) or validation fails (empty/long content).

- **delete_comment_and_decrement**(`comment_id` text, `user_id` text) → jsonb  
  Transactional: ownership check, delete comment, decrement `ratings.comment_count`. Returns `{ "ok": true }` on success; `{ "ok": false, "error": "not_found" }` if comment missing; `{ "ok": false, "error": "forbidden" }` if not owner.

- **Reconciliation view:** `ratings_comment_count_drift`  
  `SELECT r.id, r.comment_count, count(c.id)::int AS actual_count FROM ratings r LEFT JOIN rating_comments c ... GROUP BY r.id, r.comment_count HAVING r.comment_count IS DISTINCT FROM count(c.id)::int`. Use for periodic healing; run UPDATE from this view to fix drift.

---

## Validation Steps Completed

### Tests run

- **Suite:** `cd apps/beerbook-api; npm test`
- **Result:** 23 tests passed (all suites). No tests in this repo target comment create/delete or comment counters.
- **Exact command:**

```bash
cd c:\Users\kenyo\OneDrive\Desktop\daw-platform\daw-platform\apps\beerbook-api
npm test
```

### Manual / integration

- No integration or concurrency tests were run against a live database or API. Plan validations (comment create atomically increments counter, delete atomically decrements, delete by non-owner returns error, concurrent create+delete correct count, reconciliation query returns zero rows after fix) were not executed. They should be validated manually or in a separate integration suite after applying the migration.

---

## Contract / Doc Implications

- **HTTP/API:** No request or response shape changes. POST still accepts `{ body }`, returns `201` with `{ data: <comment row> }`. DELETE still returns `200 { success: true }`, `403` for non-owner, `404` for missing comment.
- **New surface:** Two new PostgREST RPCs and one view; callable only via service role / BFF. Document RPC names and parameters where internal API docs are maintained. Legacy RPCs `increment_comment_count` and `decrement_comment_count` remain in the DB (used only by this BFF); they are no longer invoked by the comment endpoints.

---

## Known Risks / Follow-up

- **Migration order:** Run `20260308100000_comment_counter_atomic_rpcs.sql` before deploying the updated BFF; otherwise comment create/delete will 502 when calling the new RPCs.
- **Existing drift:** Ratings that already have incorrect `comment_count` are not auto-corrected. Use the reconciliation view and a one-off UPDATE (see comment in migration) to heal data; optionally run periodically.
- **Concurrency tests:** Plan requested concurrent create + delete producing correct final count; not run. Recommend adding integration tests or manual checks against a live DB.
- **Legacy RPCs:** `increment_comment_count` and `decrement_comment_count` are still present in the schema. They could be dropped in a later cleanup migration if nothing else calls them.

---

## Not in Scope (3.2 only)

- Atomic read-then-write elsewhere (3.1)
- Venue validation (3.3)
- Any frontend or notification/achievement changes
- Removing or refactoring unrelated code in `server.js`
