# API Contract Schema Audit

Generated: 2026-03-15  
Scope: `apps/beerbook-api`  
Baseline doc: `docs/API_CONTRACT.md`

---

## What Was Audited

- Endpoint coverage parity from runtime sources:
  - `server.js`: inlined API handlers (health, catalog, breweries, ratings, profile, stats, review share)
  - `routes/*.js`: activity, beers, crews, deals, exchange, follows, highlights, internal, leaderboard, map, tabs, tracking, upload, venues, admin
  - Total: `103 implemented` (parity target for contract coverage)
- Route behavior and response/error shapes were re-checked against:
  - `server.js`
  - `routes/*.js`
  - `lib/processEvent.js`
  - `lib/processEventEngine.js`
  - `lib/achievementProgress.js`
- Schema/runtime alignment was re-checked against migrations:
  - `supabase/migrations/*.sql` (including crew milestones, weekly challenges, ledger, profile cache RPCs)

---

## Verified New / Updated Endpoints (2026-03-15)

- **Crews:** `GET /api/crews/:id/challenge`, `GET /api/crews/:id/milestones`, `GET /api/crews/:id/trending`, `GET /api/crews/:id/style-counts` — implemented in `routes/crews.js`; require crew membership (403 if not member). Documented in `API_CONTRACT.md` under Crews.
- **Crew detail:** `GET /api/crews/:id` now returns `stats` (including `venues_visited_count`, `members_on_streak_count`, `favorite_style_name`) and `weekly_challenge: { challenge, progress }`.
- **Leaderboard:** `GET /api/leaderboard` and `GET /api/tabs/leaderboard` accept optional `crew_id`; responses include `truncated` and `pagination` where applicable; DB aggregation via `leaderboard_aggregate` RPC.
- **Profile & cosmetics:** Profile responses include `equipped_avatar_id`, `equipped_avatar_asset_url`, `equipped_border_fit`; cosmetics equip supports `slot: 'avatar'`; catalog/inventory list avatar cosmetics with `type: 'avatar'`. Documented in `API_CONTRACT.md`.
- **Catalog/beer:** Browse, search, validate-new, and single beer include `style_category` (canonical family); browse `style` param filters by style family. Documented in `API_CONTRACT.md`.
- **Guest ratings:** `POST /api/ratings` and `DELETE /api/ratings` accept guest actor via `X-Guest-Id` when `ENABLE_GUEST_RATINGS` is set; `POST /api/guest-ratings/claim` documented. Auth matrix in `API_CONTRACT.md`.
- **Border fit:** Cosmetics support `border_fit` and profile/tabs responses include `equipped_border_fit`. Documented in `API_CONTRACT.md` (Cosmetics, Profile, Tabs leaderboard).

---

## Findings

### High Priority

No high-priority contract drift found in this pass after regeneration.

### Medium Priority

No medium-priority drift found in this pass after regeneration.

### Low Priority / Clarifications

1) `tab_transactions` remains physically present but is deprecated/orphaned  
- **Implementation state:** active tabs paths write/read `tabs_ledger`; no active route/engine path uses `tab_transactions` for runtime movement logic.
- **Contract/schema note:** this is now explicitly documented as deprecated to avoid accidental new dependencies.

2) `user_tabs_profile` should be treated as cache, not balance source  
- **Implementation state:** `profiles.tabs_balance` is canonical and updated by `tabs_ledger_after_insert()` trigger.
- **Contract/schema note:** docs now call out that `user_tabs_profile.tab_balance` is non-canonical cache data.

3) Weekly tabs metrics are now mixed-source by design  
- **Implementation state:** `GET /api/tabs/profile` uses:
  - `ratings_this_week` from `user_tabs_profile` cache
  - `weekly_cap_reached` from weekly `tabs_ledger` `rating_award` count
- **Contract note:** this is now explicitly documented to prevent client assumptions.

---

## Verified Migration-Specific Changes

- `tabs_ledger` is the sole source of truth for tab movements (rating awards, cheers, admin grants, achievement rewards, spends).
- `tab_transactions` is deprecated/orphaned and retained only for compatibility.
- `POST /api/ratings` create response includes:
  - `current_streak_weeks`
  - `longest_streak_weeks`
- `GET /api/tabs/history` reads from `tabs_ledger` and maps rows to legacy transaction-shaped response objects.
- `GET /api/tabs/profile` computes `weekly_cap_reached` from `tabs_ledger` weekly `rating_award` counts.
- `processEventEngine` `rating_award` path calls `public.refresh_rating_award_profile_cache(p_user_id text, p_tabs_delta int)`.
- Achievement progress is shared via `lib/achievementProgress.js` in:
  - unlock evaluation (`processEventEngine`)
  - API suggestion endpoints (`GET /api/achievements/next`, `GET /api/achievements/fallback`)
- Admin tab endpoints now write to `tabs_ledger`:
  - `PATCH /api/admin/tabs/submissions/:id` (approve path)
  - `POST /api/admin/tabs/users/:userId/adjust`
- `scripts/weekly-tabs-eval.js` now handles weekly decay/tier movement and does not award tabs or read `tab_transactions`.

---

## Error Contract Verification Notes

- Internal event errors remain aligned with implementation in `routes/internal.js`:
  - invalid/unsupported `event_type`
  - missing required UUID `event_id` for idempotent event types
  - missing `payload.target_user_id` for `cheers_received`
  - auth/authorization failures (`401`)
  - **`admin_grant` authorization (`403`):** `event_type=admin_grant` requires the caller's JWT `sub` to match an admin user ID configured via `ADMIN_USER_ID` / `ADMIN_USER_IDS` env vars. Non-admin callers receive `403 { error: "Forbidden: admin_grant requires admin role" }`. Enforced in both Node (`routes/internal.js`, `lib/processEventEngine.js`) and Edge (`supabase/functions/process-event/index.ts`, `engine.ts`) runtimes. (Phase 1, item 1.1 — BE-B-01)
- **Crew-scoped endpoint authorization (`403`):** The following endpoints now enforce crew membership before returning data. Non-members receive `403 { error_code: "CREW_MEMBERSHIP_REQUIRED", error: "Crew membership required" }`. Shared guard: `lib/crewAuth.js::requireCrewMembership`. (Phase 1, item 1.3 — BE-C-01, BE-D-01, INT-03)
  - `GET /api/ratings?feed=crew&crew_id=<id>` — ratings feed scoped to crew
  - `GET /api/activity?feed=crew&crew_id=<id>` — activity feed scoped to crew
  - `GET /api/stats?crew_id=<id>` — stats scoped to crew
- Tabs/admin migration endpoints now report ledger-insert failures through upstream error passthrough (status/body), consistent with current handler behavior.
- No new migration-related error-shape regressions were found.
- **Upload content validation (Phase 1, item 1.4 — BE-F-01, BE-F-05, BE-F-08, INT-14):**
  - `POST /api/upload` and `POST /api/upload/photo` now enforce:
    - Extension AND MIME match (both must be in the allowed set and must correspond to each other)
    - Post-upload magic-byte verification for JPEG (`FF D8 FF`), PNG (`89 50 4E 47`), WebP (`RIFF…WEBP`), HEIC (`ftyp` at offset 4)
    - JWT `sub` sanitized to `[a-zA-Z0-9_-]` before use in filenames (max 128 chars)
  - Accepted formats: JPEG (`.jpg`, `.jpeg`), PNG (`.png`), WebP (`.webp`), HEIC (`.heic`). Max size: 10 MB.
  - New rejection responses (`400`):
    - `{ error: "Invalid file type. Only JPEG, PNG, WebP, and HEIC are allowed." }` — extension or MIME not in allowed set
    - `{ error: "File extension does not match content type." }` — extension/MIME mismatch (e.g. `.png` with `image/jpeg`)
    - `{ error: "File content does not match declared image type (magic-byte check failed)." }` — valid ext+MIME but wrong file bytes
  - `UPLOAD_DIR` validated at startup: resolved via `realpathSync`, must be under approved prefix (configurable via `UPLOAD_DIR_APPROVED_PREFIXES` env var, defaults to app root + `/data`). Server exits if validation fails.
  - Uploaded files served with `X-Content-Type-Options: nosniff`. Non-image extensions receive `Content-Disposition: attachment`.

- **5xx error envelope sanitization (Phase 1, item 1.8 — BE-B-03):**
  - All 5xx responses from `POST /internal/process-event` (Node) and the `process-event` Edge Function now return a stable generic error envelope instead of raw exception messages:
    ```json
    { "error": "internal_error", "correlation_id": "<uuid>" }
    ```
  - The `correlation_id` is a UUID that maps to the detailed error logged server-side.
    - **Node path:** uses `req.requestId` (set by `requestIdMiddleware` via `x-request-id` header or auto-generated UUID).
    - **Edge path:** generates a new `crypto.randomUUID()` per error.
  - No stack traces, DB error details, or raw exception text are exposed in 5xx response bodies.
  - 4xx responses are unaffected — they continue to use explicit, controlled error messages.
  - Server-side logs retain full error details (message, stack trace) paired with the correlation ID for debugging.

---

## Result

`API_CONTRACT.md`, `DATABASE_SCHEMAS_OVERVIEW.md`, and this audit are aligned to the current API (including crew challenge, milestones, trending, style-counts, leaderboard crew scoping, avatars/cosmetics, style_category, border_fit, guest ratings) and to migrations through `crew_milestones` and `weekly_challenges`. Re-verified 2026-03-15.
