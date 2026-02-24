-- ============================================
-- Brewery search (trigram + aliases)
-- Run: docker exec -i supabase-db psql -U postgres -d postgres < apps/beerbook/docs/migration-brewery-search.sql
-- Requires: pg_trgm extension, breweries, brewery_aliases
-- ============================================

CREATE OR REPLACE FUNCTION search_breweries(search_term TEXT, max_results INTEGER DEFAULT 10)
RETURNS TABLE (
  id TEXT,
  name TEXT,
  slug TEXT,
  city TEXT,
  state TEXT,
  brewery_type TEXT,
  logo_url TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  verified BOOLEAN,
  similarity_score REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT sub.id, sub.name, sub.slug, sub.city, sub.state, sub.brewery_type, sub.logo_url,
    sub.latitude, sub.longitude, sub.verified, sub.sim
  FROM (
    SELECT DISTINCT ON (b.id)
      b.id::TEXT AS id,
      b.name,
      b.slug,
      b.city,
      b.state,
      b.brewery_type,
      b.logo_url,
      b.latitude,
      b.longitude,
      b.verified,
      greatest(
        similarity(b.name, search_term),
        COALESCE((SELECT MAX(similarity(ba.alias_name, search_term)) FROM brewery_aliases ba WHERE ba.brewery_id = b.id), 0)
      )::REAL AS sim
    FROM breweries b
    WHERE b.name ILIKE search_term || '%'
      OR b.name ILIKE '%' || search_term || '%'
      OR (b.normalized_name IS NOT NULL AND b.normalized_name ILIKE '%' || lower(search_term) || '%')
      OR similarity(b.name, search_term) > 0.3
      OR b.id IN (
        SELECT ba.brewery_id FROM brewery_aliases ba
        WHERE ba.alias_name ILIKE search_term || '%' OR similarity(ba.alias_name, search_term) > 0.3
      )
    ORDER BY b.id,
      CASE WHEN b.name ILIKE search_term || '%' THEN 0 ELSE 1 END,
      greatest(
        similarity(b.name, search_term),
        COALESCE((SELECT MAX(similarity(ba.alias_name, search_term)) FROM brewery_aliases ba WHERE ba.brewery_id = b.id), 0)
      ) DESC,
      b.name ASC
  ) sub
  ORDER BY
    CASE WHEN sub.name ILIKE search_term || '%' THEN 0 ELSE 1 END,
    sub.sim DESC,
    sub.name ASC
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION search_breweries(TEXT, INTEGER) TO anon;
