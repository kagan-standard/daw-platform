# Phase 1.1 — Block `admin_grant` Privilege Escalation

**Date:** 2026-03-07
**Issue:** BE-B-01 (Critical)
**Status:** Implemented

---

## Problem

No admin-role authorization check existed in the `process-event` handlers for the `admin_grant` event type. Any authenticated JWT could mint arbitrary Tabs via both the Node internal endpoint and the Edge function — an actively exploitable privilege escalation.

---

## Files Changed

| File | Change |
|---|---|
| `apps/beerbook-api/lib/processEventEngine.js` | Added 403 guard in `processEvent` for `admin_grant` branch; exported `isAdminUser` |
| `apps/beerbook-api/routes/internal.js` | Imported `isAdminUser`; added 403 rejection in `handleProcessEventRequest` before engine call |
| `apps/beerbook-api/supabase/functions/process-event/engine.ts` | Added 403 guard in `processEvent` for `admin_grant` branch; exported `isAdminUser` |
| `apps/beerbook-api/supabase/functions/process-event/index.ts` | Imported `isAdminUser`; added 403 HTTP response before engine call |
| `apps/beerbook-api/docs/API_CONTRACT_SCHEMA_AUDIT.md` | Documented `admin_grant` authorization requirement and 403 error shape |

---

## Defense-in-Depth Architecture

The admin gate is enforced at **two layers** in **both runtimes**:

1. **Handler layer** (`routes/internal.js` + `index.ts`) — rejects early with HTTP 403 before the engine is invoked. This is the primary gate.
2. **Engine layer** (`processEventEngine.js` + `engine.ts`) — throws a 403-status error inside the engine's `admin_grant` branch. This is the fallback if the engine is ever called directly or from a different handler.

Admin identity is resolved from `ADMIN_USER_ID` / `ADMIN_USER_IDS` environment variables via the pre-existing `isAdminUser()` helper (already used for weekly-cap bypass in `rating_award`).

---

## Error Shape

Non-admin callers receive:

```
HTTP 403
{ "error": "Forbidden: admin_grant requires admin role" }
```

---

## Validation Steps

1. **Non-admin JWT + `event_type=admin_grant` returns 403** — test against both Node (`POST /internal/process-event`) and Edge (`POST /supabase/functions/process-event`) endpoints with a regular user token.
2. **Admin JWT + `event_type=admin_grant` succeeds** — confirm an admin-configured user ID still processes `admin_grant` with idempotent ledger mutation.
3. **Other event types unaffected** — verify `rating_award`, `cheers_given`, `cheers_received`, `rating_submitted` continue to work for non-admin users with no behavioral change.

---

## Contract / Doc Implications

- `API_CONTRACT_SCHEMA_AUDIT.md` updated with the 403 error shape and env var reference (`ADMIN_USER_ID` / `ADMIN_USER_IDS`).
- No other API contract changes needed — the 403 is a new restriction on a previously unrestricted (but should-have-been-restricted) path. Normal frontend flows do not call `admin_grant` directly.

---

## Phase 2 Gate

Item 1.1 (along with 1.2) unblocks **Phase 2.1 — Node/Edge engine parity testing**, which should run against the now-secured engine.
