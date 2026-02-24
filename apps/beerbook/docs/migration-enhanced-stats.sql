-- Enhanced user stats for mobile charts (FlavorRadar, StyleDoughnut, MonthlyTrend, DistributionBar)
-- Idempotent: safe to re-run
CREATE OR REPLACE FUNCTION user_enhanced_stats(target_user_id TEXT)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_ratings', COALESCE(COUNT(*), 0),
    'average_rating', ROUND(COALESCE(AVG(rating), 0)::numeric, 2),
    'unique_beers', COUNT(DISTINCT beer_name),
    'unique_styles', COUNT(DISTINCT style),
    'favorite_style', (
      SELECT style FROM ratings
      WHERE user_id = target_user_id
      GROUP BY style
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ),
    'avg_yg_value', ROUND(COALESCE(AVG(yg_value), 0)::numeric, 2),
    'flavors', json_build_object(
      'hoppy', ROUND(COALESCE(AVG(flavor_hoppy), 0)::numeric, 1),
      'malty', ROUND(COALESCE(AVG(flavor_malty), 0)::numeric, 1),
      'bitter', ROUND(COALESCE(AVG(flavor_bitter), 0)::numeric, 1),
      'sweet', ROUND(COALESCE(AVG(flavor_sweet), 0)::numeric, 1),
      'fruity', ROUND(COALESCE(AVG(flavor_fruity), 0)::numeric, 1)
    ),
    'style_distribution', COALESCE((
      SELECT json_object_agg(style, cnt)
      FROM (
        SELECT style, COUNT(*) AS cnt
        FROM ratings WHERE user_id = target_user_id
        GROUP BY style ORDER BY cnt DESC LIMIT 20
      ) sd
    ), '{}'::json),
    'rating_distribution', COALESCE((
      SELECT json_object_agg(rating::text, cnt)
      FROM (
        SELECT rating, COUNT(*) AS cnt
        FROM ratings WHERE user_id = target_user_id
        GROUP BY rating ORDER BY rating
      ) rd
    ), '{}'::json),
    'monthly_counts', COALESCE((
      SELECT json_agg(json_build_object('month', month, 'count', cnt))
      FROM (
        SELECT to_char(created_at, 'YYYY-MM') AS month, COUNT(*) AS cnt
        FROM ratings
        WHERE user_id = target_user_id
          AND created_at >= NOW() - INTERVAL '12 months'
        GROUP BY to_char(created_at, 'YYYY-MM')
        ORDER BY month
      ) mc
    ), '[]'::json)
  ) INTO result
  FROM ratings
  WHERE user_id = target_user_id;

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION user_enhanced_stats(TEXT) TO anon;
