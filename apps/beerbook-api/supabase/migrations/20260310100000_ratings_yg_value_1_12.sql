-- Sprint 1 Backend: YG DB constraint migration.
-- Canonical YG range is 1-12 (frontend MAX_YG = 12). Allow "Legendary" (11) and max (12).
-- Column type unchanged; existing ratings 1-10 unaffected.
-- Optional pre-check for fractional values: SELECT COUNT(*) FROM ratings WHERE yg_value < 1 AND yg_value > 0;

ALTER TABLE ratings
  DROP CONSTRAINT IF EXISTS ratings_yg_value_check;

ALTER TABLE ratings
  ADD CONSTRAINT ratings_yg_value_check
  CHECK (yg_value >= 1 AND yg_value <= 12);
