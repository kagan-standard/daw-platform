-- New beer via rating flow + tabs multiplier support.
-- Safe to run multiple times.

ALTER TABLE tab_transactions
ADD COLUMN IF NOT EXISTS new_beer_multiplier NUMERIC(3,2) DEFAULT 1.0;

ALTER TABLE beers
ADD COLUMN IF NOT EXISTS submitted_by TEXT;

ALTER TABLE beers
ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_beers_name_trgm ON beers USING gin (LOWER(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_beers_brewery_trgm ON beers USING gin (LOWER(brewery_name) gin_trgm_ops);

CREATE OR REPLACE FUNCTION validate_new_beer_matches(
  p_name TEXT,
  p_brewery TEXT,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  id TEXT,
  name TEXT,
  brewery_name TEXT,
  style TEXT,
  abv DECIMAL(4,2),
  name_sim REAL,
  brewery_sim REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id::TEXT,
    b.name,
    b.brewery_name,
    b.style,
    b.abv,
    similarity(LOWER(b.name), LOWER(p_name))::REAL AS name_sim,
    similarity(LOWER(COALESCE(b.brewery_name, '')), LOWER(COALESCE(p_brewery, '')))::REAL AS brewery_sim
  FROM beers b
  WHERE similarity(LOWER(b.name), LOWER(p_name)) > 0.4
  ORDER BY similarity(LOWER(b.name), LOWER(p_name)) DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5), 20));
END;
$$ LANGUAGE plpgsql STABLE;
