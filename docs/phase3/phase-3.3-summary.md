# Phase 3.3 — Fix Venue Endpoint Validation — Implementation Summary

**Item:** 3.3 (PHASE_3_EXECUTION_PLAN)  
**Scope:** Backend-only. Single file patched.  
**Issues resolved:** BE-F-03 (Medium), BE-F-04 (Medium), BE-F-07 (Low)

---

## Files changed

| File | Change |
|------|--------|
| `apps/beerbook-api/routes/venues.js` | Added `MAX_VENUE_RADIUS_M` constant; radius validation and clamping in `GET /api/venues`; coordinate validation in `POST /api/venues`. |

No other files were modified. No new migrations or config files were added.

---

## Implementation details

### BE-F-03 — Radius clamping

- **Constant:** `MAX_VENUE_RADIUS_M = Number(process.env.MAX_VENUE_RADIUS_M) || 50000`.
- **GET /api/venues** (when `?lat=&lng=` are used):
  - If `radius` query is present and is not a positive integer → **400** with `{ error: 'radius must be a positive number (meters)' }`.
  - If `radius` is present and positive → value is clamped to `MAX_VENUE_RADIUS_M` before calling `venues_within_radius`.
  - If `radius` is omitted → `DEFAULT_RADIUS` (5000) is used unchanged.

### BE-F-04 — Parent venue-ID validation

- **No code change.** Phase 3.1 already implemented atomic RPCs `confirm_venue_price(p_price_id, p_venue_id)` and `confirm_happy_hour(p_hh_id, p_venue_id)` with `WHERE id = $1 AND venue_id = $2`. The route passes `venueId` from the URL; when the RPC returns no row (e.g. mismatched venue), the handler returns **404** (`Price log not found` / `Happy hour not found`). Behavior matches the plan.

### BE-F-07 — Coordinate validation

- **POST /api/venues:** After parsing `latitude` and `longitude`:
  - If either is not finite (`Number.isFinite`) → **400** with `{ error: 'latitude and longitude must be finite numbers' }`.
  - If latitude &lt; -90 or &gt; 90 → **400** with `{ error: 'latitude must be between -90 and 90' }`.
  - If longitude &lt; -180 or &gt; 180 → **400** with `{ error: 'longitude must be between -180 and 180' }`.

---

## Validation steps completed

- **Lint:** `ReadLints` on `routes/venues.js` — no issues.
- **Regression:** `npm test` in `apps/beerbook-api` — all 23 tests pass (no venue route tests in suite).

**Exact validation commands run:**

```bash
cd "c:\Users\kenyo\OneDrive\Desktop\daw-platform\daw-platform\apps\beerbook-api"
npm test
```

**Tests not run:** No automated tests exist for venue routes. The following were not executed (would require running API with Supabase/PostgREST and auth):

- `radius=0` → 400
- `radius=-1` → 400
- `radius=99999` clamped to max (50000)
- Confirm with mismatched `venue_id` → 404
- Venue create with NaN/Infinity/out-of-range coordinates → 400
- Valid venue list and create flows unchanged

Manual or integration tests for the above are recommended.

---

## Contract / doc implications

- **HTTP:** Existing success response shapes unchanged. New **400** responses for invalid `radius` or coordinates; **404** for confirm parent mismatch was already in place via 3.1.
- **Documentation:** Plan calls for documenting venue API input constraints (max radius, coordinate ranges) and 400 error codes. No API contract doc was updated in this change; recommend adding to API docs:
  - `GET /api/venues?lat=&lng=&radius=`: `radius` optional; if present must be positive integer (meters); server clamps to max (default 50000, overridable by `MAX_VENUE_RADIUS_M`). Invalid/negative → 400.
  - `POST /api/venues`: `latitude` in [-90, 90], `longitude` in [-180, 180], both finite; otherwise 400.

---

## Known risks / follow-up

- **Frontend:** Previously-accepted invalid inputs (e.g. huge radius, bad coordinates) will now return 400. Frontend should be checked to ensure venue search and create flows show error states for 400 responses; no backend change required for that.
- **Config:** `MAX_VENUE_RADIUS_M` is read at module load; changing it requires process restart (same as other env in this app).
- **Coverage:** Adding unit or integration tests for venue validation (radius 400/clamp, coordinate 400, confirm 404) would reduce regression risk; not implemented in this item.

---

## Prerequisites

- **3.1 (Atomicize R-T-W):** Satisfied. Confirm endpoints already use RPCs with compound `(id, venue_id)` and return 404 on no row; no prerequisite work missing for 3.3.
