# Phase 3.1 — Atomicize Read-Then-Write Patterns (Systemic)

**Status:** Implemented (2026-03-07)
**Issues resolved:** BE-F-02 (High), BE-C-04, BE-D-05, BE-E-03, BE-E-04 (Medium)
**Root cause:** ARCH-05 — Non-atomic read-compute-write patterns in 5 locations

---

## Summary

Replaced non-atomic read-then-write flows with single-transaction SQL RPCs so that concurrent requests produce deterministic outcomes (no lost increments, no duplicate toggles, no cap bypass).

---

## Files Changed

| File | Change |
|------|--------|
| `apps/beerbook-api/supabase/migrations/20260308000000_phase3_atomic_rtw_rpcs.sql` | **New.** RPCs: `confirm_venue_price`, `confirm_happy_hour`, `toggle_cheers`, `toggle_follow`, `award_tabs`, `award_rating_tabs_with_cap`. |
| `apps/beerbook-api/routes/venues.js` | Price confirm and happy-hour confirm now call `confirm_venue_price` / `confirm_happy_hour` RPC; 404 when no row or venue mismatch. |
| `apps/beerbook-api/routes/activity.js` | Cheers toggle now calls `toggle_cheers` RPC; response shape preserved (`action`, `count`, `cheers_count`, `user_cheered`). Process-event (cheers_given/cheers_received) still invoked after add. |
| `apps/beerbook-api/routes/follows.js` | Follow toggle now calls `toggle_follow` RPC; response shape preserved (`following`, `is_following`). |
| `apps/beerbook-api/routes/tabs.js` | Admin adjust and submission-approved tab award now use `award_tabs` RPC; admin adjust fetches `user_tabs_profile` after RPC for response. |
| `apps/beerbook-api/lib/processEventEngine.js` | Rating award uses `award_rating_tabs_with_cap` RPC (cap 10 normal, 99999 admin); removed count-then-insert path. |
| `apps/beerbook-api/supabase/functions/process-event/engine.ts` | Rating award uses `award_rating_tabs_with_cap` RPC; parity with Node. Removed `countRatingAwardsThisWeek` and direct ledger insert. |
| `apps/beerbook-api/test/process-event-engine-parity.test.js` | Rating_award tests now mock `award_rating_tabs_with_cap` RPC and assert it is called with correct params. |
| `apps/beerbook-api/test/process-event-engine-cosmetics.test.js` | “Weekly cap blocks tabs award” test now mocks `award_rating_tabs_with_cap` returning 0. |

---

## RPC Signatures (for docs)

- **confirm_venue_price**(`p_price_id` text, `p_venue_id` text) → TABLE (confirmed_count int)  
  Atomic `UPDATE price_logs SET confirmed_count = confirmed_count + 1, last_confirmed_at = now() WHERE id AND venue_id`. Empty result → 404.

- **confirm_happy_hour**(`p_hh_id` text, `p_venue_id` text) → TABLE (confirmed_count int)  
  Same pattern for `happy_hours`.

- **toggle_cheers**(`p_rating_id` text, `p_user_id` text) → jsonb `{ cheered: bool, cheers_count: int }`  
  Atomic insert or delete of one cheers reaction; returns new cheered state and count for the rating.

- **toggle_follow**(`p_follower_id` text, `p_following_id` text) → jsonb `{ following: bool }`  
  Atomic insert or delete of one follow row; self-follow raises exception.

- **award_tabs**(`p_user_id` text, `p_amount` int, `p_reason` text, `p_admin_user_id` text, `p_event_id` uuid DEFAULT NULL) → jsonb `{ ok, inserted, amount }`  
  Inserts `tabs_ledger` (admin_grant) and increments `user_tabs_profile.lifetime_tabs_earned`. Idempotent by `p_event_id`; on conflict no profile update.

- **award_rating_tabs_with_cap**(`p_user_id` text, `p_amount` int, `p_weekly_cap` int, `p_event_id` uuid, `p_breakdown` jsonb, `p_context` jsonb) → int  
  Advisory lock per user; count rating_award this week; if count &lt; cap, insert one ledger row (idempotent by event_id). Returns awarded amount (0 if at cap or duplicate).

---

## Validation Steps Completed

### Tests run

```text
cd apps/beerbook-api
npm test
```

- **Result:** 23 tests passed (all suites).
- **Relevant:** `process-event-engine-parity.test.js` (rating_award under cap, at cap, idempotent) and `process-event-engine-cosmetics.test.js` (rating_award at cap refreshes streak cache).

### Exact validation commands

```bash
cd c:\Users\kenyo\OneDrive\Desktop\daw-platform\daw-platform\apps\beerbook-api
npm test
```

No integration or concurrency tests were run against a live database or API. Concurrency behavior (e.g. 10 parallel venue confirms → +10 on counter) is enforced by the RPCs and should be validated manually or in a separate integration suite.

---

## Contract / Doc Implications

- **HTTP/API:** No request or response shape changes for existing endpoints. Venue confirm, happy-hour confirm, cheers toggle, follow toggle, admin tab adjust, and submission-approved award preserve existing JSON contracts.
- **New surface:** Six new PostgREST RPCs; callable only via service role / BFF. Document RPC names and parameters where internal API docs are maintained.
- **SYSTEM_ARCHITECTURE_RISKS.md:** Not found in repo; ARCH-05 status was not updated. If that doc exists elsewhere, it should be updated to reflect that ARCH-05 read-then-write patterns for venues, cheers, follows, admin tab award, and rating award with weekly cap are addressed by 3.1.

---

## Known Risks / Follow-up

- **Concurrency tests:** Plan requested “N parallel requests produce deterministic outcomes” for each path. Only unit tests (mocked rest) were run. Recommend adding integration or load tests against a real DB for: 10 concurrent venue confirms, 10 concurrent cheers toggles on same rating, 10 concurrent follow toggles, concurrent admin tab awards, near-cap concurrent rating awards.
- **Edge deployment:** Supabase Edge Function `process-event` must be redeployed so the updated `engine.ts` (using `award_rating_tabs_with_cap`) is live; otherwise Node and Edge will diverge for rating_award.
- **Migration order:** Migration `20260308000000_phase3_atomic_rtw_rpcs.sql` must run before deploying the updated BFF and Edge function; RPCs must exist or routes/engine will 502.
- **follows table:** RPC `toggle_follow` assumes table `follows` with columns `follower_id`, `followed_id`. If the deployed schema differs (e.g. different name or columns), the migration or RPC must be adjusted.

---

## Not in Scope (3.1 only)

- Comment counter transactionality (3.2)
- Venue validation (3.3)
- Any frontend or notification/achievement changes
- Changes to SYSTEM_ARCHITECTURE_RISKS.md beyond noting that the doc was not present
