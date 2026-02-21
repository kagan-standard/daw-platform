# Phase 3.0 — Crews & Follows

Apply `cursor/prompts/00_system.md` rules.

**Prerequisite:** Phase 2.4 must be deployed and verified. All social features (profiles, cheers, leaderboard) must be working.

## Context Files (read before writing code)
- `ARCHITECTURE.md`
- `DECISIONS.md` (includes new "Crews & Follows Decision" section)
- `apps/beerbook/docs/database-schema.sql` (current schema)
- `apps/beerbook-api/server.js` (current API)
- `apps/beerbook/index.html` (current frontend)
- `apps/beerbook/app.js` (current state)
- `apps/beerbook/supabase.js` (current state)
- `apps/beerbook/profiles.js` (current state)
- `apps/beerbook/styles.css` (current state)

## Goal

Add a two-layer social graph to BeerBook: lightweight **follows** for discovery, and mutual **crews** for your drinking buddies. Crew content is prioritized (not filtered) in feeds. After this phase, users can follow reviewers, create/join crews via invite codes, and see their crew's activity bubbled to the top of every feed.

**Do NOT modify existing table schemas. New tables only. All existing endpoints continue to work unchanged.**

---

## Task 1: Database Migration

Create `apps/beerbook/docs/migration-3.0.sql` — a single, idempotent migration file.

### 1A: Create `follows` table

```sql
CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT NOT NULL,
    followed_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (follower_id, followed_id),
    CHECK (follower_id != followed_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_followed ON follows(followed_id);
GRANT SELECT ON follows TO anon;
```

### 1B: Create `crews` table

```sql
CREATE TABLE IF NOT EXISTS crews (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    name TEXT NOT NULL CHECK (char_length(name) <= 50),
    created_by TEXT NOT NULL,
    invite_code TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crews_invite_code ON crews(invite_code);
CREATE INDEX IF NOT EXISTS idx_crews_created_by ON crews(created_by);
GRANT SELECT ON crews TO anon;
```

### 1C: Create `crew_members` table

```sql
CREATE TABLE IF NOT EXISTS crew_members (
    crew_id TEXT NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (crew_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_crew_members_user ON crew_members(user_id);
CREATE INDEX IF NOT EXISTS idx_crew_members_crew ON crew_members(crew_id);
GRANT SELECT ON crew_members TO anon;
```

### 1D: Useful views

```sql
-- Crew summary with member count
CREATE OR REPLACE VIEW crew_summary AS
SELECT
    c.id,
    c.name,
    c.created_by,
    c.invite_code,
    c.created_at,
    COUNT(cm.user_id) AS member_count
FROM crews c
LEFT JOIN crew_members cm ON cm.crew_id = c.id
GROUP BY c.id, c.name, c.created_by, c.invite_code, c.created_at;

GRANT SELECT ON crew_summary TO anon;

-- Follow counts per user
CREATE OR REPLACE VIEW follow_counts AS
SELECT
    p.id AS user_id,
    COALESCE(fr.follower_count, 0) AS follower_count,
    COALESCE(fg.following_count, 0) AS following_count
FROM profiles p
LEFT JOIN (
    SELECT followed_id, COUNT(*) AS follower_count FROM follows GROUP BY followed_id
) fr ON fr.followed_id = p.id
LEFT JOIN (
    SELECT follower_id, COUNT(*) AS following_count FROM follows GROUP BY follower_id
) fg ON fg.follower_id = p.id;

GRANT SELECT ON follow_counts TO anon;
```

### 1E: Update canonical schema

After migration runs, update `apps/beerbook/docs/database-schema.sql` to include the new tables and views.

### Acceptance Criteria — Task 1
- [ ] Migration is idempotent (safe to run twice)
- [ ] All tables created with correct constraints
- [ ] Views return data (even if empty)
- [ ] Existing tables unmodified

### Validation
```bash
docker exec -i supabase-db psql -U postgres -d postgres < apps/beerbook/docs/migration-3.0.sql
docker exec supabase-db psql -U postgres -d postgres -c '\dt'
docker exec supabase-db psql -U postgres -d postgres -c 'SELECT * FROM crew_summary LIMIT 1;'
docker exec supabase-db psql -U postgres -d postgres -c 'SELECT * FROM follow_counts LIMIT 1;'
```

### Rollback — Task 1
```sql
DROP VIEW IF EXISTS follow_counts;
DROP VIEW IF EXISTS crew_summary;
DROP TABLE IF EXISTS crew_members;
DROP TABLE IF EXISTS crews;
DROP TABLE IF EXISTS follows;
```

---

## Task 2: Follow API Endpoints

Add to `server.js` (or split into `routes/follows.js` if server.js exceeds 500 lines).

### 2A: Toggle follow

```
POST /api/follows/:userId
```
- Auth required
- If already following → unfollow (DELETE), return `{ following: false }`
- If not following → follow (INSERT), return `{ following: true }`
- Cannot follow yourself → 400
- Upsert pattern: attempt INSERT, on conflict DELETE

### 2B: Get followers

```
GET /api/follows/:userId/followers?limit=50&offset=0
```
- Public (no auth required)
- Returns paginated list: `{ data: [{ id, display_name, avatar_url }], pagination: {...} }`
- Join with `profiles` to get display info

### 2C: Get following

```
GET /api/follows/:userId/following?limit=50&offset=0
```
- Public
- Same shape as followers

### 2D: Check follow status

```
GET /api/follows/:userId/status
```
- Auth required
- Returns `{ is_following: boolean }`
- Used by frontend to show follow/unfollow button state

### 2E: Get follow counts

```
GET /api/users/:id/stats
```
- **Extend existing endpoint** — add `follower_count`, `following_count`, `crew_count` to the response
- Pull from `follow_counts` view and `crew_members` table

### Acceptance Criteria — Task 2
- [ ] `POST /api/follows/:userId` toggles correctly
- [ ] Cannot follow self
- [ ] Followers/following lists paginate correctly
- [ ] Status endpoint returns correct boolean
- [ ] User stats include social counts

### Validation
```bash
# Follow a user (with valid token)
curl -X POST https://api.beerbook.drinksafterwork.net/api/follows/USER_ID -H "Authorization: Bearer TOKEN"

# Check status
curl https://api.beerbook.drinksafterwork.net/api/follows/USER_ID/status -H "Authorization: Bearer TOKEN"

# Get followers
curl https://api.beerbook.drinksafterwork.net/api/follows/USER_ID/followers
```

---

## Task 3: Crew API Endpoints

Add to `server.js` (or split into `routes/crews.js`).

### 3A: Create crew

```
POST /api/crews
Body: { "name": "The Thursday Crew" }
```
- Auth required
- Generate 6-character alphanumeric invite code (uppercase, e.g., `BK7M2X`)
- Insert into `crews` table
- Auto-add creator to `crew_members` with role `owner`
- Return full crew object with invite_code

Invite code generation:
```javascript
function generateInviteCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}
```
Retry on unique constraint violation (up to 3 attempts).

### 3B: List my crews

```
GET /api/crews
```
- Auth required
- Returns crews where current user is a member
- Include member_count from `crew_summary` view
- Include user's role in each crew

### 3C: Crew detail

```
GET /api/crews/:id
```
- Auth required (must be a member)
- Returns: crew info + full member list with profiles + crew stats
- Crew stats: total ratings by members, avg rating, most popular style, top beer

### 3D: Update crew

```
PATCH /api/crews/:id
Body: { "name": "New Name" }
```
- Auth required (owner only)
- Update name, set updated_at

### 3E: Delete crew

```
DELETE /api/crews/:id
```
- Auth required (owner only)
- Cascades to crew_members
- Return 204

### 3F: Regenerate invite code

```
POST /api/crews/:id/regenerate-code
```
- Auth required (owner only)
- Generate new code, invalidate old one
- Return `{ invite_code: "NEW123" }`

### 3G: Join crew

```
POST /api/crews/join
Body: { "invite_code": "BK7M2X" }
```
- Auth required
- Case-insensitive code lookup (UPPER() on input)
- Check crew exists → 404 if not
- Check not already a member → 409 if so
- Check crew member count < 50 → 403 if full
- Insert into crew_members with role 'member'
- Return crew object

### 3H: Leave crew / remove member

```
DELETE /api/crews/:id/members/:userId
```
- Auth required
- If userId === self → leave crew (any member can leave)
- If userId !== self → must be owner (removing someone else)
- Owner cannot remove themselves (must delete crew or transfer — Phase 3.0 just requires delete)
- If last member leaves → auto-delete crew
- Return 204

### Acceptance Criteria — Task 3
- [ ] Full CRUD on crews works
- [ ] Invite codes are unique, case-insensitive
- [ ] Crew join with valid code works
- [ ] Crew join with invalid/expired code → 404
- [ ] Owner-only operations reject non-owners
- [ ] Member cap of 50 enforced
- [ ] Crew delete cascades to members

### Validation
```bash
# Create crew
curl -X POST https://api.beerbook.drinksafterwork.net/api/crews \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Crew"}'

# Join crew
curl -X POST https://api.beerbook.drinksafterwork.net/api/crews/join \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"invite_code":"ABC123"}'

# List my crews
curl https://api.beerbook.drinksafterwork.net/api/crews -H "Authorization: Bearer TOKEN"
```

---

## Task 4: Feed Filtering API

Extend existing rating and activity endpoints with optional feed filtering.

### 4A: Ratings feed filter

Extend `GET /api/ratings` with optional query params:
```
GET /api/ratings?feed=crew&crew_id=CREW_ID    → only ratings from crew members
GET /api/ratings?feed=following                → only ratings from followed users
GET /api/ratings                               → all ratings (unchanged default)
```

Implementation:
- `feed=crew&crew_id=X`: JOIN ratings with crew_members WHERE crew_id = X
- `feed=following`: JOIN ratings with follows WHERE follower_id = current_user
- No feed param: existing behavior, unchanged

### 4B: Activity feed filter

Extend `GET /api/activity` with same params:
```
GET /api/activity?feed=crew&crew_id=CREW_ID
GET /api/activity?feed=following
GET /api/activity
```

### 4C: Crew leaderboard

Extend existing leaderboard/stats logic:
```
GET /api/stats?crew_id=CREW_ID → stats scoped to crew members only
```

### Acceptance Criteria — Task 4
- [ ] Default behavior unchanged (no feed param = global)
- [ ] `feed=crew` returns only crew member ratings
- [ ] `feed=following` returns only followed user ratings
- [ ] Crew leaderboard scoped correctly
- [ ] Empty results return empty array, not error

---

## Task 5: Follow UI (`social.js`)

Create `apps/beerbook/social.js` — new file.

Add `<script src="social.js"></script>` to index.html.

### 5A: Follow button on profiles

Add to user profile view (from `profiles.js`):
- "Follow" / "Following" toggle button next to username
- Clicking toggles follow state via `POST /api/follows/:userId`
- Button states: "Follow" (outline), "Following" (filled), hover on "Following" shows "Unfollow" (red)
- Don't show follow button on own profile
- Update follower/following counts on profile immediately (optimistic UI)

### 5B: Follow button on rating cards

Add a small follow icon/button on rating cards in the activity feed and browse view:
- Only visible on hover (desktop) or as a subtle icon (mobile)
- Clicking follows that reviewer
- If already following, icon is filled/highlighted
- Don't show on own ratings

### 5C: Social counts on profile header

Update profile header to show:
```
47 ratings · 12 followers · 8 following · 2 crews
```
Data from extended `/api/users/:id/stats` endpoint.

### 5D: Following/Followers lists

Add tabs to profile view:
- "Ratings" (existing, default)
- "Following" (list of profiles user follows)
- "Followers" (list of profiles following user)

Each item in the list: avatar, display name, rating count, follow/unfollow button.

### Acceptance Criteria — Task 5
- [ ] Follow/unfollow works from profile and rating cards
- [ ] Button states update correctly
- [ ] Counts update optimistically
- [ ] Own profile doesn't show follow button
- [ ] Follower/following lists render and paginate

---

## Task 6: Crew UI (`crews.js`)

Create `apps/beerbook/crews.js` — new file.

Add `<script src="crews.js"></script>` to index.html.

### 6A: Crew section in navigation

Add "Crews" to the nav bar (between Leaderboard and Profile, or as a subsection of Profile).

Icon suggestion: 👥 or 🍻

### 6B: My Crews view

New view `view-crews` (or section within profile):

```
┌────────────────────────────────────────┐
│  My Crews                              │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ 🍻 The Thursday Crew     8/50   │  │
│  │ You + 7 others · Owner          │  │
│  │ This week: 12 ratings, avg 3.8★ │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │ 🍻 College Buddies       4/50   │  │
│  │ You + 3 others · Member         │  │
│  │ This week: 3 ratings, avg 4.2★  │  │
│  └──────────────────────────────────┘  │
│                                        │
│  [+ Create Crew]  [Join with Code]     │
└────────────────────────────────────────┘
```

### 6C: Create crew modal

- Input: Crew name (max 50 chars)
- On create → POST /api/crews → show invite code prominently
- "Share this code with your crew: **BK7M2X**"
- Copy-to-clipboard button
- Optional: generate shareable link `https://beerbook.drinksafterwork.net?join=BK7M2X`

### 6D: Join crew modal

- Input: 6-character invite code
- On submit → POST /api/crews/join
- Success: navigate to crew detail
- Invalid code: toast error "Invalid invite code"
- Already a member: toast "You're already in this crew!"
- Crew full: toast "This crew is full (50/50)"

### 6E: Crew detail view

Clicking a crew card opens crew detail:

```
┌────────────────────────────────────────┐
│ ← Back                                 │
│                                        │
│ The Thursday Crew                      │
│ 8 members · Created by SamBrews       │
│ Invite code: BK7M2X [📋 Copy]         │
│                                        │
│ ┌──────────────────────────────────┐   │
│ │ Crew Stats                       │   │
│ │ 87 total ratings · avg 3.9★     │   │
│ │ Top style: IPA · Top beer: Pliny│   │
│ └──────────────────────────────────┘   │
│                                        │
│ Members                                │
│ 👑 SamBrews (owner)      24 ratings   │
│ 🍺 JessTheHopHead        18 ratings   │
│ 🍺 MikeStout             12 ratings   │
│ ...                        [Remove]   │
│                                        │
│ Recent Crew Activity                   │
│ [rating cards from crew members only]  │
│                                        │
│ [⚙️ Settings] (owner only)             │
│   Rename · Regenerate Code · Delete    │
│                                        │
│ [🚪 Leave Crew]                        │
└────────────────────────────────────────┘
```

### 6F: Crew settings (owner only)

- Rename crew: inline edit or modal
- Regenerate invite code: confirm dialog ("Old code will stop working")
- Remove member: confirm dialog
- Delete crew: confirm dialog ("This will remove all members")

### Acceptance Criteria — Task 6
- [ ] Create crew works, shows invite code
- [ ] Join with valid code works
- [ ] Crew detail shows members and stats
- [ ] Owner can rename, regenerate code, remove members, delete
- [ ] Members can leave
- [ ] Crew card shows summary stats

---

## Task 7: Feed Prioritization (Frontend)

### 7A: Social data caching

On app load (after auth), fetch and cache locally:
- `GET /api/crews` → list of user's crews + member user_ids
- `GET /api/follows/:myId/following` → list of followed user_ids

Store in `App.socialGraph`:
```javascript
App.socialGraph = {
    crewMemberIds: new Set([...]),  // all user_ids across all my crews
    followingIds: new Set([...]),    // all user_ids I follow
    myCrews: [...]                   // crew objects with member lists
};
```

Refresh on: follow/unfollow, join/leave crew, app focus.

### 7B: Tag ratings in existing renders

In `renderRecentReviews()`, `renderBrowse()`, `renderActivityFeed()`:
1. Check each rating's `user_id` against `App.socialGraph`
2. Add CSS class: `review-card--crew`, `review-card--following`, or default
3. Sort: crew first, then following, then global (within each group, keep date order)

### 7C: Visual treatment

```css
.review-card--crew {
    border-left: 3px solid var(--amber);
    background: rgba(230, 168, 23, 0.05);
}
.review-card--crew::before {
    content: '🍻 Crew';
    font-size: 0.7rem;
    color: var(--amber);
    font-weight: 600;
    display: block;
    margin-bottom: 4px;
}

.review-card--following {
    border-left: 3px solid var(--blue, #5b9bd5);
}
.review-card--following::before {
    content: '👤 Following';
    font-size: 0.7rem;
    color: var(--blue, #5b9bd5);
    font-weight: 600;
    display: block;
    margin-bottom: 4px;
}
```

### 7D: Feed filter tabs

Add filter tabs above the activity feed and browse view:
```
[All] [Crew] [Following]
```
- "All" = default, prioritized sort (crew → following → global)
- "Crew" = only crew members' ratings (calls `?feed=crew&crew_id=X`, or filters client-side)
- "Following" = only followed users' ratings

If user has multiple crews, "Crew" shows a dropdown to select which crew.

### 7E: Leaderboard crew tab

Add "My Crew" tab to leaderboard alongside All Time / Monthly / Weekly:
```
[All Time] [Monthly] [Weekly] [My Crew ▾]
```
"My Crew" dropdown selects which crew to scope stats to.

### Acceptance Criteria — Task 7
- [ ] Crew ratings appear first with amber highlight
- [ ] Following ratings appear second with blue indicator
- [ ] Global ratings appear after, no decoration
- [ ] Feed tabs filter correctly
- [ ] Leaderboard crew tab scopes to selected crew
- [ ] Social graph refreshes on mutations

---

## Task 8: Demo Mode Extension

Extend `sample-data.js` to seed follows and crews for demo mode:
- Create 1 demo crew ("The Demo Crew") with 3 of the 5 sample users
- Create follow relationships between sample users
- Ensure feed prioritization is visible in demo

### Acceptance Criteria — Task 8
- [ ] Demo mode shows crew/follow UI
- [ ] Feed prioritization visible with sample data
- [ ] Create/join crew works in demo mode (localStorage)

---

## Task 9: Crew Invite Deep Link

Handle `?join=CODE` URL parameter:
- On page load, if `?join=CODE` is present:
  - If logged in → auto-open join modal with code pre-filled
  - If not logged in → store code in sessionStorage, redirect to login, then join after auth callback

### Acceptance Criteria — Task 9
- [ ] Direct link `?join=BK7M2X` opens join flow
- [ ] Works for both logged-in and logged-out users
- [ ] Invalid codes show appropriate error

---

## Task 10: Mobile Polish

- Crew cards stack vertically on mobile
- Follow buttons are touch-friendly (min 44px tap target)
- Crew invite code has large copy button on mobile
- Feed filter tabs are horizontally scrollable on narrow screens
- Crew detail member list is scrollable

---

## Task 11: Data Caching Updates

Extend the existing client-side cache (`supabase.js`):
- Follows list: 120s TTL
- Crews list: 120s TTL
- Crew detail: 60s TTL
- Invalidate on: follow/unfollow, join/leave/create crew

---

## Task 12: Final Smoke Test

1. [ ] Create crew → invite code displayed
2. [ ] Share code → second user joins successfully
3. [ ] Crew detail shows both members
4. [ ] Second user rates a beer → appears with "🍻 Crew" badge in first user's feed
5. [ ] Follow a non-crew user → their ratings show "👤 Following" badge
6. [ ] Global ratings appear below crew and following
7. [ ] Feed tabs filter correctly (All / Crew / Following)
8. [ ] Leaderboard "My Crew" tab shows crew-scoped stats
9. [ ] Unfollow → badge disappears on next refresh
10. [ ] Leave crew → crew ratings demoted to global
11. [ ] Owner removes member → member loses crew view
12. [ ] Regenerate invite code → old code stops working
13. [ ] Delete crew → all members lose crew
14. [ ] Deep link `?join=CODE` works for logged-in user
15. [ ] Deep link works for logged-out user (join after login)
16. [ ] Demo mode: crew/follow features work with sample data
17. [ ] Mobile: all crew UI is responsive and touch-friendly
18. [ ] No regressions: existing features (rating, browse, map, exchange, profiles, cheers) all work

---

## Agent Assumption Log

| Date | Task | Assumption | Rationale |
|------|------|------------|-----------|
| 2026-02-20 | Tasks 1-12 | Feed filters and crew leaderboard can be implemented client-side first, using optional API scopes as additive support. | Decision section explicitly sets client-side prioritization for this phase; avoids changing existing default endpoint behavior. |
| 2026-02-20 | Task 1 | Backup commands are documented and migration file is prepared, but migration execution is environment-specific and not run from this workspace. | System rules require VPS-targeted operations and backup-first; local agent only safely updates code artifacts. |
