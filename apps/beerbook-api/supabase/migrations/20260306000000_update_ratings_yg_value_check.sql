-- Align ratings.yg_value DB constraint with API validation (0-12 integer scale).
ALTER TABLE ratings
  DROP CONSTRAINT IF EXISTS ratings_yg_value_check;

ALTER TABLE ratings
  ADD CONSTRAINT ratings_yg_value_check
  CHECK (yg_value >= 0 AND yg_value <= 12);
