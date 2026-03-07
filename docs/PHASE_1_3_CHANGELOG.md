# Phase 1.3 — Enforce Crew Membership Authorization

**Date:** 2026-03-07  
**Issues resolved:** BE-C-01 (High), BE-D-01 (High), INT-03 (High)  
**Scope:** Backend-only

---

## Root Cause

Crew-scoped feeds (ratings, activity, stats) accepted arbitrary `crew_id` without membership validation, despite crew detail routes (`GET /api/crews/:id`) already enforcing it. This inconsistent authorization policy allowed any authenticated user to read another crew's feed data by supplying a known `crew_id`.

---

## Files Changed

| File | Change |
|---|---|
| `apps/beerbook-api/lib/crewAuth.js` | **NEW** — shared `requireCrewMembership(rest, userId, crewId)` guard that queries `crew_members` and returns the membership row or `null` |
| `apps/beerbook-api/server.js` | Added import of `requireCrewMembership`; added membership check to `GET /api/ratings?feed=crew` and `GET /api/stats?crew_id` — non-members now receive `403` |
| `apps/beerbook-api/routes/activity.js` | Added import of `requireCrewMembership`; added membership check to `GET /api/activity?feed=crew` — non-members now receive `403` |
| `apps/beerbook-api/routes/crews.js` | Replaced internal `getMembership` with shared `requireCrewMembership` import from `lib/crewAuth.js`; all existing call sites updated (detail, join, remove-member) |
| `apps/beerbook-api/docs/API_CONTRACT_SCHEMA_AUDIT.md` | Documented the new `403 CREW_MEMBERSHIP_REQUIRED` response for crew-scoped endpoints |

---

## 403 Response Shape

All three crew-scoped endpoints now return the same error envelope on authorization failure:

```json
{
  "error_code": "CREW_MEMBERSHIP_REQUIRED",
  "error": "Crew membership required",
  "request_id": "<uuid>"
}
```

---

## Validation Steps

1. **Non-member + crew-scoped ratings returns 403**
   - `GET /api/ratings?feed=crew&crew_id=<crew-you-are-not-in>` with a valid JWT for a non-member user should return `403`.

2. **Non-member + crew-scoped activity returns 403**
   - `GET /api/activity?feed=crew&crew_id=<crew-you-are-not-in>` with a valid JWT for a non-member user should return `403`.

3. **Non-member + crew-scoped stats returns 403**
   - `GET /api/stats?crew_id=<crew-you-are-not-in>` with a valid JWT for a non-member user should return `403`.

4. **Member access returns data as before**
   - All three endpoints with a valid member JWT + valid `crew_id` should return the same data shape as before this change.

5. **Crew detail endpoint behavior unchanged**
   - `GET /api/crews/:id` still enforces membership via the same shared guard (previously inline, now from `lib/crewAuth.js`). No behavioral change.

6. **Other feed modes unaffected**
   - `GET /api/ratings?feed=following`, `GET /api/activity?feed=following`, and unfed `GET /api/stats` (no `crew_id`) remain unaffected.

7. **Unauthenticated crew requests still return 401**
   - The existing 401 check for missing JWT still fires before the new 403 guard.

---

## Contract / Doc Implications

- **`API_CONTRACT_SCHEMA_AUDIT.md`** updated with the new `403 CREW_MEMBERSHIP_REQUIRED` error for the three affected endpoints and a reference to the shared guard (`lib/crewAuth.js::requireCrewMembership`).
- **Frontend impact:** After this lands, previously-successful crew-scoped API calls for non-members will return `403` instead of data. This is correct behavior. Graceful frontend error handling is deferred to Phase 2.
- **Phase 2 gate:** Item 1.3 unblocks Phase 2.7 (crew mutations atomic).

---

## Items NOT Changed

No other Phase 1 items were touched. The following remain as-is:
- 1.1 (admin_grant), 1.2 (internal endpoint), 1.4 (upload), 1.5 (drafts), 1.6 (cache reset), 1.7 (migration safety), 1.8 (error sanitization)
