# Phase 4.1 — Replace Bounded In-Memory Aggregation

**Status:** Implemented (2026-03-07)  
**Issues addressed:** BE-C-02, BE-G-01, BE-G-02, BE-G-03, BE-G-04, BE-G-05, BE-D-07 (Possible), BE-G-07 (Possible), INT-11  
**Root cause:** ARCH-04 / BE-C-02 — Bounded in-memory scans reported as complete; silent truncation and scale ceiling

---

## Summary

Replaced in-memory aggregation and unbounded fetches with DB-side aggregation (new RPCs) and bounded reads. Responses now include standardized `truncated` and `pagination` (or `pagination`-like) metadata so clients know when results are capped. Existing response shapes are preserved; new fields are additive.

---

## Files Changed

| File | Change |
|------|--------|
| `apps/beerbook-api/supabase/migrations/20260309000000_phase4_aggregation_rpcs.sql` | **New.** RPCs: `leaderboard_aggregate`, `crew_beer_stats`, `user_stats_aggregate`, `global_stats_counts`. |
| `apps/beerbook-api/routes/leaderboard.js` | Uses `leaderboard_aggregate` RPC instead of fetching up to 5000 ratings and aggregating in JS. Response adds `truncated`, `pagination: { limit }`. Profile enrichment for top_reviewers unchanged. |
| `apps/beerbook-api/routes/activity.js` | `GET /users/:id/stats` uses `user_stats_aggregate` RPC and keeps follower/following/crew from `follow_counts` and `crew_members`. `GET /activity` adds `truncated` when merged feed length ≥ 4000. |
| `apps/beerbook-api/server.js` | `handleBreweriesMap`: uses `Prefer: count=exact`, returns `pagination: { limit, offset: 0, total }` and `truncated`. `GET /api/stats` with `crew_id`: uses `crew_beer_stats` RPC; without crew: uses `global_stats_counts` RPC for totalReviews and totalUsers (fallback to previous behavior if RPC fails). |
| `apps/beerbook-api/routes/map.js` | `GET /api/map`: bounded fetch (limit 2000), optional `bounds` query; returns `pagination`, `truncated`. `GET /api/map/venues`: bounded ratings fetch (5000); returns `truncated`, `pagination`. |
| `apps/beerbook-api/routes/deals.js` | Response capped at 100 deals; returns `truncated`, `pagination: { limit, offset: 0, total }`. |

---

## Validation Steps Completed

### Tests run

**Automated tests were not run.** No test suite was executed for Phase 4.1.

### Exact validation commands

None were run. Suggested manual checks after applying the migration and starting the API:

```bash
# Apply migration (Supabase CLI or SQL editor)
# supabase db push   # or run 20260309000000_phase4_aggregation_rpcs.sql

cd c:\Users\kenyo\OneDrive\Desktop\daw-platform\daw-platform\apps\beerbook-api
node server.js
# In another terminal:

# Leaderboard (additive truncated, pagination)
curl -s "http://localhost:3000/api/leaderboard?period=alltime" | jq '.truncated, .pagination'

# User stats (same shape; DB aggregate)
curl -s "http://localhost:3000/api/users/<user_id>/stats" | jq 'keys'

# Activity feed (additive truncated)
curl -s "http://localhost:3000/api/activity" | jq '.truncated'

# Breweries map (additive pagination, truncated)
curl -s "http://localhost:3000/api/breweries/map" | jq '.pagination, .truncated'

# Crew stats (RPC; same shape + truncated)
curl -s -H "Authorization: Bearer <jwt>" "http://localhost:3000/api/stats?crew_id=<crew_id>&limit=10" | jq '.summary, .truncated'

# Global stats (totalUsers from DB)
curl -s "http://localhost:3000/api/stats?limit=5" | jq '.summary'

# Map (bounds + truncated)
curl -s "http://localhost:3000/api/map?bounds=-90,-180,90,180" | jq '.truncated, .pagination'

# Deals (truncated, pagination)
curl -s "http://localhost:3000/api/deals?lat=0&lng=0" | jq '.truncated, .pagination'
```

---

## Contract / Doc Implications

- **HTTP/API:** Existing request/response contracts are preserved. New fields are **additive**: `truncated` (boolean) and `pagination` (or equivalent) on leaderboard, activity, breweries map, map, map/venues, deals, and crew stats. Clients that ignore these fields continue to work.
- **New surface:** Four PostgREST RPCs: `leaderboard_aggregate`, `crew_beer_stats`, `user_stats_aggregate`, `global_stats_counts`. Document in API/DB docs where internal RPCs are listed.
- **INT-11:** Addressed by making truncation explicit via `truncated` and pagination metadata instead of silent caps.

---

## Known Risks / Follow-up

- **Leaderboard RPC:** Per-category queries each scan ratings (with LIMIT). For very large datasets, a single materialized CTE or temp table shared across the four aggregates could reduce work; current design prioritizes correctness and explicit truncation.
- **Activity feed:** Still merges multiple bounded fetches (ratings, cheers, follows, crew_joins) in memory; only the cap and `truncated` are now explicit. A future DB-side “merged activity feed” RPC would remove in-memory merge and scale better.
- **Map / map/venues:** Bounded by fixed limits (2000 / 5000). For heavier usage, consider cursor-based or view-based aggregation and document limits in API docs.
- **user_enhanced_stats:** Not changed. `GET /api/users/:id/stats` now uses `user_stats_aggregate` (same response shape as before). `GET /api/stats/me` and `GET /api/stats/:userId` still use `user_enhanced_stats` (different shape: flavors, monthly_counts, etc.).
- **Dependency:** Phase 2.7 (crew atomics) was already complete; no prerequisite was missing.
