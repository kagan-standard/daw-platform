-- Canonical YG scale: -1 or 1–10 in 0.5 steps (no 0).
-- Backfills legacy -6..-2 → -1; legacy integers 1..7 → linear map 1 + (old-1)*1.5;
-- syncs internal star rating via locked linear map: clamp(1, round(1 + (yg+1)*4/11), 5).
-- Pre-migration shape note: expect yg_value in [-6,-5,-4,-3,-2,-1] ∪ [1..7] for user_submitted/import rows (see 20260317100000).

ALTER TABLE ratings
  DROP CONSTRAINT IF EXISTS ratings_yg_value_check;

-- Backfill yg_value (non-null only).
UPDATE ratings
SET yg_value = (
  CASE
    WHEN yg_value IN (-6, -5, -4, -3, -2) THEN -1::numeric
    WHEN yg_value = -1 THEN -1::numeric
    WHEN yg_value IN (1, 2, 3, 4, 5, 6, 7) THEN 1::numeric + (yg_value - 1) * 1.5
    ELSE yg_value
  END
)
WHERE yg_value IS NOT NULL;

-- Align internal 1–5 star column to canonical yg_value (non-null yg only).
UPDATE ratings
SET rating = LEAST(
    5,
    GREATEST(
      1,
      ROUND(1::numeric + (yg_value + 1) * (4::numeric / 11), 0)
    )
  )::integer
WHERE yg_value IS NOT NULL;

ALTER TABLE ratings
  ADD CONSTRAINT ratings_yg_value_check
  CHECK (
    yg_value IS NULL
    OR yg_value = -1
    OR (
      yg_value >= 1
      AND yg_value <= 10
      AND round(yg_value * 2, 0) = yg_value * 2
    )
  );

COMMENT ON COLUMN ratings.yg_value IS
  'Canonical YG scale: -1 (negative review) or 1–10 in half steps (0 invalid). See apps/beerbook-api/docs/API_CONTRACT.md.';

-- Achievement: negative review unlocks at yg_value = -1 (canonical only negative).
UPDATE public.achievements
SET
  description = 'Give a negative review.',
  rules = '{"type":"comparison","field":"yg_value","op":"eq","value":-1}'::jsonb,
  version = 2
WHERE key = 'first_one_star';
