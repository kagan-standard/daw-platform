-- Phase 4: Inferred Taste Profile from Rated Styles
-- When users skip flavor sliders, infer flavor tendencies from the styles of
-- beers they rate highly, weighted by rating score.

--------------------------------------------------------------------------------
-- Table: style_flavor_map
-- Maps lowercase style keywords to canonical flavor profiles (0–5 scale).
-- Used by compute_inferred_flavors() to build a weighted taste profile.
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS style_flavor_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  style_keyword TEXT NOT NULL UNIQUE,
  hoppy NUMERIC(3,1) NOT NULL DEFAULT 0,
  malty NUMERIC(3,1) NOT NULL DEFAULT 0,
  bitter NUMERIC(3,1) NOT NULL DEFAULT 0,
  sweet NUMERIC(3,1) NOT NULL DEFAULT 0,
  fruity NUMERIC(3,1) NOT NULL DEFAULT 0
);

INSERT INTO style_flavor_map (style_keyword, hoppy, malty, bitter, sweet, fruity) VALUES
  ('ipa',        4.5, 1.5, 4.0, 0.5, 1.5),
  ('india pale', 4.5, 1.5, 4.0, 0.5, 1.5),
  ('pale ale',   3.5, 2.0, 3.0, 1.0, 1.5),
  ('stout',      1.0, 4.5, 2.5, 2.0, 0.5),
  ('porter',     1.0, 4.0, 2.0, 2.0, 0.5),
  ('lager',      1.5, 2.5, 1.5, 1.5, 0.5),
  ('pilsner',    2.0, 2.0, 2.5, 1.0, 0.5),
  ('pilsener',   2.0, 2.0, 2.5, 1.0, 0.5),
  ('wheat',      1.0, 2.0, 1.0, 2.0, 2.5),
  ('hefeweizen', 0.5, 2.0, 0.5, 2.0, 3.0),
  ('witbier',    0.5, 1.5, 0.5, 2.0, 3.0),
  ('sour',       0.5, 0.5, 1.0, 1.0, 3.5),
  ('gose',       0.5, 0.5, 0.5, 1.0, 3.0),
  ('lambic',     0.5, 0.5, 1.0, 1.5, 4.0),
  ('berliner',   0.5, 0.5, 0.5, 0.5, 3.5),
  ('belgian',    1.5, 2.5, 1.5, 2.5, 2.5),
  ('tripel',     1.5, 2.0, 1.5, 2.5, 2.0),
  ('saison',     2.0, 1.5, 2.0, 1.5, 3.0),
  ('dubbel',     0.5, 3.5, 1.0, 3.0, 2.0),
  ('amber',      2.0, 3.0, 2.0, 2.0, 1.0),
  ('brown ale',  1.0, 3.5, 1.5, 2.0, 1.0),
  ('barleywine', 2.0, 4.0, 3.0, 3.0, 1.5),
  ('scotch ale', 0.5, 4.5, 1.0, 3.5, 0.5),
  ('kolsch',     1.5, 1.5, 1.5, 1.5, 1.0),
  ('cream ale',  1.0, 2.0, 1.0, 2.0, 1.0)
ON CONFLICT (style_keyword) DO NOTHING;

GRANT SELECT ON style_flavor_map TO anon;

--------------------------------------------------------------------------------
-- Function: compute_inferred_flavors
-- For a given user, computes weighted-average flavor scores from the styles of
-- beers they rated >= 3 stars. Weight = (rating - 2), so 3★=1, 4★=2, 5★=3.
-- DISTINCT ON r.id with longest keyword match prevents double-counting.
-- Returns a single row with hoppy/malty/bitter/sweet/fruity (0–5 scale).
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_inferred_flavors(p_user_id TEXT)
RETURNS TABLE (hoppy NUMERIC, malty NUMERIC, bitter NUMERIC, sweet NUMERIC, fruity NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_weight NUMERIC := 0;
  sum_hoppy NUMERIC := 0;
  sum_malty NUMERIC := 0;
  sum_bitter NUMERIC := 0;
  sum_sweet NUMERIC := 0;
  sum_fruity NUMERIC := 0;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT ON (r.id)
           r.rating,
           sfm.hoppy AS s_hoppy, sfm.malty AS s_malty,
           sfm.bitter AS s_bitter, sfm.sweet AS s_sweet, sfm.fruity AS s_fruity
    FROM ratings r
    JOIN style_flavor_map sfm ON LOWER(r.style) LIKE '%' || sfm.style_keyword || '%'
    WHERE r.user_id = p_user_id
      AND r.style IS NOT NULL
      AND r.rating >= 3
    ORDER BY r.id, LENGTH(sfm.style_keyword) DESC
  LOOP
    total_weight := total_weight + (rec.rating - 2);
    sum_hoppy := sum_hoppy + rec.s_hoppy * (rec.rating - 2);
    sum_malty := sum_malty + rec.s_malty * (rec.rating - 2);
    sum_bitter := sum_bitter + rec.s_bitter * (rec.rating - 2);
    sum_sweet := sum_sweet + rec.s_sweet * (rec.rating - 2);
    sum_fruity := sum_fruity + rec.s_fruity * (rec.rating - 2);
  END LOOP;

  IF total_weight = 0 THEN
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    LEAST(ROUND(sum_hoppy / total_weight, 1), 5),
    LEAST(ROUND(sum_malty / total_weight, 1), 5),
    LEAST(ROUND(sum_bitter / total_weight, 1), 5),
    LEAST(ROUND(sum_sweet / total_weight, 1), 5),
    LEAST(ROUND(sum_fruity / total_weight, 1), 5);
END;
$$;

COMMENT ON FUNCTION public.compute_inferred_flavors IS
  'Phase 4: Inferred taste profile from rated beer styles. Returns weighted-average flavor scores for users who skip flavor sliders.';

GRANT EXECUTE ON FUNCTION public.compute_inferred_flavors(TEXT) TO anon;
