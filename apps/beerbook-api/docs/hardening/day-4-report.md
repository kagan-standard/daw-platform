# Day 4 Report — Tabs Economy Integrity (Part 2): Competing Writers Race

**Date:** 2026-04-14 (session spanned 2026-04-09 → 2026-04-14)
**Branch:** hardening/main
**Commit:** `5747ead`
**Tag:** `hardening-day-4-complete`

---

## Objective

Eliminate the Monday 00:00 race between `weekly-tabs-eval.js` and concurrent
rating submissions on `current_tier`, `current_streak_weeks`, and
`weeks_inactive`. Per the plan's reframing from v1: `ratings_this_week` is
migrating from authoritative to cache, and its coordinated removal is
Appendix D post-launch work — Day 4 only addresses the tier/streak/inactive
race.

Corresponds to audit finding **Section 2.3 (competing writers on user_tabs_profile)**.

---

## Critical invariant preserved

`weekly-tabs-eval.js` used asymmetric signals for its tier computation:

- **Promotion** reads cached `current_streak_weeks` (maintained by
  `refresh_rating_award_profile_cache`, tier-aware since migration
  `20260426140000`)
- **Demotion** reads the raw prior-week ratings count from a live `COUNT(*)`
  against the `ratings` table

The PL/pgSQL port preserves this asymmetry exactly. Simplifying it (having
both sides read from the same source) would silently change tier behavior
weeks later when users hit promotion or demotion boundaries.

---

## Tasks

### T4.0 — Log investigation (pre-work, not in original plan)

**Status: DONE**

Investigated the 0-byte `/var/log/weekly-tabs-eval.log` flagged in Day 0
inventory. Authoritative signal: `job_runs` has zero rows for
`job_name = 'weekly_tabs_eval'`. **The original script had never successfully
completed a run**, ever.

Most likely cause: the `beerbook-api` container was not running at Monday
00:00, causing `docker exec` to fail silently with no output captured. Not a
JS logic bug — an infrastructure issue. Filed as backlog #11 ("cron depends
on container uptime").

Downstream implication: the entire demotion path of the tabs economy has been
dead code since the field was introduced. The pre-existing `weeks_inactive`
semantic conflict (see V4.2 below) went undetected for the same reason — there
was no committed eval run to expose it.

### T4.1 — Before Snapshot

**Status: DONE** (micro-gate 1 cleared)

Full read of `weekly-tabs-eval.js`, producing an 11-section spec covering:
profile selection, window computation (UTC, prev Monday → prev Sunday
23:59:59.999), tier requirements source (DB table `tier_requirements`),
`currentTier`/`currentStreak`/`weeksInactive` sources (all cached from
profile), prior-week count query, promotion branch (cached streak ≥
required_consecutive_weeks), demotion branch (raw count < maintenance_min, 4
consecutive weeks → demote one tier), final PATCH body (9 fields written
unconditionally), and side effects (`claim_job_run` / `complete_job_run` /
`fail_job_run`, `insert_scheduler_notification` for promotion/demotion).

Three open questions surfaced during the snapshot, all resolved as "preserve
as latent bug":

- **#8**: `tier_promoted_at` updates on *any* tier change, including
  demotion. Field name implies promotion-only. Preserve.
- **#9**: Demote-then-promote in the same eval cycle is theoretically
  reachable because promotion runs after demotion and uses the post-demotion
  tier. Preserve.
- **#10**: `current_streak_weeks` is not reset on demotion; it carries
  forward. Preserve.

### T4.2 — Migration SQL

**Status: DONE** (micro-gate 2 cleared)

`supabase/migrations/20260409165254_hardening_eval_user_weekly_tabs.sql`.

Creates `eval_user_weekly_tabs(p_user_id text, p_window_start timestamptz,
p_window_end timestamptz)` returning an observability `TABLE` with 12
columns (prev/new for tier, streak, weeks_inactive, tier_promoted_at, plus
prior_week_ratings_count, promoted, demoted).

Structure:

1. `SELECT ... FOR UPDATE` on the profile row as the first action (the race
   fix).
2. Snapshot "before" values into locals for the return row.
3. `SELECT COUNT(*)` of prior-week ratings from the `ratings` table
   (demotion signal, raw).
4. Look up `maintenance_ratings_per_week` and `display_order` for current
   tier from `tier_requirements`.
5. Demotion branch: increment `weeks_inactive` if below maintenance; if ≥ 4,
   walk `display_order - 1` to find prev tier, demote if not already lowest,
   reset `weeks_inactive` inside the threshold block (matches JS).
6. Promotion branch: re-fetch `display_order` (may have changed after
   demotion), walk `display_order + 1` for next tier, promote if cached
   streak ≥ required_consecutive_weeks.
7. `UPDATE` the profile with all 9 fields from the Before Snapshot, including
   `ratings_this_week = 0` / `reviews_this_week = 0` /
   `contributions_this_week = 0` as preserved cache resets (Appendix D
   concern).
8. `RETURN QUERY` the observability row.

**Type corrections during micro-gate 2 review:** Initial draft used
`::text` casts on `tier_requirements.tier` comparisons. Verification queries
revealed `tier_requirements.tier` is the `user_tier` enum (not text). Edits:
- `v_prev_tier_val` / `v_next_tier` changed from `text` to `user_tier`
- Removed `::text` casts on comparison sides
- Removed `::user_tier` casts on assignments

Verified alignment between `user_tier` enum labels and
`tier_requirements.tier` values: perfect 1:1 match on all 6 tiers
(`taster`, `regular`, `local`, `patron`, `house_account`, `cellar_reserve`)
in the same order by `enumsortorder` and `display_order`.

Verified `user_tabs_profile.user_id` is `text` (matching the
`refresh_rating_award_profile_cache` convention) and that `week_start`,
`tier_promoted_at`, `updated_at` are all `timestamptz`.

### T4.3 — Apply the migration

**Status: DONE**

`BEGIN / CREATE FUNCTION / COMMIT`, no errors. `\df eval_user_weekly_tabs`
confirmed the function live with the correct signature and 12-column
return table.

### T4.4 — Port `weekly-tabs-eval.js`

**Status: DONE**

Replaced the per-user block (original lines ~115–188) with a single RPC
call. Preserved:

- Outer pagination loop via `fetchAllProfiles`
- `claim_job_run` / `complete_job_run` / `fail_job_run` wrapper
- `previousWeekRange()` computation of `from` / `to` / `weekStart`
- `insert_scheduler_notification` for promotion and demotion, now gated
  on the RPC's returned `promoted` / `demoted` booleans
- Per-user try/catch so one failure doesn't crash the eval
- `usersProcessed` counter

**Notification wiring fix:** The first port iteration dropped the
`tier_requirements.display_name` lookup used in the promotion message,
substituting `row.new_tier.replace('_', ' ')` — which would have regressed
"Congratulations! You reached House Account." to "...house account." on the
first real Monday run.

Restored by re-adding the `tier_requirements` fetch + `reqByTier` Map once
per cron run (before the pagination loop) and using
`reqByTier.get(row.new_tier)?.display_name || row.new_tier.replace('_', ' ')`
in the promotion branch (safe fallback if the lookup misses).

The demotion branch continues to use `row.new_tier.replace('_', ' ')`
without a display_name lookup — matching the original JS behavior exactly.
This is a latent inconsistency between the two branches (promotion uses
title-case, demotion uses lowercase-with-underscore), filed as backlog #12
for post-launch cleanup. No user has actually seen either message because
the script had never successfully run until this session.

### T4.5 — Dry-run against test user

**Status: DONE**

Window: `from = 2026-03-30T00:00:00Z`, `to = 2026-04-05T23:59:59.999Z`.

Pre-state for test user `061d5154`: taster, streak=0, weeks_inactive=0,
tier_promoted_at=2026-02-21. Independent prior-week ratings count: 1.

RPC dry-run wrapped in `BEGIN; ... ROLLBACK;`:

| Field | Returned |
|---|---|
| prior_week_ratings_count | 1 ✅ (matches independent count) |
| prev_tier | taster ✅ |
| new_tier | taster (no change) |
| prev_streak | 0 ✅ |
| new_streak | 0 (no promotion: streak 0 < 3 required for regular) |
| prev_weeks_inactive | 0 ✅ |
| new_weeks_inactive | 1 (below maintenance 2, no demotion yet) |
| promoted | false ✅ |
| demoted | false ✅ |

Post-ROLLBACK re-query confirmed the test user's profile was byte-identical
to the pre-state — transaction rollback worked correctly in the
`docker exec psql -c` single-command context.

Manual JS cross-check by hand: given `prior_count=1, maintenance_min=2,
prev_streak=0, required_consecutive_weeks=3`, the JS would produce exactly
`new_tier=taster, new_streak=0, new_weeks_inactive=1, promoted=false,
demoted=false`. Field-by-field match with the RPC result.

**Verification scope limit:** The dry-run exercised only the "below
maintenance, no demotion yet" path. The promotion branch, the demotion
trigger (weeks_inactive reaching 4), the demote-then-promote edge case, and
the `prior_count >= maintenance_min → reset to 0` branch were NOT exercised
by the dry-run. They were validated by SQL review at micro-gate 2, not by
empirical execution.

### V4.2 — Concurrent-writer investigation and refresh fix (not in original plan)

**Status: DONE** — this is the most significant finding of Day 4.

**Original V4.2 intent:** Two-terminal race test (RPC in terminal A, rating
POST in terminal B, verify no lost writes).

**Revised approach:** Sequential validation instead of racing. Rationale:
FOR UPDATE semantics were validated at SQL review; the real new information
V4.2 could provide was "does the RPC run cleanly under production-shaped
conditions and interact correctly with a concurrent rating flow." Racing
wasn't needed and carried profile-contamination risk.

**The finding:** The first sequential V4.2 run (RPC committed → rating
fired) showed `weeks_inactive` went 1 → 0 after the rating. Something in
the rating flow was clobbering the eval's write.

**Investigation:** Read the full SQL of `refresh_rating_award_profile_cache`
(the RPC called by the rating flow after `award_rating_tabs_with_cap`). The
smoking gun: its `UPDATE` CTE contained `weeks_inactive = 0` as a hardcoded
literal, not a computed value.

```sql
UPDATE public.user_tabs_profile utp
SET ...
    weeks_inactive = 0,          -- unconditional hardcoded reset
    ...
```

Every rating fired this function and unconditionally reset `weeks_inactive`
to 0, rendering the eval's demotion counter dead code.

**This was a pre-existing bug, not a Day 4 regression.** The same
collision was present in the JS eval vs. the refresh function going back to
the original creation of both functions. It was invisible because:

1. The eval script had never successfully run in production (backlog #11).
2. `weeks_inactive` was therefore 0 for every user at all times.
3. No other function reads `weeks_inactive` — reader audit via
   `pg_proc` grep confirmed exactly one reader (`eval_user_weekly_tabs`
   itself) and no triggers on `user_tabs_profile` touch the field.

**The fix:** Single-line surgical removal of `weeks_inactive = 0,` from
`refresh_rating_award_profile_cache`'s UPDATE CTE.

Migration: `supabase/migrations/20260409202452_hardening_refresh_stop_writing_weeks_inactive.sql`

Verified via diff against live `pg_get_functiondef` output: only the one
substantive line removed, no other changes.

**Re-verification:** After applying the fix, ran the eval RPC (committed,
not rolled back) to set `weeks_inactive = 1`, then had the human fire a
rating. The subsequent snapshot showed `weeks_inactive = 2` — unchanged by
the rating and in fact incremented to 2 because the weekly cron had run
during the 5-day gap between session halves on a real Monday and done a
correct increment pass.

This means: between the two halves of the session, the Day 4 RPC had its
**first successful committed production run**. The cron fired on Monday
2026-04-13 00:00 UTC, evaluated the test user against the prior-week window
2026-04-06 → 2026-04-12, observed prior_count < maintenance_min, and
incremented weeks_inactive from 1 to 2. week_start advanced from 2026-04-06
to 2026-04-13. The RPC worked correctly end-to-end under real cron
conditions.

**After the refresh fix, a subsequent rating did NOT stomp the
weeks_inactive value.** The fix holds.

### V4.1, V4.3, V4.4 — formal verifications

**Status: ALL PASS**

- **V4.1:** `\df eval_user_weekly_tabs` returns the function with correct
  signature.
- **V4.3:** `node -c scripts/weekly-tabs-eval.js` exits clean.
- **V4.4:** `curl https://api.beerbook.drinksafterwork.net/api/health` →
  `{"status":"ok","service":"beerbook-api"}`. No rebuild was necessary
  because only a cron script was edited, not any server route.

---

## What's in the commit

`5747ead` — 3 files changed, 431 insertions, 68 deletions

- `apps/beerbook-api/supabase/migrations/20260409165254_hardening_eval_user_weekly_tabs.sql` (new)
- `apps/beerbook-api/supabase/migrations/20260409202452_hardening_refresh_stop_writing_weeks_inactive.sql` (new)
- `apps/beerbook-api/scripts/weekly-tabs-eval.js` (modified)

Targeted `git add`s used to avoid picking up the 8 pre-existing untracked
entries from the Day 0 dirty state.

---

## Risk Assessment

**Rollback:**

```bash
cd /opt/daw-platform/apps/beerbook-api
git reset --hard hardening-day-3-complete

# Drop new eval function
docker exec -e PGPASSWORD=$(grep SUPABASE_DB_PASSWORD /opt/daw-platform/infra/compose/.env | cut -d= -f2) \
  -i supabase-db psql -U postgres -d postgres \
  -c "DROP FUNCTION IF EXISTS eval_user_weekly_tabs(text, timestamptz, timestamptz);"

# Revert refresh function to the pre-fix version:
# re-apply the definition from the V4.2 investigation capture (the version
# containing 'weeks_inactive = 0' in the UPDATE CTE). Do NOT leave the
# post-fix version live with the JS script reverted — the eval would be
# broken the other way.
```

**Blast radius:**

- Eval RPC: brand new function, no prior readers, adds a lock on
  `user_tabs_profile` that holds only for the duration of a single per-user
  transaction (microseconds in practice).
- Refresh fix: removes one write from a function called on every rating.
  Reader audit confirmed no downstream consumers of `weeks_inactive`
  besides the eval itself.
- Script port: changes how one cron script calls the DB. Cron continues to
  run at `0 0 * * 1` with no schedule change.

**Confidence: High** for the race fix and the refresh fix. **Medium** for
the full breadth of the eval's transition logic — the dry-run and the
unexpected Monday cron run between session halves together exercised the
"below maintenance, below demotion threshold, no promotion" path for real.
The promotion, actual demotion, demote-then-promote, and streak reset paths
were validated by SQL review only.

---

## Notable observations

**The eval RPC's first successful run is now on record.** During the
session gap between the V4.2 first run and the refresh fix, the weekly
cron fired on Monday 2026-04-13 00:00 and successfully evaluated the test
user against the prior-week window. This is the first time
`weekly-tabs-eval` has produced a `job_runs` row or a committed profile
update in the system's history. The result was correct
(`weeks_inactive`: 1 → 2, `week_start`: advanced 7 days, no tier change).

**The demotion path of the tabs economy was dead code until this commit.**
With `weeks_inactive` hardcoded to 0 on every rating, the eval's demotion
branch could never accumulate. After this commit, demotion is reachable
for the first time. The seeder kickoff cohort (16 users) is not expected
to hit demotion thresholds in the first few weeks — they're onboarding and
rating heavily — but the path is now live and will apply to inactive users
in the medium term.

**H2H rewards are firing.** The test user received a `h2h_award` of +10
tabs during the V4.2 session. Unrelated to Day 4 but relevant to backlog
#3 (H2H matcher tuning) — it's empirical evidence that H2H prompts are
delivering.

---

## Backlog items surfaced or formalized during Day 4

Pre-existing (from before Day 4):

1. Rating-delete soft-delete pattern — closes phantom tabs + orphaned ELO
2. H2H cascade FK → `SET NULL` (standalone 15-min fix)
3. H2H matcher tuning (product question)
4. YG floor clamp UX documentation
5. `processSingleAward` vs `award_tabs` admin_grant path consolidation
6. Dormant `supabase/functions/process-event/engine.ts` — delete or deploy
7. Seeder/tier multiplier spot-check post-kickoff

New during Day 4:

8. `tier_promoted_at` updates on demotion too — field name implies
   promotion-only. Either rename the field or gate the write to promotions
   only.
9. Demotion-then-promotion in same eval cycle is theoretically reachable.
   Audit whether it's reachable with normal user flows; if yes, decide on
   a "no promotion in same cycle as demotion" guard.
10. `current_streak_weeks` carries forward across demotion. Product
    decision: should demotion reset streak, preserve it (current), or
    store a separate "progress toward re-promotion" counter?
11. Cron `docker exec` depends on `beerbook-api` container being up at
    00:00 Monday. If the container is down, cron fails silently with no
    `job_runs` row and a 0-byte log. Consider: (a) run script on host
    outside the container, (b) external monitor for missing `job_runs`
    rows, (c) accept as known limitation.
12. Demotion notification uses lowercase enum value (`"house account"`)
    instead of the properly-cased `display_name` ("House Account") from
    `tier_requirements`. Asymmetry with the promotion branch, which uses
    `display_name`. No user has ever seen the lowercase form because the
    eval had never successfully run.
13. `weekly-tabs-eval` (both JS original and PL/pgSQL port) is not
    idempotent on re-run within the same week. Running the eval twice on
    the same Monday, or re-running mid-week for debugging, would
    double-increment `weeks_inactive`. Not a race bug — a re-run safety
    concern. The function could guard with a check on `week_start` to
    make re-runs within the same week a no-op.

---

## Day 5 posture

Day 5 is seeder kickoff. Zero code changes. Monitoring only. If a bug is
found, document it, do not fix it. Day 6 is for triage.

Key things to watch on Monday 2026-04-20 00:00 (the first post-fix real
Monday):

- `job_runs` row appears for `weekly_tabs_eval` with non-null
  `completed_at`
- `/var/log/weekly-tabs-eval.log` has non-zero size and contains per-user
  transition log lines
- Any user who had `weeks_inactive > 0` at the start of the week gets
  either an increment (still below maintenance) or a reset to 0 (met
  maintenance), consistent with their prior-week rating activity
- No `tier_demotion` notifications fire in the first real run (no user
  should have accumulated 4 weeks of inactivity this soon, since the
  counter was just unlocked)
- No unexpected `tier_promotion` notifications (streaks were maintained
  correctly pre-fix, so any promotion on Monday reflects legitimate
  accumulated progress)
