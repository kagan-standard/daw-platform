-- ============================================
-- Phase 3.0 — Crews & Follows (idempotent)
-- Backup database before running:
--   docker exec supabase-db pg_dump -U postgres -d postgres -Fc -f /tmp/beerbook-pre-3_0.dump
--   docker cp supabase-db:/tmp/beerbook-pre-3_0.dump ./apps/beerbook/docs/beerbook-pre-3_0.dump
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1A: Follows
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

-- 1B: Crews
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

-- 1C: Crew members
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

-- 1D: Useful views
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

CREATE OR REPLACE VIEW follow_counts AS
SELECT
    p.id AS user_id,
    COALESCE(fr.follower_count, 0) AS follower_count,
    COALESCE(fg.following_count, 0) AS following_count
FROM profiles p
LEFT JOIN (
    SELECT followed_id, COUNT(*) AS follower_count
    FROM follows
    GROUP BY followed_id
) fr ON fr.followed_id = p.id
LEFT JOIN (
    SELECT follower_id, COUNT(*) AS following_count
    FROM follows
    GROUP BY follower_id
) fg ON fg.follower_id = p.id;
GRANT SELECT ON follow_counts TO anon;
