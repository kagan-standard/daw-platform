# Phase 5 — Scripts, Tests, and Cross-Cutting Concerns

**Scope**: scripts/, test/, error handling, request ID, rate limiting, upload/moderation flow, CORS.  
**Sources**: [scripts/](../../scripts/), [test/](../../test/), [server.js](../../server.js), [routes/upload.js](../../routes/upload.js), [lib/uploadModeration.js](../../lib/uploadModeration.js), [lib/visionModeration.js](../../lib/visionModeration.js).

---

## 1. Scripts

All scripts live under `apps/beerbook-api/scripts/`. They are run manually or via npm/CI; none are part of the HTTP request path.

| Script | Purpose | Env / usage |
|--------|---------|-------------|
| **check-migration-safety.js** | CI policy: scan Supabase migration `.sql` files for forbidden destructive patterns. Exits non-zero if any violation. | No env. Run: `node scripts/check-migration-safety.js` or `npm run ci:check-migrations`. Forbidden: `TRUNCATE … CASCADE`, unguarded `DROP TABLE`, `DELETE FROM table;` without WHERE. |
| **weekly-tabs-eval.js** | Weekly tabs evaluation (Monday 00:00 UTC): inactivity decay, weekly counter reset, maintenance/progression, demotions/promotions. | `SUPABASE_REST_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Run: `npm run tabs:weekly-eval`. Idempotent (job_runs), cursor-paginated, advisory lock. |
| **streak-risk-check.js** | Mid-week streak risk notifications (Thursday): notifies users at risk of losing streak. | Same as above. Run: `npm run tabs:streak-risk`. Same safety guarantees as weekly-tabs-eval. |
| **check-and-backfill-achievement-cosmetics.js** | Verify achievement–cosmetic alignment; optionally backfill missing user_cosmetics for achievement-linked cosmetics. | `SUPABASE_URL` or `SUPABASE_REST_URL`, `SUPABASE_SERVICE_KEY` or `SUPABASE_SERVICE_ROLE_KEY`. Run: `node scripts/check-and-backfill-achievement-cosmetics.js [--backfill]`. |
| **seed-avatar-cosmetics.js** | Seed avatar cosmetics from CSV into `public.cosmetics`. | Same Supabase env. Run: `node scripts/seed-avatar-cosmetics.js [path/to/avatars.csv]` or use `AVATARS_CSV`. |
| **seed-border-cosmetics.js** | Seed 76 border cosmetics into `public.cosmetics` (achievement-key linked). | Same Supabase env. Run: `node scripts/seed-border-cosmetics.js`. |
| **seed-title-cosmetics.js** | Seed 76 title cosmetics into `public.cosmetics` (achievement-key linked). | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`. Run: `node scripts/seed-title-cosmetics.js`. |
| **manual-ledger-reset.sql** | One-time data reset for tabs ledger migration (dev only). Truncates user-generated tables, resets user_tabs_profile cache and profile tabs_balance. | Run in psql with `SET app.env = 'development';` then `\i scripts/manual-ledger-reset.sql`. Guard: script RAISE EXCEPTION if `app.env != 'development'`. |

**Note**: Cosmetics seed scripts and check-and-backfill use `dotenv` if available; Supabase URL/key can come from env or `.env`.

---

## 2. Tests

**Runner**: Node built-in test runner (`node --test`). Run: `cd apps/beerbook-api && npm test`. All `*.test.js` and `*.integration.test.js` under `test/` are executed.

### Test suites

| File | Description |
|------|-------------|
| **process-event-engine-parity.test.js** | Node vs Edge process-event parity: same input → same response shape (canonical keys, streak fields, RPC behavior). Exercises Node engine with mock `rest()`. |
| **process-event-engine-cosmetics.test.js** | Process-event cosmetics: achievement unlock → border/title grants, cap behavior, idempotency, error propagation. |
| **actor-identity.test.js** | Actor identity resolution (unit). |
| **ratings-yg-value.test.js** | Ratings YG value logic (unit). |
| **achievements-fallback.integration.test.js** | GET /api/achievements fallback and next; user-scoped and foreign profile. |
| **achievements-profile-scope.integration.test.js** | Achievements and profile scope. |
| **cosmetics.integration.test.js** | Cosmetics purchase, equip, user cosmetics. |
| **catalog-browse.integration.test.js** | Catalog browse: per-beer review count and response shape (e.g. `mapCatalogBeer` review_count / reviews.count). |
| **scheduler-idempotency-and-coverage.test.js** | Scheduler idempotency (weekly_tabs_eval, streak_risk_check double-run no-op), population >10k pagination, notification dedupe contract. |
| **crew-milestones-contract.test.js** | Crew milestones contract. |

### CI policy (migration safety)

Before commit or in CI, run:

```bash
npm run ci:check-migrations
```

This runs `scripts/check-migration-safety.js` and exits 1 if any migration file contains the forbidden patterns. Recommendation: add `npm run ci:check-migrations` and `npm test` to CI (e.g. GitHub Actions).

---

## 3. Error handling

- **Per-route**: Routes return appropriate HTTP status and JSON bodies (e.g. `res.status(400).json({ error: '...' })`, `res.status(404).json({ error: '...' })`). Many 5xx responses from PostgREST are surfaced as 502 with a generic message (e.g. "Upstream error", "Catalog browse failed").
- **Stable error shape for clients**: Auth and rate-limit responses use a consistent shape: `error_code`, `error`, and often `request_id` (see Request ID below). Example: `{ error_code: 'AUTH_REQUIRED', error: 'Missing or invalid Authorization header', request_id: req.requestId || null }`.
- **Multer / upload errors**: A dedicated 4-arg error middleware is registered in `server.js` after all routes:
  - `multer.MulterError` with `LIMIT_FILE_SIZE` → 413, "File too large. Maximum size is 10MB."
  - Other Multer errors → 400 with message.
  - Errors whose message includes "Invalid file type" → 400 with that message.
  - All other errors passed to `next(err)`.
- **No final fallback**: There is no catch-all error handler that sends 500 for unhandled `next(err)`. Unhandled errors rely on Express default behavior (can log and/or send minimal response depending on env).

---

## 4. Request ID

- **Middleware**: `requestIdMiddleware` in `server.js` runs early (after CORS, before body parsing). It reads `X-Request-Id`; if missing or empty, it generates a UUID. It sets `req.requestId` and echoes the value in the response header `x-request-id`.
- **Usage**: Error responses (auth, rate limit, crew membership, and others) include `request_id: req.requestId || null` in the JSON body for correlation. Used in `server.js`, `routes/activity.js`, `routes/crews.js`, `routes/internal.js`, and `lib/actorIdentity.js` (e.g. for logging).

---

## 5. Rate limiting

Implemented with `express-rate-limit`. All limiters use `standardHeaders: true`, `legacyHeaders: false`. When triggered, API responses use a stable 429 shape: `error_code: 'RATE_LIMITED'`, `error: 'Too Many Requests'`, `retryAfter`, `request_id`.

| Limiter | Applied to | Window | Max | Env |
|---------|------------|--------|-----|-----|
| **limiter** | `/api` | 1 min (default) | 200 (default) | `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` |
| **internalLimiter** | `/internal` (when `INTERNAL_PROCESS_EVENT_SECRET` set) | same window | floor(RATE_MAX/4) | same |
| **registerLimiter** | POST `/api/auth/register` | 15 min | 5 | — |
| **loginLimiter** | POST `/api/auth/login` | 15 min | 10 | — |
| **reviewLinkLimiter** | GET `/review/:ratingId` | same as general | same as general | same |

Default window: 60_000 ms; default max: 200. Register/login use a different response shape (`message`-style) for compatibility with auth clients.

---

## 6. Upload and moderation flow

- **Entrypoints**: POST `/api/upload` and POST `/api/upload/photo` (both auth required), implemented in `routes/upload.js` with multer.
- **Validation**: Extension whitelist (`.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`) and MIME whitelist; extension and MIME must match (e.g. `EXT_TO_MIMES`). Max size 10MB. Post-upload magic-byte verification; if mismatch, file is removed and 400 returned. Filename uses sanitized JWT `sub` (`[a-zA-Z0-9_-]`).
- **Serving**: Uploaded files are served under `/uploads` with security headers (X-Content-Type-Options: nosniff, X-Frame-Options: DENY, Cache-Control; non-image MIME gets Content-Disposition: attachment). See Phase 1 / server.js.
- **Moderation (async)**: After a successful upload, the handler calls `setImmediate(() => runModeration(rest, userId, filePath, url))` so the HTTP response is sent first. Moderation is fire-and-forget.
- **runModeration** (`lib/uploadModeration.js`): Skips HEIC (Vision API does not support it). For JPEG/PNG/WebP, calls `visionModeration.checkSafeSearch(filePath)` (Google Cloud Vision Safe Search: adult, violence, racy). If `safe === false`: deletes the file from disk; clears `profiles.avatar_url` and `ratings.photo_url` that reference the upload URL; inserts a `tab_notifications` row (type `photo_removed`, message about content guidelines). Errors in moderation are logged and do not affect the already-returned 201.
- **Vision** (`lib/visionModeration.js`): Uses `@google-cloud/vision` when `GOOGLE_APPLICATION_CREDENTIALS` is set and `MODERATION_ENABLED !== 'false'`. Otherwise returns `{ safe: true }`. Only JPEG, PNG, WebP are checked; HEIC is not sent to Vision.

---

## 7. CORS

- **Config**: Allowlist built from `CORS_ORIGIN` (default `https://beerbook.drinksafterwork.net`) and optional comma-separated `CORS_ORIGINS` (e.g. mobile app origins). Stored in a `Set`; requests with no `Origin` are allowed (e.g. same-origin or native clients).
- **Middleware**: `corsMiddleware` in `server.js`. OPTIONS: if origin is allowed, respond 204 with `Access-Control-Allow-Origin` (echo origin or `CORS_ORIGIN` when missing), `Access-Control-Allow-Credentials: true`, Allow-Methods, Allow-Headers, Max-Age; otherwise 403. Non-preflight: if origin is in allowlist, set ACAO, credentials, methods, headers. `Vary: Origin` set when CORS headers are applied.
- **Edge Function**: `supabase/functions/process-event/index.ts` sends fixed `corsHeaders` on all responses (for Supabase Edge invocation).

---

## Summary

- **Scripts**: 7 JS scripts (CI migration check, weekly tabs eval, streak risk, achievement-cosmetics check/backfill, 3 cosmetics seeds) + 1 SQL dev-only ledger reset.
- **Tests**: 10 test files; unit and integration; `node --test`; CI migration check via `npm run ci:check-migrations`.
- **Cross-cutting**: Request ID on every request and in error payloads; rate limits on `/api`, `/internal`, register, login, and review share; CORS allowlist; no global 500 fallback; upload flow with extension/MIME/magic-byte checks and async Vision moderation (Safe Search) with file deletion and user notification when unsafe.
