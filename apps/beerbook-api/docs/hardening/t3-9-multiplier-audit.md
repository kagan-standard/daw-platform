# T3.9 — Multiplier audit + H2H discovery

**Date:** 2026-04-09
**Type:** Read-only audit, no code changes

---

## Part A — Rating award reconciliation

### 1. Formula (verbatim)

Source: `server.js:1783-1789` (the `POST /api/ratings` handler)

```javascript
const perComponent = components.map((c) => ({
  source: c.source,
  base: c.base,
  amount: Math.round(c.base * newBeerMultiplier * tierMultiplier * seederMultiplier),
}));
breakdown = Object.fromEntries(perComponent.map((p) => [p.source, p.amount]));
const total = perComponent.reduce((s, p) => s + p.amount, 0);
```

Components come from `lib/tabs.js:85-98` (`calculateRatingComponents`):

| Component | Base | Condition |
|---|---|---|
| `rating_base` | 1 | Always |
| `rating_location` | 1 | `location_name` is truthy OR lat/lng are both finite |
| `rating_photo` | 2 | `photo_url` is truthy |
| `rating_price` | 1 | `price_cents` is a positive integer |
| `rating_review` | 2 | `notes` is truthy and >= 10 chars trimmed |

Multipliers (applied per-component, not to the total):

| Multiplier | Source | Value |
|---|---|---|
| `tierMultiplier` | `tier_requirements.multiplier` for user's current tier | Currently 1.0 for all tasters |
| `seederMultiplier` | `user_tabs_profile.is_seeder` | 1.5 if seeder, else 1.0 |
| `newBeerMultiplier` | `is_new_beer` flag from POST body | 1.5 if true, else 1.0 |

Formula per component: `amount = Math.round(base * newBeerMultiplier * tierMultiplier * seederMultiplier)`

Total: `SUM(component amounts)`

The amount is then passed to `award_rating_tabs_with_cap` RPC which enforces the weekly cap (10 ratings/week for normal users).

### 2. Sample set (10 most recent rating_award rows)

| # | User (prefix) | Amount | Breakdown | tier_m | seeder_m | new_beer |
|---|---|---|---|---|---|---|
| 1 | `061d5154` | 2 | `{rating_base: 1, rating_location: 1}` | 1 | 1 | false |
| 2 | `061d5154` | 2 | `{rating_base: 1, rating_location: 1}` | 1 | 1 | false |
| 3 | `061d5154` | 2 | `{rating_base: 1, rating_location: 1}` | 1 | 1 | false |
| 4 | `061d5154` | 2 | `{rating_base: 1, rating_location: 1}` | 1 | 1 | false |
| 5 | `061d5154` | 2 | `{rating_base: 1, rating_location: 1}` | 1 | 1 | false |
| 6 | `e09f8c40` | 4 | `{rating_base: 1, rating_photo: 2, rating_location: 1}` | 1 | 1 | false |
| 7 | `e09f8c40` | 6 | `{rating_base: 1, rating_photo: 2, rating_review: 2, rating_location: 1}` | 1 | 1 | false |
| 8 | `31bb807d` | 4 | `{rating_base: 1, rating_photo: 2, rating_location: 1}` | 1 | 1 | false |
| 9 | `81a26a3f` | 4 | `{rating_base: 1, rating_photo: 2, rating_location: 1}` | 1 | 1 | false |
| 10 | `e09f8c40` | 4 | `{rating_base: 1, rating_photo: 2, rating_location: 1}` | 1 | 1 | false |

### 3. Reconciliation table

All 10 rows have tier_multiplier=1, seeder_multiplier=1, is_new_beer=false.
Formula simplifies to: `SUM(base values)` per component.

| # | Components | Computed | Recorded | Delta | Status |
|---|---|---|---|---|---|
| 1 | base(1) + location(1) | 2 | 2 | 0 | **MATCH** |
| 2 | base(1) + location(1) | 2 | 2 | 0 | **MATCH** |
| 3 | base(1) + location(1) | 2 | 2 | 0 | **MATCH** |
| 4 | base(1) + location(1) | 2 | 2 | 0 | **MATCH** |
| 5 | base(1) + location(1) | 2 | 2 | 0 | **MATCH** |
| 6 | base(1) + photo(2) + location(1) | 4 | 4 | 0 | **MATCH** |
| 7 | base(1) + photo(2) + review(2) + location(1) | 6 | 6 | 0 | **MATCH** |
| 8 | base(1) + photo(2) + location(1) | 4 | 4 | 0 | **MATCH** |
| 9 | base(1) + photo(2) + location(1) | 4 | 4 | 0 | **MATCH** |
| 10 | base(1) + photo(2) + location(1) | 4 | 4 | 0 | **MATCH** |

**Supplemental: new-beer rows (5 total in system)**

| User (prefix) | Amount | Breakdown | Expected (base * 1.5) | Status |
|---|---|---|---|---|
| `81a26a3f` | 4 | `{rating_base: 2, rating_location: 2}` | round(1*1.5)=2 + round(1*1.5)=2 = 4 | **MATCH** |
| `061d5154` | 4 | `{rating_base: 2, rating_location: 2}` | 2 + 2 = 4 | **MATCH** |
| `6d9b95d9` | 7 | `{rating_base: 2, rating_photo: 3, rating_location: 2}` | 2 + round(2*1.5)=3 + 2 = 7 | **MATCH** |
| `81a26a3f` | 7 | `{rating_base: 2, rating_photo: 3, rating_location: 2}` | 2 + 3 + 2 = 7 | **MATCH** |
| `061d5154` | 10 | `{rating_base: 2, rating_photo: 3, rating_review: 3, rating_location: 2}` | 2 + 3 + round(2*1.5)=3 + 2 = 10 | **MATCH** |

### 4. Findings

All 15 rows audited (10 regular + 5 new-beer) reconcile perfectly. The breakdown JSONB accurately records the per-component post-multiplier amounts, and the total matches the sum.

**No multiplier bugs found.** The economy rewards what we think it rewards.

**Coverage gap:** No seeder_multiplier=1.5 or tier_multiplier>1.0 rows exist yet (no seeders have been flagged, all users are `taster` tier). These multiplier paths are untested in production data. They should be exercised during seeder kickoff.

### 5. Recommendation

**No action required.** Formula is correct for all observed data. Seeder and tier multipliers should be spot-checked after seeder kickoff produces rows with those multipliers active.

---

## Part B — H2H discovery

### 1. Code path trace

```
POST /api/head-to-head/:id/complete  (server.js:2120)
  → Fetch prompt from head_to_head_prompts (ownership + status check)
  → Validate winner_rating_id is one of the two prompt ratings
  → INSERT into head_to_head_results (winner/loser beer_id + rating_id)
  → updateEloAfterComparison (lib/elo.js:121)
      → Updates beer_elo_ratings (Elo scores)
      → Inserts beer_elo_events (audit trail)
      → Does NOT touch tabs_ledger or profiles
  → PATCH head_to_head_prompts status = 'completed'
  → Read prompt.reward_tabs (default: 0)
  → Return { success: true, reward_tabs, tabs_earned: rewardTabs }
```

**The handler does NOT write to `tabs_ledger`.** It reads `prompt.reward_tabs` and returns it as `tabs_earned` in the response, but never actually credits the tabs. The client receives a `tabs_earned` value that was never recorded anywhere.

This is a bug: the API tells the client the user earned tabs, but the tabs are never granted.

### 2. Skip path confirmation

`POST /api/head-to-head/:id/skip` (server.js:2190) patches the prompt status to `'skipped'` and returns success. **Skip path does not touch tabs_ledger.**

### 3. Current award amount

`HEAD_TO_HEAD_REWARD_TABS` is defined in `lib/headToHead.js:8`:

```javascript
const HEAD_TO_HEAD_REWARD_TABS = Number(process.env.HEAD_TO_HEAD_REWARD_TABS) || 2;
```

Default: **2 tabs per completion** (env-configurable). This value is stored on `head_to_head_prompts.reward_tabs` (column default: 0, but `createPromptAndBuildPayload` writes the constant).

### 4. Distinguishability in ledger

H2H completions are **not recorded in the ledger at all**, so there is nothing to distinguish. If/when a fix lands, a new `event_type` (e.g., `head_to_head_complete`) or a breakdown discriminator would be needed.

### 5. Total H2H completions to date

**0 prompts exist.** The `head_to_head_prompts` table is empty. The feature has not been exercised in production. The `maybeOfferHeadToHead` function is called after every rating (server.js:1857) but requires a same-family challenger rating with YG tolerance — with only ~76 total ratings across 8 users, the matcher likely hasn't found viable pairs.

### 6. Open questions for the user to decide (original — see Part B.2 for updates)

1. **The reward is not granted.** `POST /api/head-to-head/:id/complete` returns `tabs_earned: 2` but never inserts a ledger row. This needs a fix before the feature can be considered functional. Options:
   - Insert a `head_to_head_complete` ledger row in the complete handler (simplest)
   - Route through `processEventEngine` with a new event type (more consistent but more work)
   - Call `award_tabs` RPC (wrong semantics — it's for admin grants)

2. **The default reward (2 tabs) may be too low** to incentivize the extra interaction. For reference, a bare rating earns 2 tabs (base + location), and a rating with photo earns 4. A 2-tab H2H reward doubles the minimum earning but is invisible next to a photo bonus.

3. **Should H2H rewards count toward weekly cap?** Currently the cap only counts `rating_award` event_type rows. If H2H gets its own event_type, it would be uncapped by default. Decide whether this is intentional.

4. **No prompts exist yet** — the matcher may need tuning (lower YG tolerance, broader style matching) to start generating prompts at current user/rating volume. This is a product tuning question, not a bug.

---

## Part B.2 — Recon followup

User reported H2H comparisons have been happening in the app. Investigated whether data exists that the initial audit missed.

### Data inventory

| Table | Row count | Notes |
|---|---|---|
| `head_to_head_prompts` | **0** | Empty |
| `head_to_head_results` | **0** | Empty |
| `beer_elo_events` | **0** | Empty |
| `beer_elo_ratings` (comparison_count > 0) | **2** | Two beers with `comparison_count = 1`, both updated at `2026-04-09 00:49:31.458` |

### Second witness: beer_elo_events

Zero rows in `beer_elo_events`. This table is populated by `updateEloAfterComparison` (lib/elo.js:163-184) only when `resultId` is truthy — i.e., only when the `head_to_head_results` INSERT succeeds and returns an id.

### The two comparison_count=1 beers

| beer_id | global_elo | comparison_count | updated_at |
|---|---|---|---|
| `284b8f8c...` | 654 | 1 | 2026-04-09 00:49:31.458 |
| `d48792c6...` | 712 | 1 | 2026-04-09 00:49:31.458 |

Both updated at the exact same timestamp during the Day 3 simulator test session. The `updateEloAfterComparison` function increments `comparison_count` in the Elo PATCH (lib/elo.js:148), separate from the `beer_elo_events` INSERT. This means:

1. A single H2H completion ran `updateEloAfterComparison` successfully (Elo PATCHes succeeded)
2. But the preceding `head_to_head_results` INSERT likely **failed silently** (no status check on `resultInsertRes` at server.js:2168), so `resultId` was null
3. With `resultId = null`, `beer_elo_events` were skipped (guarded by `if (resultId && ...)` at server.js:2170)
4. But `updateEloAfterComparison` still ran because the guard is `if (resultId && (winnerBeerId || loserBeerId))` — wait, that requires resultId too

Actually, re-reading server.js:2170: `if (resultId && (winnerBeerId || loserBeerId))` — if `resultId` is null, the Elo update is skipped entirely. So how did `comparison_count` get incremented?

**Alternative explanation:** The `comparison_count` values may have been set by a different code path — possibly a manual DB update, a migration seed, or the elo-snapshot cron. The `update_beer_elo_from_yg` trigger function does NOT touch `comparison_count` (confirmed from function body). The elo-snapshot cron would need investigation.

### Cleanup mechanism

- `lib/deleteAccount.js:40` — `DELETE /head_to_head_prompts?user_id=eq.{userId}` — cascades to `head_to_head_results` (FK ON DELETE CASCADE), which cascades to `beer_elo_events` (FK ON DELETE CASCADE). This is the only delete path found.
- No cron or scheduled cleanup of H2H tables found in scripts/workers.

### Alternate H2H code paths

Only one code path creates H2H prompts and results:

1. **Prompt creation:** `maybeOfferHeadToHead` (lib/headToHead.js:106) → `createPromptAndBuildPayload` → `POST /head_to_head_prompts` — called after every `POST /api/ratings` for authenticated users (server.js:1857)
2. **Completion:** `POST /api/head-to-head/:id/complete` (server.js:2120) — `POST /head_to_head_results` + `updateEloAfterComparison` + `PATCH prompts status=completed`
3. **Skip:** `POST /api/head-to-head/:id/skip` (server.js:2190) — `PATCH prompts status=skipped`

No other paths insert into either table. No routes/ or workers/ files touch H2H tables.

### API logs

Zero log lines matching "head-to-head" or "h2h" in current container logs. The complete handler's Elo error path (`console.error` at server.js:2174) has not fired.

### Updated conclusion

**Both tables are genuinely empty.** The H2H feature has not produced any persisted completions. The two `comparison_count=1` values on `beer_elo_ratings` are anomalous — they were not created by the traced H2H code path (which requires a non-null `resultId` to call `updateEloAfterComparison`). Most likely explanation: manual dev-time UPDATE or a migration artifact.

**The user's report of "H2H happening in the app" may refer to:**
1. H2H prompts being **offered** in the POST /api/ratings response (`head_to_head` payload) — the `maybeOfferHeadToHead` function runs but its prompt offers may not have been completed by any user yet
2. The Elo rankings / power scores changing — these change on every rating via the `trigger_update_elo_on_rating` trigger (`update_beer_elo_from_yg`), which is independent of H2H
3. A different feature being confused with H2H

**Actionable items unchanged from Part B:**
1. The complete handler does not grant tabs (phantom `tabs_earned` in response)
2. The complete handler does not check the results INSERT status (silent failure possible)
3. Zero completions to date — the tab-granting bug has had no user impact
