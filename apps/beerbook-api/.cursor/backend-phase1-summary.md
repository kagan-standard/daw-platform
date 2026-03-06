# Backend Phase 1 – Summary

## 1. Exact files changed

- `daw-platform/apps/beerbook-api/server.js`
- `daw-platform/apps/beerbook-api/routes/tabs.js`

## 2. Patch

See `.cursor/backend-phase1.patch` (relative to `apps/beerbook-api/`).

## 3. Summary of what was changed

### CORS (server.js)

- **Allowlist:** Replaced single-origin check with an allowlist built from `CORS_ORIGIN` plus optional `CORS_ORIGINS` (comma-separated). No more 403 on OPTIONS solely because `Origin` was missing or not the one web origin.
- **Missing Origin:** Requests with no or empty `Origin` are treated as allowed. OPTIONS receives 204 with CORS headers (ACAO set to `CORS_ORIGIN` when origin is missing). Non-preflight requests without origin are not rejected and do not get CORS headers added.
- **Preflight:** Only requests whose `Origin` is not in the allowlist get 403. All others get 204 with `Access-Control-Allow-*` headers. Web behavior is unchanged when `Origin` equals `CORS_ORIGIN`.
- **Config:** `CORS_ORIGIN` (default unchanged), optional `CORS_ORIGINS` for extra origins.

### Rate limit (server.js)

- **Default limit:** `RATE_LIMIT_MAX` default raised from 100 to 200 per window to better tolerate mobile/bootstrap bursts.
- **Backward compatibility:** Existing deployments can keep 100 by setting `RATE_LIMIT_MAX=100`.
- **429 contract:** Unchanged. Response still has `error_code: 'RATE_LIMITED'`, `error`, `retryAfter`, `request_id`; `Retry-After` header still set. Comment added to document this contract.

### Additive consistency (routes/tabs.js)

- **GET /api/achievements/next:** When a candidate exists, the `data` object now includes `is_fallback: false`. No other fields or status codes changed. GET /api/achievements/fallback already sends `is_fallback: true`.

## 4. Endpoints intentionally left unchanged (for compatibility)

- **GET /api/achievements/next** when there is no candidate: still returns **200** with `{ data: null }` (not switched to 204).
- **GET /api/users/:id** (activity): still returns the profile at top level (no `{ data: ... }` wrapper).
- **Auth errors:** Still `{ error_code, error, request_id }`; no new required fields.
- **Generic errors:** Still `{ error }` (and sometimes upstream body); no removal or renaming of fields.
- **All success/error status codes** and response envelopes: unchanged except the additive `is_fallback` on achievements/next.
- **Auth/request validation:** Not tightened; no new required headers or body checks.
- **Write endpoints:** Rate limit is global; no separate loosening for POST/PATCH/DELETE beyond the single raised default (optional override via env).
