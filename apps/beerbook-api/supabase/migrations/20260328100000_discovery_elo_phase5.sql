-- Phase 5: Discovery — wire Elo into search and browse.
-- 1) Extend search_beer_catalog to return global_elo and comparison_count (LEFT JOIN beer_elo_ratings).
-- 2) Create view beers_with_elo for browse sort=power_score (beers + global_elo, comparison_count).

SET search_path = public;

-- 1) search_beer_catalog: add global_elo and comparison_count to result
DROP FUNCTION IF EXISTS search_beer_catalog(text, integer);
CREATE OR REPLACE FUNCTION search_beer_catalog(search_term TEXT, max_results INTEGER DEFAULT 10)
RETURNS TABLE (
  id TEXT,
  name TEXT,
  brewery_name TEXT,
  style TEXT,
  style_category TEXT,
  abv DECIMAL(4,2),
  review_overall DECIMAL(4,2),
  review_count INTEGER,
  source TEXT,
  similarity_score REAL,
  global_elo INTEGER,
  comparison_count INTEGER
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id::TEXT,
    b.name,
    b.brewery_name,
    b.style,
    b.style_category,
    b.abv,
    b.review_overall,
    b.review_count,
    b.source,
    greatest(
      similarity(b.name, search_term),
      similarity(b.brewery_name || ' ' || b.name, search_term)
    )::REAL AS similarity_score,
    e.global_elo,
    e.comparison_count
  FROM beers b
  LEFT JOIN beer_elo_ratings e ON e.beer_id = b.id
  WHERE
    b.name ILIKE search_term || '%'
    OR (b.brewery_name || ' ' || b.name) ILIKE '%' || search_term || '%'
    OR b.brewery_name ILIKE search_term || '%'
    OR similarity(b.name, search_term) > 0.3
  ORDER BY
    CASE WHEN b.name ILIKE search_term || '%' THEN 0 ELSE 1 END,
    greatest(similarity(b.name, search_term), similarity(b.brewery_name || ' ' || b.name, search_term)) DESC,
    b.review_count DESC NULLS LAST
  LIMIT max_results;
END;
$$;

GRANT EXECUTE ON FUNCTION search_beer_catalog(TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION search_beer_catalog(TEXT, INTEGER) TO service_role;

COMMENT ON FUNCTION search_beer_catalog IS 'Catalog search with trigram/similarity; returns global_elo and comparison_count when present (Phase 5 discovery).';

-- 2) View for browse with sort by Power Score (global_elo)
CREATE OR REPLACE VIEW beers_with_elo AS
SELECT
  b.*,
  e.global_elo,
  e.comparison_count
FROM beers b
LEFT JOIN beer_elo_ratings e ON e.beer_id = b.id;

COMMENT ON VIEW beers_with_elo IS 'Beers with Elo columns for discovery browse sort=power_score (Phase 5).';

GRANT SELECT ON beers_with_elo TO service_role;
