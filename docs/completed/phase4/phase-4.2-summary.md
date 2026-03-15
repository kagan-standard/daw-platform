# Phase 4.2 — Tracking Durability

**Status:** Implemented (2026-03-07)  
**Issues addressed:** BE-G-06  
**Root cause:** BE-G-06 — Fire-and-forget tracking writes; failures swallowed

---

## Summary

Tracking writes for `/api/track/click` and `/api/track/pageview` now use retries (3 attempts with exponential backoff) before giving up. On final failure, the event is recorded to a `tracking_failures` table for dead-letter visibility and failure metrics. The HTTP contract is unchanged: responses remain **202** with **`tracked: true`** (fire-and-forget from the client’s perspective).

---

## Files Changed

| File | Change |
|------|--------|
| `apps/beerbook-api/supabase/migrations/20260309100000_tracking_durability.sql` | **New.** Creates `tracking_failures` table (event_type, payload, error_message, created_at) with indexes and RLS policies for service_role insert/select. |
| `apps/beerbook-api/routes/tracking.js` | Added `trackingWriteWithRetry(rest, path, record, eventType)` with 3 retries (100/300/900 ms backoff). On final failure: log, then POST to `/tracking_failures`. Both `/track/click` and `/track/pageview` call this helper in a fire-and-forget manner; response remains `202` and `{ tracked: true }`. |

---

## Validation Steps Completed

### Tests run

**Automated tests were not run.** No test suite was executed for Phase 4.2.

### Exact validation commands

- **Smoke test (response contract):** From `apps/beerbook-api`, ran a one-off Node script that loaded the tracking router with a mock `rest` returning 201, sent a POST with `target_type: 'beer'`, `destination_url: 'https://x.com'`, and asserted response **202** and **`{ tracked: true }`**. Result: **Status: 202 Body: {"tracked":true}** — happy-path contract preserved.
- Full server + curl and migration apply were **not** run in this session. Suggested manual checks after applying the migration and starting the API:

```bash
# Apply migration (Supabase CLI or SQL editor)
# supabase db push   # or run 20260309100000_tracking_durability.sql

cd c:\Users\kenyo\OneDrive\Desktop\daw-platform\daw-platform\apps\beerbook-api
node server.js
# In another terminal:

# Happy path: 202 + tracked: true (unchanged)
curl -s -X POST http://localhost:3000/api/track/click \
  -H "Content-Type: application/json" \
  -d '{"target_type":"beer","target_id":"x","destination_url":"https://example.com"}'
# Expect: {"tracked":true} and HTTP 202

curl -s -X POST http://localhost:3000/api/track/pageview \
  -H "Content-Type: application/json" \
  -d '{"page_path":"/test"}'
# Expect: {"tracked":true} and HTTP 202

# Failure visibility: after simulating upstream failure (e.g. PostgREST down or table missing),
# query tracking_failures for dead-letter rows:
# SELECT * FROM tracking_failures ORDER BY created_at DESC LIMIT 10;
```

---

## Contract / Doc Implications

- **HTTP/API:** No change. Success response remains **202** with body **`{ tracked: true }`**. Request bodies and error responses (e.g. 400 for missing fields) are unchanged.
- **Documentation:** Document retry/queue behavior (3 retries, backoff 100/300/900 ms) and that failed events after retries are stored in `tracking_failures` for visibility. Optionally document any future strict-mode or failure-metrics query params if added later.

---

## Known Risks / Follow-up

- **Dead-letter growth:** `tracking_failures` is append-only. Consider a retention policy or admin job to archive/delete old rows.
- **No persistent queue:** Retries are in-process only. If the Node process exits during the retry window, the event is lost; a persistent queue (e.g. DB-backed or Redis) would require broader changes and was out of scope for 4.2.
- **Dependency:** No Phase 4 prerequisite; 4.2 has no in-phase deps.
