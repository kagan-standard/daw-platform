# Item 1.2 — Close Internal Endpoint Fail-Open

**Phase 1, Batch 1 | Issues resolved: BE-B-02 (High), BE-A-01 (High)**

---

## Summary

Closed a fail-open vulnerability where `/internal` routes could be reached without a valid shared secret and were not subject to any rate limiting. The `INTERNAL_PROCESS_EVENT_SECRET` environment variable is now mandatory; the server refuses to mount functional `/internal` routes when it is unset. A dedicated, stricter rate limiter is applied to all `/internal` traffic.

---

## Files Changed

| File | Change |
|---|---|
| `apps/beerbook-api/server.js` | 1. Added startup warning when `INTERNAL_PROCESS_EVENT_SECRET` is not set. 2. Wrapped `/internal` route mounting in a conditional: when the secret is set, a dedicated rate limiter (1/4 of the `/api` limit) is applied before the internal router; when unset, a 503 catch-all handler is mounted instead. |
| `apps/beerbook-api/routes/internal.js` | 1. Changed `INTERNAL_SECRET` fallback from `null` to `''` so the check is never truthy-skipped. 2. Made the secret validation unconditional — every request must present a matching `x-internal-secret` header; missing or wrong secret returns `403`. 3. Removed the conditional guard on injecting the header value into the body object. 4. Updated JSDoc header to reflect new contract. |

---

## Validation Steps

1. **Startup without secret refuses to mount internal routes**
   - Unset `INTERNAL_PROCESS_EVENT_SECRET` and start the server.
   - `POST /internal/process-event` should return `503` with `"Internal routes disabled"`.
   - Console should log the warning message.

2. **Internal endpoint rejects requests without valid secret**
   - Set `INTERNAL_PROCESS_EVENT_SECRET` and start the server.
   - Send a `POST /internal/process-event` with a valid JWT but **no** `x-internal-secret` header.
   - Expect `403` with `{ "error": "Invalid or missing internal secret" }`.
   - Send a `POST /internal/process-event` with an **incorrect** `x-internal-secret` value.
   - Expect `403`.

3. **Internal endpoint accepts requests with correct secret**
   - Send a `POST /internal/process-event` with valid JWT **and** correct `x-internal-secret` header.
   - Expect `200` with normal process-event response.

4. **Rate limiter applies to `/internal` routes**
   - With `RATE_LIMIT_MAX=200` (default), the `/internal` rate limit is `50` requests per window.
   - Exceed the limit; expect `429` with `RATE_LIMITED` error envelope.
   - Verify `/api` routes are unaffected by `/internal` rate-limit exhaustion (separate limiter instance).

5. **Regression — normal flows unaffected**
   - In-process `invokeProcessEvent()` path still calls `handleProcessEventRequest` with the secret injected by the caller; confirm rating submissions still earn Tabs.
   - `/api` routes continue using the existing limiter at the higher threshold.

---

## Contract / Doc Implications

- **Required env var:** `INTERNAL_PROCESS_EVENT_SECRET` is now a hard requirement for `/internal` routes. Deployment runbooks, `.env.example`, and CI/CD pipelines must set this variable. Without it, the server starts but `/internal` endpoints return `503`.
- **New 403 response:** `/internal/process-event` now returns `403` (not `401`) when the shared secret is missing or invalid. Callers that previously relied on the secret being optional must now provide it.
- **New 429 response:** `/internal` routes are rate-limited at 1/4 the `/api` threshold. Callers must handle `429` responses with `Retry-After` headers.
- **No frontend impact:** Frontend never calls `/internal` routes directly; these changes are invisible to end users.
