-- Beer Style Family (Phase 1): populate beers.style_category (9 canonical families),
-- ensure search_beer_catalog returns style_category, and set style_category on insert/update.
-- Canonical families: IPA, Pale Ale, Lager, Stout, Porter, Wheat, Pilsner, Sour, Belgian.
-- Placement: Kölsch → Pale Ale; California Common / Steam → Lager; Porter separate from Stout.

-- 1) Function: map style name to canonical family (one of 9 or NULL).
CREATE OR REPLACE FUNCTION public.style_name_to_family(style_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s TEXT;
BEGIN
  s := NULLIF(TRIM(style_name), '');
  IF s IS NULL THEN RETURN NULL; END IF;
  s := LOWER(s);

  -- Porter before Stout (more specific first)
  IF s LIKE '%porter%' THEN RETURN 'Porter'; END IF;
  IF s LIKE '%stout%' THEN RETURN 'Stout'; END IF;
  IF s LIKE '%ipa%' OR s LIKE '%india pale ale%' THEN RETURN 'IPA'; END IF;
  IF s LIKE '%pilsner%' OR s = 'pils' THEN RETURN 'Pilsner'; END IF;
  IF s LIKE '%lager%' OR s LIKE '%california common%' OR s LIKE '%steam beer%' THEN RETURN 'Lager'; END IF;
  IF s LIKE '%sour%' OR s LIKE '%gose%' OR s LIKE '%lambic%' OR s LIKE '%berliner%' THEN RETURN 'Sour'; END IF;
  IF s LIKE '%wheat%' OR s LIKE '%hefeweizen%' OR s LIKE '%weiss%' OR s LIKE '%witbier%' OR s LIKE '%wit %' THEN RETURN 'Wheat'; END IF;
  IF s LIKE '%belgian%' OR s LIKE '%tripel%' OR s LIKE '%saison%' OR s LIKE '%dubbel%' OR s LIKE '%abbey%' THEN RETURN 'Belgian'; END IF;
  -- Pale Ale: Kölsch, Blonde, Amber, Cream Ale, Golden Ale
  IF s LIKE '%pale ale%' OR s LIKE '%köln%' OR s LIKE '%kolsch%' OR s LIKE '%kölsch%'
     OR s LIKE '%blonde%' OR s LIKE '%amber ale%' OR s LIKE '%cream ale%' OR s LIKE '%golden ale%'
     OR s LIKE '%english pale%' OR s LIKE '%american pale%' THEN RETURN 'Pale Ale'; END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.style_name_to_family IS
  'Maps a beer style name to one of 9 canonical families: IPA, Pale Ale, Lager, Stout, Porter, Wheat, Pilsner, Sour, Belgian.';

-- 2) Backfill beers.style_category: prefer beer_styles.category, else style_name_to_family(style).
UPDATE beers b
SET style_category = COALESCE(
  (SELECT bs.category FROM beer_styles bs WHERE bs.name = b.style LIMIT 1),
  style_name_to_family(b.style)
)
WHERE b.style IS NOT NULL AND (b.style_category IS NULL OR b.style_category = '');

-- Normalize existing style_category to canonical 9 where we have a mapping
UPDATE beers b
SET style_category = style_name_to_family(b.style_category)
WHERE b.style_category IS NOT NULL AND style_name_to_family(b.style_category) IS NOT NULL;

-- 3) Trigger: set style_category on INSERT/UPDATE from beer_styles or mapping.
CREATE OR REPLACE FUNCTION public.beers_set_style_category()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.style IS NOT NULL AND (NEW.style_category IS NULL OR NEW.style_category = '') THEN
    NEW.style_category := COALESCE(
      (SELECT category FROM beer_styles WHERE name = NEW.style LIMIT 1),
      style_name_to_family(NEW.style)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS beers_style_category_trigger ON beers;
CREATE TRIGGER beers_style_category_trigger
  BEFORE INSERT OR UPDATE OF style, style_category ON beers
  FOR EACH ROW EXECUTE FUNCTION beers_set_style_category();

-- 4) search_beer_catalog: add style_category to RETURNS and SELECT.
-- Drop first because return type (RETURNS TABLE) changed; PostgreSQL does not allow REPLACE when signature changes.
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
  similarity_score REAL
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
    )::REAL AS similarity_score
  FROM beers b
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
