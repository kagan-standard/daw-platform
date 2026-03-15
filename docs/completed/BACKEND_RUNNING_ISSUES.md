# Backend Running Issues

## Confirmed
- **BE-A-01 (High, Pass A):** `/internal` routes are mounted outside the global `/api` limiter, so internal entrypoints are currently unthrottled.
- **BE-B-01 (Critical, Pass B):** `admin_grant` can be executed by any authenticated token in both Node internal and Edge `process-event` entrypoints; no admin authorization gate is enforced for this privileged event type.
- **BE-B-02 (High, Pass B):** `/internal/process-event` fails open when `INTERNAL_PROCESS_EVENT_SECRET` is unset, allowing external JWT callers to hit an internal mutation endpoint.
- **BE-E-01 (High, Pass E):** Achievement unlock flow can persist `user_achievements` while silently dropping tabs rewards if `tabs_ledger` insert fails, causing unlock/reward divergence.
- **BE-E-02 (High, Pass E):** `grantAchievementCosmetics` only searches `type=border`, so achievement-linked title cosmetics are never granted.
- **BE-E-03 (Medium, Pass E):** Admin tab-award flows update `user_tabs_profile.lifetime_tabs_earned` with read-then-write arithmetic, enabling lost updates under concurrent awards.
- **BE-C-01 (High, Pass C):** Crew-scoped `ratings`, `activity`, and `stats` paths accept arbitrary `crew_id` for any authenticated user and do not validate membership before returning scoped data.
- **BE-C-02 (High, Pass C):** Pass C feed/stats handlers rely on bounded in-memory scans (`limit=4000/5000`) while still reporting totals as complete, causing silent truncation and contract drift as data grows.
- **BE-D-01 (High, Pass D):** Pass D re-validates the same crew authorization gap on `GET /api/activity?feed=crew` (overlaps with BE-C-01), confirming inconsistent crew privacy enforcement in social feed paths.
- **BE-D-02 (High, Pass D):** `POST /api/crews` is non-atomic (`crews` insert then `crew_members` owner insert), allowing orphan crews if owner membership write fails.
- **BE-D-03 (High, Pass D):** `DELETE /api/crews/:id/members/:userId` does not validate post-delete recount status; transient recount failures can be interpreted as zero members and trigger unintended crew deletion.
- **BE-F-01 (High, Pass F):** Upload acceptance allows extension-or-MIME bypass and does not verify file signatures, so non-image payloads can be stored as accepted images.
- **BE-F-02 (High, Pass F):** Venue price/happy-hour confirm endpoints increment `confirmed_count` with read-then-write logic, allowing lost updates under concurrency.
- **BE-F-03 (Medium, Pass F):** `GET /api/venues?lat&lng&radius` forwards unbounded radius to `venues_within_radius`, creating avoidable high-cost query risk.
- **BE-G-01 (High, Pass G):** `GET /api/leaderboard` builds rankings from a bounded `ratings` pull (`limit=5000`) while returning results as complete leaderboards, causing silent truncation and ranking drift for high-volume periods.
- **BE-G-02 (High, Pass G):** `GET /api/map` and `GET /api/map/venues` execute unpaginated full-table reads (`ratings`/`venues`) and in-memory aggregation, creating high-latency/high-memory risk as dataset size grows.
- **BE-G-03 (High, Pass G):** `GET /api/deals` performs broad fan-out reads (`venue_menus`, `happy_hours`, radius venues) and O(N*M) in-memory joins per request, creating avoidable hotspot behavior under load.
- **BE-H-01 (High, Pass H):** `scripts/weekly-tabs-eval.js` has no per-week idempotency checkpoint/lock, so duplicate runs can re-apply inactivity decay and produce inconsistent tier/demotion outcomes.
- **BE-H-02 (High, Pass H):** Weekly/Thursday scheduler scripts read `user_tabs_profile` with fixed `limit=10000` and no pagination, silently skipping users beyond first page.
- **BE-H-03 (Medium, Pass H):** `scripts/streak-risk-check.js` inserts warning notifications without dedupe, so retries/duplicate runs can spam repeated `streak_at_risk` and `approaching_demotion` messages.
- **BE-H-04 (High, Pass H):** Node vs Edge `process-event` `rating_award` paths have drift: Node refreshes `user_tabs_profile` cache and returns streak fields, Edge does neither despite documented contract parity expectations.

## Likely
- **BE-A-02 (Medium, Pass A):** `trust proxy` is hard-coded to `1`, which may weaken IP-based controls if deployment topology differs from that assumption.
- **BE-B-03 (Medium, Pass B):** Internal/Edge process-event 5xx paths can surface raw exception messages to clients, increasing information disclosure risk.
- **BE-E-04 (Medium, Pass E):** `rating_award` weekly cap enforcement is non-atomic (count-then-insert), so concurrent events can exceed the cap boundary.
- **BE-C-03 (Medium, Pass C):** `comment_count` maintenance is best-effort/non-transactional relative to comment row writes, so counter drift can persist after RPC failures.
- **BE-C-04 (Medium, Pass C):** Cheers toggle is a read-then-write flow, which leaves a concurrency window for conflicting insert/delete outcomes under simultaneous requests.
- **BE-D-04 (High, Pass D):** `POST /api/crews/join` uses non-atomic count-then-insert capacity enforcement (`50` member cap), so concurrent joins can oversubscribe crews.
- **BE-D-05 (Medium, Pass D):** `POST /api/follows/:userId` toggle path is read-then-write and can produce unstable outcomes under concurrent requests.
- **BE-D-06 (Medium, Pass D):** `POST /api/crews/join` ignores member-count query status and can treat upstream count failures as `0`, allowing invalid joins.
- **BE-F-04 (Medium, Pass F):** Venue confirm endpoints mutate by child ID only (`priceId`/`hhId`) and do not enforce parent venue-ID match from the URL path.
- **BE-F-05 (Medium, Pass F):** Upload filename prefix embeds raw JWT `sub` without normalization; unsafe characters in subject values could create filesystem/path handling risk.
- **BE-F-08 (Medium, Pass F):** `UPLOAD_DIR` lacks startup path-safety validation before static mount/write usage (resolves Pass A watch item BE-A-03 from possible -> likely).
- **BE-G-04 (Medium, Pass G):** `GET /api/deals` limits YG exchange lookup to 500 rows while scoring all nearby menu entries, which can silently zero-score non-included beers and skew value ranking output.
- **BE-G-05 (Medium, Pass G):** Brewery map handlers cap responses at 500 records without pagination/overflow signaling, so dense viewport queries can silently drop valid breweries.
- **BE-G-06 (Medium, Pass G):** Tracking endpoints (`POST /api/track/click`, `POST /api/track/pageview`) acknowledge success before persistence and swallow write failures, allowing silent analytics loss.
- **BE-H-05 (High, Pass H):** `20260306_ledger_migration_reset.sql` performs unconditional destructive truncation (`TRUNCATE ... CASCADE`) without explicit environment/safety guardrails.
- **BE-H-06 (Medium, Pass H):** Contract/schema audit docs currently assert process-event migration parity that does not match Edge runtime behavior (`rating_award` cache refresh + streak fields).
- **BE-H-07 (Medium, Pass H):** Existing tests do not cover Pass H-critical paths (job idempotency/truncation, Edge parity, migration safety), leaving high-risk regressions weakly protected.

## Cross-Pass Watch Items
- **BE-B-04 (Medium, Pass B, Possible):** Weekly rating-award cap uses read-then-insert flow and may over-credit under high concurrency unless DB-level atomic enforcement exists.
- **BE-C-05 (Medium, Pass C, Possible):** Activity/stats fan-out reads and in-memory joins/sorts are likely to degrade at scale unless replaced by DB-side aggregate/feed query primitives. *Phase 4.7: Scale note acknowledged; follow-up in Phase 4.1 (DB-side aggregation) addresses related endpoints; activity/stats feed remains a candidate for future DB-side aggregate RPC.*
- **BE-D-07 (Medium, Pass D, Possible):** Followers/following enrichment computes `rating_count` from bounded in-memory rating scans (`limit=5000`), risking undercount and latency growth for high-volume users.
- **BE-D-08 (Low, Pass D, Possible):** Followers/following list endpoints are unauthenticated by design; verify product privacy policy before social visibility requirements tighten.
- **BE-F-06 (Medium, Pass F, Possible):** Uploads are served directly from static storage without explicit hardened file-serving controls; runtime proxy/header posture should be validated.
- **BE-F-07 (Low, Pass F, Possible):** Venue-create input validation does not explicitly reject NaN/Infinity/out-of-range coordinates at API boundary.
- **BE-G-07 (Medium, Pass G, Possible):** Multiple discovery endpoints (`/api/beers/:name`, `/api/map/user/:id`, weekly highlights) return unpaginated historical arrays that may become payload/latency outliers as usage grows.
- **BE-H-08 (Medium, Pass H, Possible):** Scheduler scripts lack an explicit distributed lock primitive; overlapping runners in clustered/failover cron environments may race and amplify duplicate side effects.