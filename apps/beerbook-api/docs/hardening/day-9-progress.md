# Day 9 Progress — 2026-04-15

**Branch:** hardening/main
**Last commit:** ba2c833 `[backlog] A1: flip h2h_prompts FKs to ratings.id to SET NULL`

---

## Session summary

Day 9 began backlog work after the pre-launch hardening plan's
code work completed on Day 8 (tag `hardening-day-8-complete`,
commit `13643c2`). Three backlog items were triaged.

## Backlog items completed

### A1 — H2H cascade FK flip to SET NULL (DONE)

**Commit:** `ba2c833`
**Migration:** `20260415031243_hardening_h2h_cascade_set_null.sql`

Flipped `head_to_head_prompts.challenger_rating_id` and
`current_rating_id` FKs from ON DELETE CASCADE to ON DELETE SET
NULL. Prerequisite: dropped NOT NULL on both columns (PG rejects
SET NULL on NOT NULL columns).

**Recon findings:**
- 4 CASCADE FKs target `ratings.id`: 2 on `head_to_head_prompts`,
  1 on `rating_comments`, 1 on `reactions`. Only the 2 H2H FKs
  were in scope.
- `beer_elo_events.result_id` has NO FK constraint — the ELO
  audit trail was already orphan-safe. The Appendix D concern
  about cascade-destroying ELO data was unfounded for this path.
- `head_to_head_results` has zero FK constraints — fully
  orphan-safe.
- The H2H complete handler (`server.js:2169–2282`) does NOT
  delete any rating. The recon report's A.6 had misattributed
  `server.js:2149` (guest-ratings/claim) to the H2H handler.
  Corrected in `a1_ordering_check.md` and `a1_addendum.md`.
- rating_comments and reactions intentionally left as CASCADE.

**Ownership note:** `head_to_head_prompts` is owned by
`supabase_admin`, not `postgres`. Migration had to be applied as
`supabase_admin`. Prior migrations on `postgres`-owned tables
didn't hit this. Future migrations touching `supabase_admin`-owned
tables need the same treatment.

**Verification:** All 6 checks passed (FK state, nullability,
out-of-scope unchanged, container health, drift invariants 0,
existing H2H prompt row intact).

**Recon files:** `/tmp/a1_recon_report.md`,
`/tmp/a1_ordering_check.md`, `/tmp/a1_addendum.md`.
Committed recon: `a1-recon-h2h-cascade-fk.md` (commit `c77aa29`).

### A2 — weekly-tabs-eval idempotency guard (ALREADY DONE)

**No commit needed.**

Recon discovered the idempotency guard already exists at
`weekly-tabs-eval.js:103–110`. The `claim_job_run` RPC:
1. Takes `pg_advisory_xact_lock` on job name
2. Returns `false` if a `completed` row exists for `(job_name, week_start)`
3. Upserts a `running` row and returns `true` otherwise
4. `fail_job_run` resets status to allow retry

This was implemented during the Day 4 rewrite (`5747ead`). The
script header documents it: "Idempotent: double-run in the same
week is a no-op (job_runs table)." The backlog item was filed
from the Day 4 report describing the pre-fix state, but the fix
shipped in the same commit.

**Recon file:** `/tmp/a2_recon.md`

### A3 — Backfill null-ELO beers (ALREADY RESOLVED)

**No commit needed.**

Recon found 0 rows with NULL `global_elo` in `beer_elo_ratings`.
The column is `NOT NULL DEFAULT 0` — it literally cannot hold
NULLs. Either the issue was fixed when the column was made NOT
NULL, or the Appendix D item was inaccurate. No migration needed.

**Recon file:** `/tmp/a3_recon.md`

---

## Commits this session

| Hash | Message |
|---|---|
| `588bab5` | [day-8] add Day 8 hardening report — Human Gate #2 launch-readiness filing |
| `c77aa29` | [day-9] A1 recon report — H2H cascade FK audit (read-only) |
| `ba2c833` | [backlog] A1: flip h2h_prompts FKs to ratings.id to SET NULL |

## Drift invariants at session end

- lifetime_tabs_earned drift: **0**
- profiles.tabs_balance drift: **0**

## Container health at session end

- `beerbook-api`: Up, healthy
- Health endpoint: `{"status":"ok","service":"beerbook-api"}`

---

## Remaining backlog (not yet triaged in this session)

These items are from the Day 4 report's backlog section and
Appendix D. They have NOT been re-verified against the current
codebase — recon is needed before acting on any of them. Two
items (A2, A3) turned out to already be resolved; the same may
be true for others.

- Rating-delete soft-delete pattern (closes phantom tabs +
  orphaned ELO). Product decision, not a bug fix.
- `tier_promoted_at` updates on demotion — field name implies
  promotion-only. Either rename or gate the write.
- Demote-then-promote in same eval cycle — audit reachability.
- `current_streak_weeks` carries forward across demotion —
  product decision on whether demotion should reset streak.
- Cron `docker exec` depends on container uptime at 00:00 Monday.
- Demotion notification uses lowercase enum value instead of
  `display_name`.
- `processSingleAward` vs `award_tabs` admin_grant path
  consolidation.
- Dormant `supabase/functions/process-event/engine.ts` — delete
  or deploy.
- RLS on 33 tables (Appendix D, medium).
- File uploads to S3/CDN (Appendix D, medium).
- Coordinated `ratings_this_week` cache removal (Appendix D).
- Full replacement of 189 `console.log` calls with pino
  (Appendix D, medium).
- Activity feed refactor (Appendix D, high — deferred).
- Queue achievement evaluation (Appendix D, high — deferred).
- elo-snapshot idempotency (Appendix D, high audit / low real).
