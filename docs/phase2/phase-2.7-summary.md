# Phase 2.7 — Make Crew Mutations Atomic

**Date:** 2026-03-07  
**Issues resolved:** BE-D-02 (High), BE-D-03 (High), BE-D-04 (High), BE-D-06 (Medium)  
**Scope:** Backend-only

---

## Root Cause

ARCH-03 — Three crew mutations (`POST /api/crews`, `POST /api/crews/join`, `DELETE /api/crews/:id/members/:userId`) used multi-step PostgREST writes without transactional guarantees. Partial failures could create orphan crews (crew row without owner member), incorrect member counts, and capacity oversubscription under concurrent joins.

Additionally, the join endpoint did not validate the HTTP status of the member-count query before using its body for capacity logic (BE-D-06), meaning a failed count query would default to 0 and bypass the 50-member cap.

---

## Files Changed

| File | Change |
|---|---|
| `apps/beerbook-api/supabase/migrations/20260307000000_crew_atomic_rpcs.sql` | **NEW** — SQL migration creating 4 functions: `generate_crew_invite_code()`, `create_crew_with_owner(p_name, p_owner_id)`, `join_crew(p_crew_id, p_user_id)`, `remove_crew_member(p_crew_id, p_user_id)` |
| `apps/beerbook-api/routes/crews.js` | Replaced multi-step PostgREST writes in 3 route handlers with single RPC calls; removed `createCrewWithUniqueCode` helper (superseded by RPC); added `parseRpcError` helper for mapping Postgres error codes to HTTP responses |

---

## SQL RPCs Created

### `generate_crew_invite_code()`
Internal helper. Generates a random 6-character code using the same charset as the JS `generateInviteCode` function (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`).

### `create_crew_with_owner(p_name text, p_owner_id uuid) → jsonb`
- Atomically inserts a `crews` row and a `crew_members` row with `role = 'owner'` in a single transaction.
- Generates invite codes internally with up to 5 retry attempts on unique-constraint conflicts.
- Returns the full crew row as JSONB.
- Validates name constraints (non-empty, ≤50 chars) with `check_violation` exceptions.

### `join_crew(p_crew_id uuid, p_user_id uuid) → void`
- Locks the crew row (`SELECT FOR UPDATE`) to serialize concurrent join attempts.
- Checks for existing membership (raises `23505` / `unique_violation` if already member).
- Counts current members under the lock and raises `P0003` if capacity ≥ 50.
- Inserts the new member with `role = 'member'`.
- Eliminates the TOCTOU window that previously allowed oversubscription.

### `remove_crew_member(p_crew_id uuid, p_user_id uuid) → jsonb`
- Locks the crew row, deletes the member, counts remaining members.
- If remaining = 0, deletes the crew (no orphan crews).
- Returns `{ crew_deleted: bool, remaining_members: int }`.

---

## Route Handler Changes

### `POST /api/crews` (create crew)
- **Before:** Two-step: `POST /crews` then `POST /crew_members`. If step 2 failed, orphan crew remained.
- **After:** Single call to `POST /rpc/create_crew_with_owner`. All-or-nothing.
- **HTTP contract:** Unchanged. Request `{ name }`, response `201` with crew JSON.

### `POST /api/crews/join` (join crew)
- **Before:** Four-step: lookup crew → check membership → count members → insert member. Count-query failure silently bypassed capacity check (BE-D-06). Concurrent joins could oversubscribe past 50.
- **After:** Lookup crew → fast-path membership check → single call to `POST /rpc/join_crew`. Capacity enforced under row lock.
- **HTTP contract:** Unchanged. Same error codes: `INVITE_REQUIRED` (400), `UPSTREAM_ERROR` (502), `CREW_NOT_FOUND` (404), `ALREADY_MEMBER` (409), `CREW_FULL` (403), `JOIN_FAILED` (4xx/502).

### `DELETE /api/crews/:id/members/:userId` (remove member)
- **Before:** Three-step: delete member → count remaining → conditionally delete crew. Count-query failure could leave an empty crew (orphan).
- **After:** Auth checks preserved → single call to `POST /rpc/remove_crew_member`. Delete + recount + conditional crew cleanup in one transaction.
- **HTTP contract:** Unchanged. Response `204` on success.

### Unchanged endpoints
- `GET /api/crews` — no changes
- `GET /api/crews/:id` — no changes
- `PATCH /api/crews/:id` — no changes
- `DELETE /api/crews/:id` — no changes
- `POST /api/crews/:id/regenerate-code` — no changes

---

## BE-D-06 Resolution

The original quick-fix plan item ("validate `countRes.status` before capacity logic") is superseded by the `join_crew` RPC, which performs the capacity check atomically inside Postgres under a row lock. The non-atomic count-then-insert code path no longer exists.

---

## Validation Steps Completed

| Step | Status |
|---|---|
| Lint check on `routes/crews.js` | ✅ Pass — 0 errors |
| Lint check on migration SQL | ✅ Pass — 0 errors |
| HTTP contract review: `POST /api/crews` request/response shape | ✅ Preserved |
| HTTP contract review: `POST /api/crews/join` error codes | ✅ Preserved (INVITE_REQUIRED, CREW_NOT_FOUND, ALREADY_MEMBER, CREW_FULL, JOIN_FAILED, UPSTREAM_ERROR) |
| HTTP contract review: `DELETE /api/crews/:id/members/:userId` | ✅ Preserved (204 success, 400/403/502 errors) |
| No unrelated files modified | ✅ Only `routes/crews.js` and new migration |
| Read-only endpoints unchanged | ✅ GET /crews, GET /crews/:id, PATCH, DELETE, regenerate-code untouched |

### Validation Commands Run

```
ReadLints c:\Users\kenyo\OneDrive\Desktop\daw-platform\daw-platform\apps\beerbook-api\routes\crews.js
ReadLints c:\Users\kenyo\OneDrive\Desktop\daw-platform\daw-platform\apps\beerbook-api\supabase\migrations\20260307000000_crew_atomic_rpcs.sql
```

### Tests Not Run

No automated test suite was executed. The project does not have a test runner configured for integration tests against the SQL RPCs or the crew route handlers. The validation items from the execution plan (concurrent join tests, orphan crew tests, capacity oversubscription tests) require a running Supabase/PostgREST instance and are deferred to integration testing.

---

## Contract / Doc Implications

- **No HTTP API contract changes.** All request/response shapes, status codes, and error codes are preserved.
- **New RPC signatures** should be documented in `API_CONTRACT_SCHEMA_AUDIT.md` or equivalent:
  - `create_crew_with_owner(p_name text, p_owner_id uuid) → jsonb`
  - `join_crew(p_crew_id uuid, p_user_id uuid) → void`
  - `remove_crew_member(p_crew_id uuid, p_user_id uuid) → jsonb`
- **Migration required:** `20260307000000_crew_atomic_rpcs.sql` must be applied before deploying the updated `routes/crews.js`.

---

## Known Risks and Follow-Up Items

| Risk / Follow-Up | Severity | Notes |
|---|---|---|
| Migration must be applied before API deploy | High | If the updated `routes/crews.js` is deployed without the migration, RPC calls will return 404 from PostgREST. Deploy migration first. |
| `SECURITY DEFINER` on RPCs | Medium | The three RPCs use `SECURITY DEFINER` so they execute with the function owner's privileges. Ensure the migration runs under an appropriate role. Review RLS implications if row-level security is enabled on `crews` or `crew_members`. |
| `generate_crew_invite_code()` uses `random()` | Low | PostgreSQL `random()` is not cryptographically secure. Acceptable for invite codes (same entropy profile as the JS implementation it replaces). |
| `DELETE /api/crews/:id` (direct crew delete) not converted to RPC | Low | This endpoint uses a simple single-table delete and is owner-gated. Not a multi-step atomicity risk. Could be consolidated in Phase 4. |
| `POST /api/crews/:id/regenerate-code` still uses JS invite generation | Low | This endpoint updates a single column on an existing crew. No atomicity risk. Uses the retained `generateInviteCode()` JS function. |
| Concurrent capacity test not yet validated | Medium | The TOCTOU fix (row lock in `join_crew`) is structurally correct but has not been validated with a concurrent load test. Recommend testing with N parallel joins at capacity boundary. |
| Phase 4 gate: 4.1 (DB-side aggregation) | Info | This item unblocks 4.1 — social query aggregation built on atomic crew foundations. |

---

## Items NOT Changed

No other Phase 2 items were touched. The following remain as-is:
- 2.1 (engine parity), 2.2 (cosmetic grants), 2.3 (unlock atomicity), 2.4 (draft sync), 2.5 (nav types), 2.6 (deep-links), 2.8 (session refresh), 2.9 (feature wiring), 2.10 (scheduler)
