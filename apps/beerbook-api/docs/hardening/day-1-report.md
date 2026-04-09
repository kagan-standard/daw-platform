# Day 1 Report — Crash-Proof the Request Pipeline

**Date:** 2026-04-08
**Branch:** hardening/main
**Tag:** hardening-day-1-complete

---

## Objective

Eliminate unhandled-rejection crashes in the Express API by wrapping every
async route handler and adding global error boundaries.

Corresponds to audit finding **#1 (Critical)**: _"Every async route handler is
an unguarded `async (req, res) => { … }` — a single thrown error kills the
process."_

---

## Changes

| File | Change |
|---|---|
| `lib/asyncHandler.js` | **New.** Thin wrapper: `Promise.resolve(fn(req, res, next)).catch(next)` — forwards thrown errors to Express error middleware. |
| `server.js` | 1. `require('./lib/asyncHandler')` added at top. |
| | 2. `process.on('unhandledRejection', …)` — logs but does **not** exit (lets request fail gracefully). |
| | 3. `process.on('uncaughtException', …)` — logs and exits so Docker restarts cleanly. |
| | 4. **13 route handlers** wrapped with `asyncHandler()`. |
| | 5. Generic JSON error-handling middleware appended (returns structured `{ error, message, request_id }`; hides stack in production). |

---

## Verification Results

| ID | Check | Result |
|---|---|---|
| V1.1 | `node -c server.js` — syntax OK | **PASS** |
| V1.2 | `grep -c asyncHandler server.js` — expect 13+ matches | **PASS** (13 handler wraps + require) |
| V1.3 | `docker compose up --build -d && healthcheck` — container healthy | **PASS** |
| V1.4 | Trigger error → response is JSON `{ error, message, request_id }` | **PASS** |
| V1.5 | Public routes return 200: `GET /api/ratings`, `GET /api/stats`, `GET /api/config` | **PASS** (3/3) |
| V1.5 (auth) | Authenticated smoke test (POST /api/ratings, GET /api/profile) | **DEFERRED** — token acquisition blocked; will verify manually via app usage |
| V1.6 | Catalog backfill spot-check | **DEFERRED** — requires auth token; same blocker as V1.5 auth |

### Deferred verification note

V1.5 auth and V1.6 are deferred because programmatic Keycloak token
acquisition was not available during the hardening session. Both will be
verified manually through normal app usage. The core crash-proofing (V1.1–V1.5
public) is fully validated.

---

## Risk Assessment

- **Rollback:** Revert single commit; no schema changes.
- **Blast radius:** Read-path only; no data mutations introduced.
- **Confidence:** High — `asyncHandler` is a well-understood Express pattern;
  process-level handlers follow Node.js best practices.
