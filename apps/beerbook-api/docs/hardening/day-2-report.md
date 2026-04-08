# Day 2 Report — Quick Wins + Human Gate #1

**Date:** 2026-04-08
**Branch:** hardening/main
**Tag:** hardening-day-2-complete (pending gate approval)

---

## Tasks

### T2.1 — streak-risk-check.js cron entry

**Status: DONE (schedule pending confirmation)**

Entry added to crontab:
```
0 18 * * 3 docker exec beerbook-api node scripts/streak-risk-check.js >> /var/log/beerbook/streak-risk-check.log 2>&1
```

Backup saved: `/tmp/crontab.bak`

Schedule uses `docker exec` pattern matching all other cron entries. Log directory `/var/log/beerbook/` created.

Full cron schedule documented in `docs/CRON_SCHEDULE.md`.

### T2.2 — Auth on GET /api/tabs/profile/:userId

**Status: DONE**

- Added `authMiddleware` to route
- Added owner-or-admin check: `requesterId !== userId && !isAdmin(requesterId)` → 403
- Passed `isAdmin` to tabs routes via `routeHelpers`

### T2.3 — Remove dead tab_balance writes

**Status: DEFERRED — active reader found**

`tab_balance` usage classified:

| Location | Type | Source |
|---|---|---|
| `lib/tabs.js:152` (awardTabsForRating) | WRITE | `user_tabs_profile.tab_balance` |
| `lib/tabs.js:191` (awardSingleSourceTabs) | WRITE | `user_tabs_profile.tab_balance` |
| `routes/tabs.js:164` (formatTabProfile response) | READ | `profiles.tabs_balance` (the real one) — SAFE |
| `routes/tabs.js:1332` (admin stats /tabs/stats) | **READ** | **`user_tabs_profile.tab_balance`** — BLOCKS REMOVAL |

Per reader-before-writer principle: `routes/tabs.js:1332` reads `user_tabs_profile.tab_balance` to compute `tabs_in_circulation` in the admin stats endpoint. Cannot remove writes until this reader is migrated (e.g., to sum from `profiles.tabs_balance` or `tabs_ledger` instead).

**Decision needed:** Migrate the reader first, then remove writes? Or accept the current state and defer to Day 3?

### T2.4 — LIMIT clauses on worst unbounded queries

**Status: DONE**

Capped per audit findings:

| File | Route | Cap | Was |
|---|---|---|---|
| `routes/beers.js:85` | `GET /api/beers/:name` (ratings) | 500 | unbounded |
| `routes/crews.js:297` | `GET /api/crews/:id` (member ratings) | 2000 | unbounded |
| `routes/map.js:62` | `GET /api/map/venues` (venues) | 1000 | unbounded |
| `routes/deals.js:26` | `GET /api/deals` (venue_menus) | 500 | unbounded |
| `routes/deals.js:28` | `GET /api/deals` (happy_hours) | 500 | unbounded |

All marked with `// TODO(scale): replace with paginated/filtered query post-launch`.

### T2.5 — Cron schedule documentation

**Status: DONE** — `docs/CRON_SCHEDULE.md` documents all 13 cron entries.

---

## Verification Results

| ID | Check | Result |
|---|---|---|
| V2.1 | `crontab -l` shows streak-risk-check | **PASS** |
| V2.2 | Tabs profile 401 without auth | **PASS** (returned 401) |
| V2.2 | Tabs profile 200 for matching user | **DEFERRED** — no token available |
| V2.2 | Tabs profile 403 for wrong user | **DEFERRED** — no token; also test user IS admin (see below) |
| V2.3 | No remaining tab_balance writes | **DEFERRED** — T2.3 deferred due to active reader |
| V2.4 | Capped routes still return data | **DEFERRED** — requires auth token for some routes |
| V2.5 | Container rebuild + healthy | **PASS** |
| V2.5 | Health endpoint | **PASS** (`{"status":"ok","service":"beerbook-api"}`) |

---

## Human Gate #1 Checklist

### 1. Cron schedule confirmation

**Proposed:** `0 18 * * 3` = Wednesday 6:00 PM UTC

Rationale: mid-week gives users ~4.5 days to submit a rating before Monday 00:00 UTC eval. The audit flagged the script was unscheduled but did not prescribe a time.

**Please confirm or adjust this schedule.**

### 2. Admin status of test user

**`061d5154-c846-49e5-9758-d279bb3ab8bd` IS the admin** — it matches `ADMIN_USER_ID` in `.env`.

This means:
- V2.2's 403 test cannot be verified with this account (admin bypasses ownership check)
- Need a non-admin token to verify the 403 path, OR defer and accept that the code path is correct by inspection

### 3. Unbounded queries outside the audit

The explore found additional unbounded queries NOT in the audit's worst-offender list:

| File | Route | Query |
|---|---|---|
| `routes/map.js:140` | `GET /api/map/user/:id` | All geotagged ratings for a user (no limit) |
| `routes/activity.js:461` | Reactions fetch | All cheers reactions for a rating (no limit) |
| `routes/admin.js:516,578,596` | Challenge queue | All challenge_queue rows (admin-only) |
| `routes/admin.js:818` | Achievement categories | All categories (admin-only) |
| `routes/admin.js:969` | Cosmetics | All cosmetics (admin-only) |
| `routes/tabs.js:244-245` | Achievements/categories | All achievements + categories |
| `routes/leaderboard.js:46` | Leaderboard profiles | Profiles for top reviewers (bounded by leaderboard size) |

Admin-only routes are lower risk. The user-facing ones (`map/user/:id`, `activity` reactions, `tabs` achievements) could grow but are unlikely to OOM at current scale. **Surfacing for your awareness — did not cap these without confirmation.**

### 4. Day 1 T1.3 handler list (retroactive review)

13 handlers wrapped with `asyncHandler()`:

```
server.js:1317  GET    /api/ratings
server.js:1374  GET    /api/ratings/user/:id
server.js:1463  POST   /api/ratings
server.js:1887  DELETE /api/ratings/:id
server.js:1908  PATCH  /api/ratings/:id
server.js:2053  POST   /api/guest-ratings/claim
server.js:2113  POST   /api/head-to-head/:id/complete
server.js:2183  POST   /api/head-to-head/:id/skip
server.js:2211  GET    /api/ratings/:id/comments
server.js:2225  POST   /api/ratings/:id/comments
server.js:2262  DELETE /api/ratings/:id/comments/:commentId
server.js:2326  PATCH  /api/profile
server.js:2476  GET    /api/stats
```

Handlers NOT wrapped (have their own try/catch or are sync):
- `GET /api/profile`, `GET /api/profile/me` — uses named `handleProfileRequest` with try/catch
- `GET /api/stats/:userId` — has try/catch
- `GET /api/config` — has try/catch
- All route-file handlers (tabs, activity, beers, etc.) — have try/catch in their own files

### 5. Remaining tab_balance reads

**Yes — one active reader exists:** `routes/tabs.js:1332` reads `user_tabs_profile.tab_balance` in the admin `/tabs/stats` endpoint to compute `tabs_in_circulation`. This blocks write removal per reader-before-writer principle.

### 6. Discovery follow-ups

No outstanding discovery items flagged by the human from Day 0/Day 1 that haven't been addressed.

---

## Commits

```
be9dadf [day-2] auth-gate GET /api/tabs/profile/:userId
0b8a9ba [day-2] cap worst unbounded queries (audit finding #2 partial)
896e93c [day-2] add streak-risk-check cron + document full cron schedule
```

---

**STOPPED at Human Gate #1. Awaiting approval to proceed to Day 3.**
