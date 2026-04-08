# Live System Inventory — 2026-04-08

## 1. Container / Deployment State

| Field | Value |
|---|---|
| Container image hash | sha256:37fbc2147cfccb8bda5b3b3ee18bd4dec0ba8ac2ef2bf69a242c795364e619a2 |
| Container created | 2026-04-08T02:40:53Z |
| Container uptime | Up 13 hours |
| Repo HEAD on VPS | `9733789` ("brilliant save") |
| Git status | **Dirty** — 27 untracked files (new routes, migrations, workers, test files, public/) |
| Git labels in container | None (compose labels only) |

**NOTE:** Repo HEAD matches the reviewer's reference point `9733789`. The `ratings_this_week` semantic shift IS live.

**Yellow flag:** Git status is dirty with 27 untracked files. These are new feature files (challenge economy, beer backing, elo trend, etc.) that have been added to the VPS filesystem but never committed. They are not modified tracked files — all are `??` (untracked). This means the running container includes code that is NOT in git history.

## 2. Database Schema — Functions

### 2a. All public functions (90 total, excluding pg_trgm extensions)

Key tabs-economy functions (all IN-REPO):
| Function | Touches tabs fields? | In repo? |
|---|---|---|
| award_tabs | Yes — writes lifetime_tabs_earned on user_tabs_profile | Yes |
| award_rating_tabs_with_cap | Yes — inserts into tabs_ledger (rating_award) | Yes |
| refresh_rating_award_profile_cache | Yes — writes ratings_this_week, current_streak_weeks, lifetime_tabs_earned, weeks_inactive | Yes |
| tabs_ledger_after_insert | Yes — trigger that updates profiles.tabs_balance on ledger INSERT | Yes |
| count_ratings_this_week | Yes — reads ratings count for a user/week | Yes |
| calculate_backing_payout | No (reads tier names, immutable math) | Yes |
| cash_out_back | Yes — inserts into tabs_ledger (beer_back_cashout), reads profiles.tabs_balance | Yes |
| auto_resolve_unlocked_backs | Yes — inserts into tabs_ledger (beer_back_auto_resolve) | Yes |
| get_user_backs | No (read-only, uses calculate_backing_payout) | Yes |
| get_beer_elo_trend | No (reads beer_elo_ratings/history, references current_tier only for elo tiers) | Yes |

### 2b. LIVE-ONLY functions (6 — exist on VPS but NOT in any migration file)

| Function | Purpose | Touches tabs? |
|---|---|---|
| exchange_portfolio | Read-only: returns user's rated beers with yg values | No |
| search_breweries | Read-only: trigram search on breweries | No |
| update_updated_at | Trigger: sets updated_at = NOW() on row update | No |
| user_enhanced_stats | Read-only: returns user stats as JSON | No |
| validate_new_beer_matches | Read-only: fuzzy-match beer name/brewery for dedup | No |
| venues_within_radius | Read-only: returns venues within radius | No |

**None of the LIVE-ONLY functions touch tabs economy fields.** These are utility/search functions that were likely added via `docker exec ... psql` and never committed.

### 2c. Indexes

27 indexes found across ratings, reactions, profiles, crews, user_tabs_profile, tabs_ledger.

**LIVE-ONLY indexes (12):**
- idx_crews_created_by
- idx_crews_invite_code
- idx_ratings_beer_id
- idx_ratings_beer_name
- idx_ratings_created_at
- idx_ratings_rating
- idx_ratings_serve_type
- idx_ratings_style
- idx_ratings_user_id
- idx_reactions_rating
- idx_user_tabs_balance
- idx_user_tabs_seeder
- idx_user_tabs_tier

**Indexes that exist in repo migrations:**
- ratings_pkey, reactions_pkey, profiles_pkey, crews_pkey, user_tabs_profile_pkey, tabs_ledger_pkey
- crews_invite_code_key (unique)
- ratings_one_per_actor_beer_venue (unique)
- reactions_rating_id_user_id_reaction_type_key (unique)
- tabs_ledger_event_id_key (unique)
- idx_tabs_ledger_event_type
- idx_tabs_ledger_user_created
- idx_tabs_ledger_user_event_created
- idx_profiles_equipped_avatar_id
- idx_user_tabs_tier (actually appears LIVE-ONLY based on grep)

**Audit impact:** The Day 6 migration proposes adding these indexes:
- `idx_ratings_user_id_created_at_desc` — ratings already has separate idx_ratings_user_id and idx_ratings_created_at. The composite is still worth adding.
- `idx_ratings_venue_id` — NOT currently present. Needed.
- `idx_reactions_user_id` — NOT currently present. Needed.
- `idx_reactions_rating_id_reaction_type` — Already covered by the unique index `reactions_rating_id_user_id_reaction_type_key`. May not be needed.
- `idx_profiles_created_at` — NOT currently present. Needed.
- `idx_crews_invite_code` — Already exists as both a unique constraint AND a regular index (redundant). Do NOT add.

### 2d. Constraints on user_tabs_profile and tabs_ledger

| Table | Constraint | Definition |
|---|---|---|
| user_tabs_profile | user_tabs_profile_pkey | PRIMARY KEY (user_id) |
| user_tabs_profile | user_tabs_profile_user_id_fkey | FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE |
| tabs_ledger | tabs_ledger_pkey | PRIMARY KEY (id) |
| tabs_ledger | tabs_ledger_event_id_key | UNIQUE (event_id) |

**Note:** tabs_ledger has NO foreign key to profiles. Orphan ledger entries are possible if a profile is deleted.

## 3. Cron State

### Current crontab (12 entries):
```
0 3 * * *   keycloak DB backup
0 3 * * *   supabase DB backup
*/2 * * * * push-dispatch.js
*/15 * * * * push-receipts.js
0 4 * * *   push-token-prune.js
0 2 * * *   elo-snapshot.js
0 0 * * *   challenge-resolver.js resolve
0 9 * * 1   challenge-resolver.js remind
0 3 * * *   auto-resolve-backs.js
5 0 * * 1   challenge-promoter.js
0 12 * * 1  botw-weekly.js
0 0 * * 1   weekly-tabs-eval.js
```

**streak-risk-check.js is NOT in the crontab.** Confirmed — matches audit finding #4.

### Log files:
| Log | Last modified | Size |
|---|---|---|
| /var/log/push-dispatch.log | 2026-04-08 15:54 | 2.3MB |
| /var/log/push-receipts.log | 2026-04-08 15:45 | 150KB |
| /var/log/weekly-tabs-eval.log | 2026-04-08 02:44 | 0 bytes (empty) |
| /var/log/elo-snapshot.log | 2026-04-08 02:00 | 74 bytes |
| /var/log/streak-risk-check.log | NOT FOUND | N/A |

**Note:** weekly-tabs-eval.log is empty (0 bytes) despite running at 00:00 today. This could mean it ran with no output (no profiles to evaluate) or it errored silently. Worth investigating.

## 4. Environment

Env file: `/opt/daw-platform/infra/compose/.env`

Keys present (19):
ADMIN_USER_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, APPLE_SERVICE_ID, APPLE_TEAM_ID, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, INTERNAL_PROCESS_EVENT_SECRET, KC_DB_PASSWORD, KC_FEATURES, KEYCLOAK_ADMIN, KEYCLOAK_ADMIN_CLIENT_ID, KEYCLOAK_ADMIN_CLIENT_SECRET, KEYCLOAK_ADMIN_PASSWORD, KEYCLOAK_URL, PGRST_JWT_SECRET, SUPABASE_ANON_KEY, SUPABASE_DB_PASSWORD, SUPABASE_SERVICE_ROLE_KEY

**No SENTRY_DSN present** — confirms Day 6 is needed.

## 5. Code Contracts

### Auth middleware
- Function: `authMiddleware` (server.js:443)
- Sets: `req.claims = { sub, preferred_username, email, realm_access }`
- User ID: `req.claims.sub`
- Admin check: `isAdmin(req.claims.sub)` (server.js:71) — checks ADMIN_USER_IDS Set

### rest() helper (TWO different signatures)
- **server.js:112**: `rest(method, path, opts={})` → returns `{ status, headers, body }`
- **scripts/*.js**: `rest(method, path, body)` → returns parsed JSON directly

This is critical for Day 4: `weekly-tabs-eval.js` uses the scripts version (3-arg, returns JSON directly). If porting to use PostgREST RPC, use the scripts' rest() signature.

### routeHelpers pattern
Route modules receive helpers via: `require('./routes/foo')({ ...routeHelpers })` (server.js:589+). routeHelpers includes authMiddleware, softAuthMiddleware, adminMiddleware, parsePagination, rest, and others.

## 6. Backup

- Dump file: `/opt/daw-platform/backups/hardening/preflight_20260408_160000.dump`
- Size: 5.6MB
- Format: pg_dump custom format (-F c)
- Warning: circular foreign-key constraints on `key` table (pg_dump warning, does not affect restore with --disable-triggers)

## 7. Health Endpoint Baseline

- URL: https://api.beerbook.drinksafterwork.net/api/health
- Response: `{"status":"ok","service":"beerbook-api"}`
- Response time: ~55ms
- Tested: 2026-04-08
