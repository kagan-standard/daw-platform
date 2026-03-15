# Phase 1.8 — Sanitize Error Response Payloads

**Date:** 2026-03-07  
**Issue resolved:** BE-B-03 (Medium)  
**Arch risk addressed:** ARCH-01 (dual runtime) — fix covers both Node and Edge error paths

---

## Problem

5xx responses from both the Node (`POST /internal/process-event`) and Edge (`process-event` Supabase Edge Function) runtimes surfaced raw exception messages in the response body. This leaked schema names, DB error details, and operational internals to callers.

---

## Files Changed

| File | Change |
|---|---|
| `apps/beerbook-api/routes/internal.js` | Added `crypto` require. Rewrote catch block: 4xx errors with `.body` returned as-is; 5xx errors return generic `{ error: "internal_error", correlation_id }` envelope. Detailed error logged server-side with correlation ID. |
| `apps/beerbook-api/supabase/functions/process-event/index.ts` | Rewrote catch block: 4xx errors (engine defense-in-depth) passed through with controlled message; 5xx errors return generic `{ error: "internal_error", correlation_id }` envelope. Detailed error logged server-side with correlation ID. |
| `apps/beerbook-api/docs/API_CONTRACT_SCHEMA_AUDIT.md` | Added documentation of the 5xx error envelope schema, correlation ID sourcing, and sanitization guarantees. |

---

## Error Envelope Schema (5xx)

```json
{
  "error": "internal_error",
  "correlation_id": "<uuid>"
}
```

- **Node path:** `correlation_id` uses `req.requestId` (set by `requestIdMiddleware` from `x-request-id` header or auto-generated UUID), with `crypto.randomUUID()` fallback.
- **Edge path:** `correlation_id` is a fresh `crypto.randomUUID()` per error.
- **4xx responses:** Unchanged — they use explicit, controlled error objects (no raw exception text).

---

## Validation Steps

1. **5xx responses contain no raw error details:**
   - Trigger a 5xx on the Node path (e.g., simulate a DB failure in `processEvent`). Verify the response body is `{ "error": "internal_error", "correlation_id": "<uuid>" }` with no stack traces or DB error messages.
   - Trigger a 5xx on the Edge path (same method). Verify identical envelope shape.

2. **Server logs include correlation ID and full error detail:**
   - For each 5xx above, verify `console.error` output contains the `correlation_id` value and the full error object (message + stack).

3. **Error envelope shape is consistent across Node and Edge paths:**
   - Both paths produce `{ "error": "internal_error", "correlation_id": "<uuid>" }` — same keys, same value types.

4. **4xx responses unaffected:**
   - Verify `401`, `400`, `403` responses from both paths still return their existing controlled error messages (e.g., `{ "error": "Invalid event_type", "valid_types": [...] }`).

5. **Regression:**
   - Normal `rating_award`, `cheers_given`, `cheers_received`, `rating_submitted` flows succeed with 200 and correct response shape.
   - `admin_grant` by non-admin still returns 403 with explicit message.

---

## Contract / Doc Implications

- **API_CONTRACT_SCHEMA_AUDIT.md** updated with the 5xx error envelope schema and correlation ID sourcing details.
- **No breaking changes for 4xx consumers.** Only 5xx response bodies changed — clients should not be parsing 5xx bodies for business logic.
- **Clients can use `correlation_id`** from 5xx responses to reference server-side logs for debugging.
- **`x-request-id` header** (already returned by Node path via `requestIdMiddleware`) can be used to correlate requests end-to-end; the 5xx envelope's `correlation_id` matches `x-request-id` on the Node path.
