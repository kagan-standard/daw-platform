-- YG Bidirectional Scale + rating_source (Phase 1).
-- Adds rating_source ('user_submitted' | 'import'), marks existing rows as import,
-- converts import star rating -> YG (-6..+6), and updates yg_value constraint.

-- 1) Add rating_source column (default for new rows)
ALTER TABLE ratings
  ADD COLUMN IF NOT EXISTS rating_source TEXT DEFAULT 'user_submitted';

-- 2) Backfill: treat every existing row at migration time as import
UPDATE ratings SET rating_source = 'import';

-- 3) Optional: enforce NOT NULL and keep default for future inserts
ALTER TABLE ratings
  ALTER COLUMN rating_source SET NOT NULL;
ALTER TABLE ratings
  ALTER COLUMN rating_source SET DEFAULT 'user_submitted';

-- 4) Delete user-submitted (no-op on first run; establishes rule for future)
DELETE FROM ratings WHERE rating_source = 'user_submitted';

-- 5) Drop old YG check (1-12) *before* updating to -6..+6 so UPDATE does not violate it
ALTER TABLE ratings
  DROP CONSTRAINT IF EXISTS ratings_yg_value_check;

-- 6) Convert import star (rating 1-5) -> YG (-6 to +6)
UPDATE ratings
SET yg_value = (
  CASE
    WHEN rating < 2.5 THEN -2
    WHEN rating < 3.0 THEN -1
    WHEN rating < 3.6 THEN 1
    WHEN rating < 3.9 THEN 2
    WHEN rating < 4.2 THEN 3
    WHEN rating < 4.45 THEN 4
    WHEN rating < 4.7 THEN 5
    ELSE 6
  END
)
WHERE rating_source = 'import';

-- 7) Add new YG check: nullable or -6..+6
ALTER TABLE ratings
  ADD CONSTRAINT ratings_yg_value_check
  CHECK (yg_value IS NULL OR (yg_value >= -6 AND yg_value <= 6));
