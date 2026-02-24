-- Exchange portfolio: user's YG-rated beers with community rate
-- Idempotent: safe to re-run
CREATE OR REPLACE FUNCTION exchange_portfolio(target_user_id TEXT)
RETURNS TABLE (
  beer_name TEXT,
  brewery TEXT,
  style TEXT,
  user_yg_value DECIMAL,
  community_yg_rate DECIMAL,
  user_rating INTEGER,
  rated_at TIMESTAMPTZ
) AS $$
  SELECT
    r.beer_name,
    r.brewery,
    r.style,
    r.yg_value AS user_yg_value,
    COALESCE(e.yg_rate, r.yg_value) AS community_yg_rate,
    r.rating AS user_rating,
    r.created_at AS rated_at
  FROM ratings r
  LEFT JOIN yg_exchange e ON r.beer_name = e.beer_name AND r.brewery = e.brewery
  WHERE r.user_id = target_user_id
    AND r.yg_value IS NOT NULL
  ORDER BY r.created_at DESC;
$$ LANGUAGE sql STABLE;

GRANT EXECUTE ON FUNCTION exchange_portfolio(TEXT) TO anon;
