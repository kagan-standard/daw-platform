-- ============================================
-- Add venue_type to venues (idempotent)
-- Run: docker exec -i supabase-db psql -U postgres -d postgres \
--   < apps/beerbook/docs/migration-venue-type.sql
-- ============================================

ALTER TABLE venues
    ADD COLUMN IF NOT EXISTS venue_type TEXT
    CHECK (venue_type IN ('brewery', 'bar', 'restaurant')
           OR venue_type IS NULL);

CREATE INDEX IF NOT EXISTS idx_venues_type ON venues(venue_type);
