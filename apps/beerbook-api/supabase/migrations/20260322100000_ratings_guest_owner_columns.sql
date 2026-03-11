-- Guest ratings (v1): add guest ownership columns and backfill.
-- Run first. Exactly one owner per row: (user_id NOT NULL AND guest_id IS NULL) OR (user_id IS NULL AND guest_id IS NOT NULL).

-- 1) Add columns
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS guest_id TEXT;
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS author_type TEXT;

-- 2) Backfill existing rows (all are user-owned)
UPDATE ratings
SET author_type = 'user', guest_id = NULL
WHERE author_type IS NULL AND user_id IS NOT NULL;

-- 3) Constraint: exactly one owner; author_type consistent
ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_one_owner_check;
ALTER TABLE ratings ADD CONSTRAINT ratings_one_owner_check CHECK (
  (user_id IS NOT NULL AND guest_id IS NULL AND (author_type IS NULL OR author_type = 'user'))
  OR (user_id IS NULL AND guest_id IS NOT NULL AND author_type = 'guest')
);

COMMENT ON COLUMN ratings.guest_id IS 'Client-generated guest ID for unauthenticated ratings. NULL for user-owned rows.';
COMMENT ON COLUMN ratings.author_type IS 'user or guest; must match presence of user_id vs guest_id.';
