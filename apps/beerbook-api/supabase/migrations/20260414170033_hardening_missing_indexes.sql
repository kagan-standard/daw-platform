BEGIN;

CREATE INDEX IF NOT EXISTS idx_ratings_user_id_created_at_desc
  ON ratings (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ratings_venue_id
  ON ratings (venue_id)
  WHERE venue_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reactions_user_id
  ON reactions (user_id);

CREATE INDEX IF NOT EXISTS idx_profiles_created_at
  ON profiles (created_at);

COMMIT;
