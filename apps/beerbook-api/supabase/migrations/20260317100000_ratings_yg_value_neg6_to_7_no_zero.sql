-- YG scale: -6 to +7, zero not allowed. Align with API validation.
ALTER TABLE ratings
  DROP CONSTRAINT IF EXISTS ratings_yg_value_check;

ALTER TABLE ratings
  ADD CONSTRAINT ratings_yg_value_check
  CHECK (yg_value IS NULL OR (
    yg_value >= -6 AND yg_value <= 7 AND yg_value != 0
  ));

COMMENT ON COLUMN ratings.yg_value IS 'YG scale -6 to +7; zero is not a valid option.';
