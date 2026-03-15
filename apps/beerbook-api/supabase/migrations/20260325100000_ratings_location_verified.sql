-- Venue check-in verification: set when device coords are within threshold of venue at create time.
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS location_verified BOOLEAN DEFAULT false;

COMMENT ON COLUMN ratings.location_verified IS 'True only when submitted device coordinates were within configured distance of the linked venue at create time. Used for crew-visited pins and first_venue_visit milestones.';
