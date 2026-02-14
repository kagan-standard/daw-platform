-- ============================================
-- BeerBook — Supabase Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============ PROFILES TABLE ============
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL DEFAULT 'Beer Lover',
    email TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ RATINGS TABLE ============
CREATE TABLE IF NOT EXISTS ratings (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL DEFAULT 'Anonymous',
    beer_name TEXT NOT NULL,
    brewery TEXT DEFAULT '',
    style TEXT NOT NULL,
    abv DECIMAL(4,1),
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    flavor_hoppy INTEGER DEFAULT 0 CHECK (flavor_hoppy >= 0 AND flavor_hoppy <= 5),
    flavor_malty INTEGER DEFAULT 0 CHECK (flavor_malty >= 0 AND flavor_malty <= 5),
    flavor_bitter INTEGER DEFAULT 0 CHECK (flavor_bitter >= 0 AND flavor_bitter <= 5),
    flavor_sweet INTEGER DEFAULT 0 CHECK (flavor_sweet >= 0 AND flavor_sweet <= 5),
    flavor_fruity INTEGER DEFAULT 0 CHECK (flavor_fruity >= 0 AND flavor_fruity <= 5),
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_ratings_user_id ON ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_beer_name ON ratings(beer_name);
CREATE INDEX IF NOT EXISTS idx_ratings_style ON ratings(style);
CREATE INDEX IF NOT EXISTS idx_ratings_created_at ON ratings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ratings_rating ON ratings(rating);

-- ============ ROW LEVEL SECURITY ============

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read all profiles, update their own
CREATE POLICY "Profiles are viewable by everyone"
    ON profiles FOR SELECT
    USING (true);

CREATE POLICY "Users can insert their own profile"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- Ratings: everyone can read, authenticated users can insert, users can delete their own
CREATE POLICY "Ratings are viewable by everyone"
    ON ratings FOR SELECT
    USING (true);

CREATE POLICY "Authenticated users can insert ratings"
    ON ratings FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update their own ratings"
    ON ratings FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ratings"
    ON ratings FOR DELETE
    USING (auth.uid() = user_id);

-- ============ REALTIME ============
-- Enable realtime for ratings table
ALTER PUBLICATION supabase_realtime ADD TABLE ratings;

-- ============ AUTO-UPDATE TIMESTAMP ============
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============ HELPER VIEW: BEER AVERAGES ============
CREATE OR REPLACE VIEW beer_averages AS
SELECT
    beer_name,
    brewery,
    style,
    COUNT(*) as review_count,
    ROUND(AVG(rating)::numeric, 2) as avg_rating,
    ROUND(AVG(flavor_hoppy)::numeric, 1) as avg_hoppy,
    ROUND(AVG(flavor_malty)::numeric, 1) as avg_malty,
    ROUND(AVG(flavor_bitter)::numeric, 1) as avg_bitter,
    ROUND(AVG(flavor_sweet)::numeric, 1) as avg_sweet,
    ROUND(AVG(flavor_fruity)::numeric, 1) as avg_fruity,
    MAX(created_at) as last_reviewed
FROM ratings
GROUP BY beer_name, brewery, style
ORDER BY avg_rating DESC;
