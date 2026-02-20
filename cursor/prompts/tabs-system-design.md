# BeerBook Tabs System — Complete Design Document & Cursor Prompt

## Overview

The Tabs system is BeerBook's engagement currency. Users earn Tabs through quality contributions and spend them on rewards. The system includes tiered multipliers, a founding "Seeder" program, weekly caps, and admin controls.

**Key economic anchor:** 2,000 Tabs = $20 real-world gift card

---

## 1. Core Concepts

### Tabs
An in-app credit earned through engagement actions. Every earn/spend is recorded in a transactional ledger.

### Tiers (in order of prominence)
| Tier | Multiplier | Progression Requirement |
|------|-----------|------------------------|
| Taster | 1.0x | Default starting tier |
| Regular | 1.1x | 4 ratings/week for 3 consecutive weeks |
| Local | 1.25x | 4 ratings + 1 written review/week for 6 consecutive weeks |
| Patron | 1.4x | 5 ratings + 2 written reviews/week for 8 consecutive weeks |
| House Account | 1.6x | 6 ratings + 2 reviews + 1 new beer or venue/week for 12 consecutive weeks |
| Cellar Reserve | 1.8x | 6 ratings + 3 reviews + 1 catalog contribution/week for 6 months (~26 weeks) |

### Tier Rules
- **Promotion:** Automatic when sustained weekly quotas are met for the required consecutive weeks
- **Maintenance minimum:** 2 ratings/week to keep current tier active
- **Demotion:** 1 month (4 weeks) of not meeting maintenance minimum drops the user ONE tier (not all the way down)
- **Admin override:** Admin can manually set any user's tier

### Seeder Program
- **Seeder** is a boolean flag, admin-granted only
- **Seeder multiplier:** 1.5x flat (constant, no progression)
- **Compounding formula:** `tabs_earned = base_action_value × tier_multiplier × seeder_multiplier`
- Seeder recognition beyond the multiplier is handled offline (real-world rewards, events, etc.)
- All tiers are accessible to all users — seeder is a separate value, not a tier gate

### Example Earnings
| Scenario | Base | Tier | Seeder | Total |
|----------|------|------|--------|-------|
| Non-seeder Taster rates a beer | 1 | ×1.0 | ×1.0 | 1 tab |
| Seeder at Patron rates a beer with full detail | 7 | ×1.4 | ×1.5 | 14.7 → 15 tabs |
| Seeder at Cellar Reserve perfect rating | 7 | ×1.8 | ×1.5 | 18.9 → 19 tabs |

---

## 2. Earning Actions

### Per-Rating Breakdown (itemized, additive)
| Action | Base Tabs |
|--------|-----------|
| Rate a beer (base) | 1 |
| Add location to rating | +1 |
| Add photo to rating | +2 |
| Add price to rating | +1 |
| Written review/tasting notes | +2 |

**Maximum per fully-detailed rating: 7 base tabs**

### Other Earning Actions
| Action | Base Tabs | Notes |
|--------|-----------|-------|
| Submit new unique beer | +3 | Tabs awarded on admin approval only |
| Give a cheers | +1 | |
| Receive a cheers | +1 | |

### Weekly Cap
- **Only the first 10 ratings per week earn tabs. Period.**
- Ratings 11+ earn ZERO tabs (no base, no quality bonuses, nothing)
- The cap is first-come: the first 10 ratings of the week (Monday 00:00 UTC reset) count
- This applies universally to seeders and non-seeders alike
- New beer submission tabs are a separate track (awarded on admin approval, not subject to the 10-rating cap)
- Cheers given/received are not subject to the rating cap

### Weekly Math Check
- **Casual user (non-seeder, Regular):** 4 ratings with location, 1 with review = (4×2 + 1×2) × 1.1 = **11 tabs/week** → ~36 months to gift card
- **Dedicated seeder at Patron:** 8 ratings, 6 with location, 4 with photos, 3 with price, 3 with reviews = (8×1 + 6×1 + 4×2 + 3×1 + 3×2) × 1.4 × 1.5 = **65 tabs/week** → ~8 months to gift card ✓
- **Theoretical weekly ceiling:** 10 perfect ratings = 10×7 = 70 base → Cellar Reserve seeder: 70 × 1.8 × 1.5 = **189 tabs/week** → ~11 weeks minimum for gift card

---

## 3. New Beer Submission Queue

When a user submits a new unique beer:
- The beer enters an **admin approval queue** (not immediately added to catalog)
- Admin reviews submissions weekly
- On approval: beer is added to catalog AND the submitting user receives +3 tabs (with multipliers applied)
- On rejection: no tabs awarded, user can be notified
- This prevents catalog pollution and gaming

---

## 4. Spending Tabs (Future — infrastructure now, features later)

Initial launch: tabs accumulate with no spend mechanisms. The balance and leaderboard are the engagement drivers.

Planned spend categories:
- **Real-world rewards:** 2,000 tabs = $20 gift card (admin-managed, manual fulfillment)
- **Cosmetic/profile:** Custom badges, profile flair, signature beer pin
- **Functional perks:** Advanced flavor comparisons, curated list creation
- **Crew features:** Crew customization, crew challenges

The `tab_transactions` ledger supports both earn and spend from day one.

---

## 5. Dashboard & Notifications

### Dashboard Widget (visible on home/profile)
- Current tier name and badge
- Current multiplier (combined tier × seeder if applicable)
- Tab balance
- Weekly progress: "X/10 ratings used this week"
- Streak counter: "X consecutive weeks meeting quota"
- Tier progress: "Y more weeks at current activity to reach [Next Tier]"

### Notification Triggers
- **Tier promotion:** "Congratulations! You've reached Local tier. Your multiplier is now 1.25x"
- **Streak at risk:** "You need X more ratings by Sunday to maintain your streak"
- **Approaching demotion:** "You haven't met your weekly minimum in 3 weeks. One more week and you'll drop to [Previous Tier]"
- **Tabs earned summary:** Weekly digest of tabs earned
- **New beer approved:** "Your submission of [Beer Name] was approved! +3 tabs earned"
- **Seeder granted:** "Welcome to the founding crew! You've been granted Seeder status with a permanent 1.5x multiplier"

---

## 6. Admin Controls

The admin account needs:
- **User management view:** See all users, their tier, seeder status, tab balance, streak info
- **Grant/revoke seeder status** per user
- **Override tier** for any user (promote or demote manually)
- **Adjust tab balance** (add or subtract, with reason logged in ledger)
- **Beer submission queue:** Approve/reject new beer submissions, award tabs on approval
- **View economy stats:** Total tabs in circulation, distribution by tier, active user counts

---

## 7. Database Schema

### New Tables

```sql
-- ============================================
-- Tabs System — Migration (idempotent)
-- Run: docker exec -i supabase-db psql -U postgres -d postgres < apps/beerbook/docs/migration-tabs.sql
-- ============================================

-- Tier enum
DO $$ BEGIN
  CREATE TYPE user_tier AS ENUM ('taster', 'regular', 'local', 'patron', 'house_account', 'cellar_reserve');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tab transaction type enum
DO $$ BEGIN
  CREATE TYPE tab_transaction_type AS ENUM ('earn', 'spend', 'admin_adjust', 'reward_redeem');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tab earning source enum
DO $$ BEGIN
  CREATE TYPE tab_earn_source AS ENUM (
    'rating_base',
    'rating_location',
    'rating_photo',
    'rating_price',
    'rating_review',
    'new_beer_approved',
    'cheers_given',
    'cheers_received',
    'admin_grant',
    'bonus'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- User Tabs Profile (extends existing profiles table concept)
-- ============================================
CREATE TABLE IF NOT EXISTS user_tabs_profile (
    user_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Tier
    current_tier user_tier NOT NULL DEFAULT 'taster',
    tier_promoted_at TIMESTAMPTZ,              -- when they last changed tier
    
    -- Seeder
    is_seeder BOOLEAN NOT NULL DEFAULT FALSE,
    seeder_granted_at TIMESTAMPTZ,
    seeder_granted_by TEXT,                     -- admin user_id who granted it
    
    -- Cached balance (source of truth is ledger, this is for fast reads)
    tab_balance INTEGER NOT NULL DEFAULT 0,
    lifetime_tabs_earned INTEGER NOT NULL DEFAULT 0,
    
    -- Weekly tracking
    ratings_this_week INTEGER NOT NULL DEFAULT 0,
    week_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('week', NOW()),
    
    -- Streak tracking
    current_streak_weeks INTEGER NOT NULL DEFAULT 0,
    longest_streak_weeks INTEGER NOT NULL DEFAULT 0,
    last_active_week TIMESTAMPTZ,              -- the Monday of the last week they met minimum
    
    -- Demotion tracking
    weeks_inactive INTEGER NOT NULL DEFAULT 0,  -- consecutive weeks below maintenance minimum
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_tabs_tier ON user_tabs_profile(current_tier);
CREATE INDEX IF NOT EXISTS idx_user_tabs_seeder ON user_tabs_profile(is_seeder) WHERE is_seeder = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_tabs_balance ON user_tabs_profile(tab_balance DESC);

-- ============================================
-- Tab Transactions Ledger (source of truth)
-- ============================================
CREATE TABLE IF NOT EXISTS tab_transactions (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Transaction details
    transaction_type tab_transaction_type NOT NULL,
    amount INTEGER NOT NULL,                    -- positive for earn, negative for spend
    
    -- Earning details (nullable for spend transactions)
    earn_source tab_earn_source,
    base_amount INTEGER,                        -- before multipliers
    tier_multiplier DECIMAL(3,2),               -- the multiplier at time of earning
    seeder_multiplier DECIMAL(3,2),             -- 1.0 if not seeder, 1.5 if seeder
    
    -- References
    rating_id TEXT REFERENCES ratings(id) ON DELETE SET NULL,
    related_entity_id TEXT,                     -- beer submission id, reaction id, etc.
    
    -- Admin actions
    admin_user_id TEXT,                         -- who performed admin action
    admin_reason TEXT,                          -- why (for admin_adjust, reward_redeem)
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tab_tx_user ON tab_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tab_tx_created ON tab_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tab_tx_type ON tab_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_tab_tx_rating ON tab_transactions(rating_id) WHERE rating_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tab_tx_user_week ON tab_transactions(user_id, created_at DESC);

-- ============================================
-- Tier Progression Requirements (config table)
-- ============================================
CREATE TABLE IF NOT EXISTS tier_requirements (
    tier user_tier PRIMARY KEY,
    display_name TEXT NOT NULL,
    display_order INTEGER NOT NULL,
    multiplier DECIMAL(3,2) NOT NULL,
    
    -- Weekly quota to PROGRESS toward this tier
    required_ratings_per_week INTEGER NOT NULL DEFAULT 0,
    required_reviews_per_week INTEGER NOT NULL DEFAULT 0,
    required_contributions_per_week INTEGER NOT NULL DEFAULT 0,  -- new beers, venues
    required_consecutive_weeks INTEGER NOT NULL DEFAULT 0,
    
    -- Maintenance minimum (same for all tiers)
    maintenance_ratings_per_week INTEGER NOT NULL DEFAULT 2
);

-- Seed tier config
INSERT INTO tier_requirements (tier, display_name, display_order, multiplier, required_ratings_per_week, required_reviews_per_week, required_contributions_per_week, required_consecutive_weeks)
VALUES
    ('taster',        'Taster',        1, 1.00, 0, 0, 0, 0),
    ('regular',       'Regular',       2, 1.10, 4, 0, 0, 3),
    ('local',         'Local',         3, 1.25, 4, 1, 0, 6),
    ('patron',        'Patron',        4, 1.40, 5, 2, 0, 8),
    ('house_account', 'House Account', 5, 1.60, 6, 2, 1, 12),
    ('cellar_reserve','Cellar Reserve', 6, 1.80, 6, 3, 1, 26)
ON CONFLICT (tier) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    display_order = EXCLUDED.display_order,
    multiplier = EXCLUDED.multiplier,
    required_ratings_per_week = EXCLUDED.required_ratings_per_week,
    required_reviews_per_week = EXCLUDED.required_reviews_per_week,
    required_contributions_per_week = EXCLUDED.required_contributions_per_week,
    required_consecutive_weeks = EXCLUDED.required_consecutive_weeks;

-- ============================================
-- Beer Submission Queue
-- ============================================
CREATE TABLE IF NOT EXISTS beer_submissions (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    submitted_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Beer details
    beer_name TEXT NOT NULL,
    brewery TEXT,
    style TEXT,
    abv DECIMAL(4,1),
    notes TEXT,
    
    -- Review status
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by TEXT,                           -- admin user_id
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,                          -- admin notes on why approved/rejected
    
    -- Link to created beer (if approved and added to catalog)
    created_beer_id TEXT,                       -- references beers(id) once catalog tables exist
    
    -- Tab tracking
    tabs_awarded BOOLEAN NOT NULL DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beer_sub_status ON beer_submissions(status);
CREATE INDEX IF NOT EXISTS idx_beer_sub_user ON beer_submissions(submitted_by);
CREATE INDEX IF NOT EXISTS idx_beer_sub_created ON beer_submissions(created_at DESC);

-- ============================================
-- Notifications
-- ============================================
CREATE TABLE IF NOT EXISTS tab_notifications (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    
    notification_type TEXT NOT NULL CHECK (notification_type IN (
        'tier_promotion',
        'tier_demotion',
        'streak_at_risk',
        'approaching_demotion',
        'tabs_earned',
        'beer_approved',
        'beer_rejected',
        'seeder_granted',
        'reward_eligible',
        'weekly_summary'
    )),
    
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    
    -- Reference data (JSON for flexibility)
    metadata JSONB,
    
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tab_notif_user ON tab_notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tab_notif_unread ON tab_notifications(user_id) WHERE is_read = FALSE;

-- ============================================
-- Grants
-- ============================================
GRANT SELECT ON user_tabs_profile TO anon;
GRANT SELECT ON tab_transactions TO anon;
GRANT SELECT ON tier_requirements TO anon;
GRANT SELECT ON beer_submissions TO anon;
GRANT SELECT ON tab_notifications TO anon;

-- ============================================
-- Triggers
-- ============================================
DROP TRIGGER IF EXISTS user_tabs_profile_updated_at ON user_tabs_profile;
CREATE TRIGGER user_tabs_profile_updated_at 
    BEFORE UPDATE ON user_tabs_profile 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Views
-- ============================================

-- Leaderboard view
CREATE OR REPLACE VIEW tabs_leaderboard AS
SELECT 
    utp.user_id,
    p.display_name,
    p.avatar_url,
    utp.current_tier,
    utp.is_seeder,
    utp.tab_balance,
    utp.lifetime_tabs_earned,
    utp.current_streak_weeks,
    tr.display_name as tier_display_name,
    tr.multiplier as tier_multiplier
FROM user_tabs_profile utp
JOIN profiles p ON p.id = utp.user_id
JOIN tier_requirements tr ON tr.tier = utp.current_tier
ORDER BY utp.lifetime_tabs_earned DESC;

GRANT SELECT ON tabs_leaderboard TO anon;

-- Weekly activity summary view
CREATE OR REPLACE VIEW weekly_tab_activity AS
SELECT 
    utp.user_id,
    p.display_name,
    utp.ratings_this_week,
    utp.current_tier,
    utp.is_seeder,
    utp.current_streak_weeks,
    tr.required_ratings_per_week as target_ratings,
    tr.required_reviews_per_week as target_reviews,
    CASE 
        WHEN utp.ratings_this_week >= 10 THEN TRUE 
        ELSE FALSE 
    END as weekly_cap_reached
FROM user_tabs_profile utp
JOIN profiles p ON p.id = utp.user_id
JOIN tier_requirements tr ON tr.tier = utp.current_tier;

GRANT SELECT ON weekly_tab_activity TO anon;
```

### Modifications to Existing Tables

```sql
-- Add price_cents to ratings for the "+1 tab for adding price" action
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS price_cents INTEGER CHECK (price_cents > 0);
```

Note: The ratings table already has `photo_url`, `latitude/longitude/location_name`, and `notes` columns which map to the tab earning actions (photo, location, review).

---

## 8. API Endpoints Needed

### Tab Earnings (called internally when actions happen)
- Tabs are awarded server-side when a rating is submitted — the API calculates which quality bonuses apply based on which fields are populated
- No direct "earn tabs" endpoint — it's a side effect of existing actions

### Tab Profile
- `GET /api/tabs/profile` — current user's tab profile (tier, balance, streak, weekly progress)
- `GET /api/tabs/profile/:userId` — any user's public tab info

### Leaderboard
- `GET /api/tabs/leaderboard` — top users by lifetime tabs

### Transaction History
- `GET /api/tabs/history` — current user's tab transaction ledger (paginated)

### Notifications
- `GET /api/tabs/notifications` — current user's unread notifications
- `PATCH /api/tabs/notifications/:id/read` — mark notification as read
- `PATCH /api/tabs/notifications/read-all` — mark all as read

### Beer Submissions
- `POST /api/tabs/submissions` — submit a new beer
- `GET /api/tabs/submissions` — user's own submissions and their status

### Admin Endpoints (admin auth required)
- `GET /api/admin/tabs/users` — all users with tab profiles
- `PATCH /api/admin/tabs/users/:userId/seeder` — grant/revoke seeder status
- `PATCH /api/admin/tabs/users/:userId/tier` — override tier
- `POST /api/admin/tabs/users/:userId/adjust` — adjust tab balance with reason
- `GET /api/admin/tabs/submissions` — all pending beer submissions
- `PATCH /api/admin/tabs/submissions/:id` — approve/reject submission
- `GET /api/admin/tabs/stats` — economy overview stats

---

## 9. Server-Side Logic (Key Functions)

### Award Tabs on Rating Submission
When `POST /api/ratings` is called:
1. Get or create user's `user_tabs_profile`
2. Check if `ratings_this_week < 10` (check if `week_start` is current week, reset if not)
3. If under cap, calculate base tabs:
   - +1 for base rating (always)
   - +1 if `location_name` or `latitude/longitude` is provided
   - +2 if `photo_url` is provided
   - +1 if `price_cents` is provided
   - +2 if `notes` is provided and length > 0 (or > some minimum like 10 chars)
4. Look up tier multiplier from `tier_requirements`
5. Apply seeder multiplier (1.5 if `is_seeder`, 1.0 if not)
6. `final_tabs = ROUND(base_tabs × tier_multiplier × seeder_multiplier)`
7. Insert into `tab_transactions` ledger
8. Update `user_tabs_profile`: increment `tab_balance`, `lifetime_tabs_earned`, `ratings_this_week`
9. If this is rating 10 of the week, optionally create a notification: "You've used all 10 ratings this week!"

### Award Tabs on Cheers
When a cheers reaction is created:
- Award +1 tab to the person who gave the cheers
- Award +1 tab to the person who received the cheers (the rating author)
- Both get multipliers applied

### Weekly Tier Evaluation (Cron Job or Scheduled Task)
Run every Monday at 00:00 UTC:
1. For each user in `user_tabs_profile`:
   a. Count their ratings, reviews, and contributions from the past week
   b. If they met maintenance minimum (2 ratings): reset `weeks_inactive` to 0
   c. If they didn't meet minimum: increment `weeks_inactive`
   d. If `weeks_inactive >= 4`: demote one tier, reset `weeks_inactive` to 0, create demotion notification
   e. Check if their weekly activity meets the NEXT tier's progression requirements
   f. If yes: increment `current_streak_weeks`
   g. If `current_streak_weeks` >= next tier's `required_consecutive_weeks`: promote, create notification
   h. If they met current tier quota but not next tier: keep streak, no change
   i. If they didn't meet next tier quota: reset `current_streak_weeks` to 0
2. Reset `ratings_this_week` to 0 and update `week_start` for all users

### Streak Risk Notifications
Run Thursday or Friday:
- For users who haven't met maintenance minimum yet this week, send "streak at risk" notification
- For users approaching demotion (weeks_inactive = 3), send warning

---

## 10. Integration with Existing Flows

### Rating Submission Flow (modify existing `POST /api/ratings`)
```
BEFORE (current):
  1. Validate token
  2. Insert rating into ratings table
  3. Return rating

AFTER (with tabs):
  1. Validate token
  2. Insert rating into ratings table
  3. → NEW: Call awardTabsForRating(userId, ratingId, ratingData)
  4. Return rating (include tabs_earned in response)
```

### Cheers/Reaction Flow (modify existing cheers endpoint)
```
BEFORE:
  1. Validate token
  2. Insert/delete reaction
  3. Return reaction count

AFTER:
  1. Validate token
  2. Insert/delete reaction
  3. → NEW: If inserting (not deleting), call awardTabsForCheers(giverId, receiverId, ratingId)
  4. Return reaction count
```

### Profile Page (modify existing profile endpoint/view)
```
BEFORE:
  - Display name, avatar, rating count, recent ratings

AFTER:
  - Display name, avatar, rating count, recent ratings
  - → NEW: Tier badge, tab balance, streak info, weekly progress bar
```

---

## 11. UI Components Needed

### Dashboard Widget
A card on the main dashboard showing:
- Tier badge (icon + name)
- Current multiplier displayed (e.g., "2.1x" for Patron + Seeder)
- Tab balance
- Weekly progress bar: "7/10 ratings this week"
- Streak: "12 week streak 🔥"
- Next tier progress: "4 more weeks to House Account"

### Notification Badge
- Bell icon with unread count
- Dropdown/page showing notifications
- Mark as read on click

### Leaderboard
- Tab on the existing leaderboard or new page
- Show: rank, avatar, name, tier badge, lifetime tabs, current streak

### Profile Tab Info
- On user profile pages, show their tier badge and stats publicly
- Tab balance can be private or public (recommend public for social pressure)

### Rating Submission Feedback
- After submitting a rating, show a brief "+X tabs" animation/toast
- Break down: "Base: 1 | Location: +1 | Photo: +2 | Review: +2 = 6 tabs × 1.4x = 8 tabs earned!"

### Admin Panel
- User list with tab info
- Seeder toggle per user
- Tier override dropdown per user
- Beer submission review queue with approve/reject buttons
- Economy dashboard with basic stats

---

## 12. Database Wipe Consideration

Since the database is being wiped of test data before launch:
- Deploy tabs migration as part of the wipe/reset script
- All users start fresh: Taster tier, 0 tabs, 0 streaks
- Pre-flag founding members as seeders BEFORE kickoff night
- The kickoff night generates the first real data in a clean system

### Wipe Script Order:
1. Truncate user-generated data (ratings, reactions, price_logs, happy_hours, venues)
2. Optionally truncate profiles (or keep accounts, just wipe content)
3. Run tabs migration (creates new tables)
4. Seed tier_requirements config
5. Create user_tabs_profile entries for existing users (all start at taster, 0 tabs)
6. Admin grants seeder status to founding 16

---

## 13. Future Considerations (not built now, but schema supports)

### Venue Ratings & Buffs
- Venues will be ratable entities
- Venue-style affinity scores (Irish pub buffs stouts, etc.)
- Buff affects beer recommendation scores, not tab earnings
- Earning tabs for venue ratings/data can be added later

### Crew Scoping
- Tab balance lives at user level (not crew-scoped)
- Crew leaderboards can be derived from user data
- `crew_id` on relevant tables for future crew challenges

### Spending Mechanisms
- The `tab_transactions` ledger with `spend` type supports future shops
- Reward redemption tracked as `reward_redeem` transaction type
- Admin manages fulfillment offline for now

---

# CURSOR PROMPT

## Context Files (read before writing code)
- `apps/beerbook/docs/database-schema.sql` (current canonical schema)
- `apps/beerbook-api/server.js` (current API)
- `cursor/decisions/DECISIONS.md` (architectural decisions)
- This document (tabs system design)

## Goal

Implement the BeerBook Tabs credit system. This is a multi-phase implementation. Phase 1 focuses on the database schema, core earning logic, and API endpoints. Phase 2 (separate prompt) handles UI integration.

---

## Phase T1: Database Migration

Create `apps/beerbook/docs/migration-tabs.sql` — a single, idempotent migration file.

Include ALL tables, enums, indexes, triggers, views, and seed data from Section 7 of this document. Follow the exact schema defined above.

**Critical rules:**
- All DDL is idempotent (IF NOT EXISTS, DO $$ EXCEPTION blocks)
- Do NOT modify existing tables except adding `price_cents` column to `ratings`
- Use `uuid_generate_v4()` for IDs (matches existing pattern)
- All new tables get `GRANT SELECT ON ... TO anon`
- The `tier_requirements` INSERT must use ON CONFLICT DO UPDATE so it's re-runnable

**Success criteria:**
- [ ] Migration runs without error
- [ ] `\dt` shows new tables: `user_tabs_profile`, `tab_transactions`, `tier_requirements`, `beer_submissions`, `tab_notifications`
- [ ] `SELECT * FROM tier_requirements ORDER BY display_order;` returns 6 rows with correct multipliers
- [ ] Existing tables and data are untouched
- [ ] Views `tabs_leaderboard` and `weekly_tab_activity` work

**After migration runs, update `apps/beerbook/docs/database-schema.sql` to reflect the full merged schema.**

---

## Phase T2: API Endpoints

Add tab-related endpoints to `apps/beerbook-api/server.js` (or split into `routes/tabs.js` if server.js is getting long).

### T2A: Tab Profile Endpoints

```
GET /api/tabs/profile
- Auth required
- Returns current user's full tab profile joined with tier_requirements
- Include: tier, multiplier, is_seeder, tab_balance, lifetime_tabs_earned, 
  ratings_this_week, current_streak_weeks, weekly_cap_reached (boolean)

GET /api/tabs/profile/:userId  
- Public
- Returns same data for any user (for profile pages)
```

### T2B: Leaderboard

```
GET /api/tabs/leaderboard
- Public
- Returns tabs_leaderboard view with pagination
- Default sort: lifetime_tabs_earned DESC
```

### T2C: Transaction History

```
GET /api/tabs/history
- Auth required
- Returns user's tab_transactions, paginated, newest first
- Include earn_source, amount, base_amount, multipliers, created_at
```

### T2D: Notifications

```
GET /api/tabs/notifications
- Auth required
- Returns user's notifications, unread first, then by created_at DESC
- Include unread_count in response metadata

PATCH /api/tabs/notifications/:id/read
- Auth required, must own the notification
- Sets is_read = true

PATCH /api/tabs/notifications/read-all
- Auth required
- Sets all user's notifications to is_read = true
```

### T2E: Beer Submissions

```
POST /api/tabs/submissions
- Auth required
- Body: { beer_name, brewery, style, abv, notes }
- Creates beer_submissions record with status='pending'

GET /api/tabs/submissions
- Auth required
- Returns current user's submissions with status
```

### T2F: Admin Endpoints

All admin endpoints require auth + admin check. For now, admin check can be a hardcoded user_id check or a role field on profiles.

```
GET /api/admin/tabs/users
- Returns all users with their tab profiles

PATCH /api/admin/tabs/users/:userId/seeder
- Body: { is_seeder: boolean }
- Updates user's seeder status
- If granting: set seeder_granted_at, seeder_granted_by
- Create notification for user

PATCH /api/admin/tabs/users/:userId/tier
- Body: { tier: 'taster'|'regular'|...|'cellar_reserve' }
- Override user's tier
- Create notification for user

POST /api/admin/tabs/users/:userId/adjust
- Body: { amount: integer, reason: string }
- Insert admin_adjust transaction
- Update user's tab_balance
- Positive or negative amount

GET /api/admin/tabs/submissions?status=pending
- Returns beer submissions filtered by status
- Default: pending

PATCH /api/admin/tabs/submissions/:id
- Body: { status: 'approved'|'rejected', review_notes?: string }
- Updates submission status
- If approved: award +3 tabs (with multipliers) to submitter, set tabs_awarded=true
- Create notification for submitter either way
```

---

## Phase T3: Core Earning Logic

### T3A: Modify `POST /api/ratings`

After successfully inserting a rating, call a new function `awardTabsForRating(userId, ratingId, ratingData)`:

```javascript
async function awardTabsForRating(userId, ratingId, ratingData) {
    // 1. Get or create user_tabs_profile
    // 2. Check if week_start is current week, reset ratings_this_week if new week
    // 3. If ratings_this_week >= 10, return { tabs_earned: 0, reason: 'weekly_cap' }
    // 4. Calculate base tabs:
    //    - 1 (base, always)
    //    - +1 if location_name OR (latitude AND longitude)
    //    - +2 if photo_url
    //    - +1 if price_cents
    //    - +2 if notes and notes.trim().length >= 10
    // 5. Get tier multiplier from tier_requirements
    // 6. Get seeder multiplier (1.5 if is_seeder, 1.0 if not)
    // 7. final_tabs = Math.round(base × tier_mult × seeder_mult)
    // 8. Insert INDIVIDUAL tab_transactions for each component:
    //    - One for rating_base (amount after multipliers for 1 base tab)
    //    - One for rating_location if applicable
    //    - One for rating_photo if applicable
    //    - One for rating_price if applicable  
    //    - One for rating_review if applicable
    //    Each with the rating_id reference, base_amount, tier_multiplier, seeder_multiplier
    // 9. Update user_tabs_profile: tab_balance += final_tabs, lifetime += final_tabs, ratings_this_week += 1
    // 10. Return { tabs_earned: final_tabs, breakdown: {...} }
}
```

**Important:** Insert individual transactions per earning source (not one combined transaction) so the ledger shows exactly where tabs came from. But the multipliers apply to the total, so calculate per-component:
- `rating_base`: Math.round(1 × tier × seeder)
- `rating_location`: Math.round(1 × tier × seeder)  
- `rating_photo`: Math.round(2 × tier × seeder)
- etc.

### T3B: Modify Cheers/Reaction Endpoint

When a cheers reaction is CREATED (not deleted):
1. Award +1 tab (with multipliers) to the user who gave the cheers
2. Look up the rating's author, award +1 tab (with multipliers) to them
3. Insert transactions for both: earn_source = 'cheers_given' and 'cheers_received'

When a cheers is REMOVED: do NOT claw back tabs. Once earned, earned.

### T3C: User Tabs Profile Auto-Creation

When any tab-earning action occurs for a user who doesn't have a `user_tabs_profile` yet:
- Auto-create with defaults (taster, 0 balance, not seeder)
- Then proceed with the earning logic

This ensures no migration needed for existing users — profiles are created on first interaction.

---

## Phase T4: Weekly Cron Job

Create a scheduled task (or a script that can be run via cron on the VPS) that runs every Monday at 00:00 UTC.

### `scripts/weekly-tabs-eval.js`

```
For each user_tabs_profile:
  1. Count their activity this past week:
     - ratings_count from ratings WHERE user_id AND created_at in past week
     - reviews_count from ratings WHERE user_id AND notes IS NOT NULL AND length(notes) >= 10 AND created_at in past week
     - contributions_count from beer_submissions WHERE submitted_by AND status='approved' AND reviewed_at in past week
  
  2. Maintenance check (2 ratings minimum):
     - If met: weeks_inactive = 0, update last_active_week
     - If not met: weeks_inactive += 1
     - If weeks_inactive >= 4: demote one tier (if not already taster), reset weeks_inactive, create notification
  
  3. Progression check:
     - Look up NEXT tier's requirements
     - If current week's activity meets those requirements: current_streak_weeks += 1
     - If current_streak_weeks >= next tier's required_consecutive_weeks: PROMOTE, reset streak, create notification
     - If activity doesn't meet next tier requirements: reset current_streak_weeks to 0
  
  4. Reset weekly counters:
     - ratings_this_week = 0
     - week_start = NOW()
  
  5. Generate weekly summary notification with tabs earned this week
```

**Run via cron:**
```bash
# Add to VPS crontab
0 0 * * 1 docker exec supabase-db psql -U postgres -d postgres -f /path/to/weekly-eval.sql
# OR run as Node script:
0 0 * * 1 cd /path/to/scripts && node weekly-tabs-eval.js
```

**Also create a mid-week check (Thursday) for streak-at-risk notifications:**
```bash
0 0 * * 4 cd /path/to/scripts && node streak-risk-check.js
```

---

## Constraints

- **Do NOT modify** existing table structures except adding `price_cents` to `ratings`
- **Do NOT delete** any existing data during this implementation  
- **All tab calculations happen server-side** — never trust client-provided tab amounts
- **Multipliers are applied at earn-time** and stored on the transaction — if a user's tier changes later, historical transactions are not recalculated
- **Rounding:** Always `Math.round()` after applying multipliers. A fraction of a tab rounds to the nearest whole tab.
- **Week definition:** Monday 00:00 UTC to Sunday 23:59 UTC
- **The first 10 ratings per week earn tabs. Ratings 11+ earn nothing.** This is the single most important business rule.
