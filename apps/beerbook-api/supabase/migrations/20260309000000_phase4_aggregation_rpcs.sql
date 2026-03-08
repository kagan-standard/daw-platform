-- Phase 4.1: Replace bounded in-memory aggregation with DB-side aggregation
-- Resolves: BE-C-02, BE-G-01, BE-G-02, BE-G-03, BE-G-04, BE-G-05, INT-11 (ARCH-04)
-- Adds RPCs for leaderboard, crew stats, user stats; standardizes truncated/pagination metadata.

--------------------------------------------------------------------------------
-- RPC: leaderboard_aggregate
-- Returns top reviewers, top beers, top yg, most venues from ratings with optional
-- period (weekly/monthly/alltime) and optional crew filter. All aggregation in DB.
-- Returns JSONB: { top_reviewers, top_beers, top_yg_values, most_venues, truncated }.
-- truncated = true when input window is capped (e.g. max rows scanned).
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leaderboard_aggregate(
  p_period text DEFAULT 'alltime',
  p_crew_id text DEFAULT NULL,
  p_limit int DEFAULT 10,
  p_max_ratings int DEFAULT 10000
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz;
  v_ratings_count bigint;
  v_truncated boolean := false;
  v_top_reviewers jsonb;
  v_top_beers jsonb;
  v_top_yg jsonb;
  v_top_venues jsonb;
BEGIN
  IF p_period = 'weekly' THEN
    v_since := now() - interval '7 days';
  ELSIF p_period = 'monthly' THEN
    v_since := now() - interval '30 days';
  ELSE
    v_since := NULL; -- alltime
  END IF;

  SELECT count(*) INTO v_ratings_count
  FROM ratings r
  WHERE (v_since IS NULL OR r.created_at >= v_since)
    AND (p_crew_id IS NULL OR r.user_id IN (
      SELECT cm.user_id FROM crew_members cm WHERE cm.crew_id = p_crew_id
    ));
  v_truncated := (v_ratings_count > p_max_ratings);

  -- Top reviewers (by rating count)
  WITH base AS (
    SELECT r.user_id, r.beer_name, r.brewery, r.venue_id, r.rating, r.yg_value
    FROM ratings r
    WHERE (v_since IS NULL OR r.created_at >= v_since)
      AND (p_crew_id IS NULL OR r.user_id IN (
        SELECT cm.user_id FROM crew_members cm WHERE cm.crew_id = p_crew_id
      ))
    LIMIT p_max_ratings
  ),
  counted AS (
    SELECT user_id, count(*) AS cnt
    FROM base
    GROUP BY user_id
    ORDER BY cnt DESC
    LIMIT p_limit
  )
  SELECT jsonb_agg(jsonb_build_object('user_id', user_id, 'count', cnt))
  INTO v_top_reviewers
  FROM counted;

  -- Top beers (beer_name|brewery)
  WITH base AS (
    SELECT r.user_id, r.beer_name, r.brewery, r.venue_id, r.rating, r.yg_value
    FROM ratings r
    WHERE (v_since IS NULL OR r.created_at >= v_since)
      AND (p_crew_id IS NULL OR r.user_id IN (
        SELECT cm.user_id FROM crew_members cm WHERE cm.crew_id = p_crew_id
      ))
    LIMIT p_max_ratings
  ),
  counted AS (
    SELECT beer_name, brewery, count(*) AS cnt
    FROM base
    GROUP BY beer_name, brewery
    ORDER BY cnt DESC
    LIMIT p_limit
  )
  SELECT jsonb_agg(jsonb_build_object('beer_name', beer_name, 'brewery', brewery, 'count', cnt))
  INTO v_top_beers
  FROM counted;

  -- Top YG (sum yg_value per user)
  WITH base AS (
    SELECT r.user_id, r.yg_value
    FROM ratings r
    WHERE (v_since IS NULL OR r.created_at >= v_since)
      AND r.yg_value IS NOT NULL
      AND (p_crew_id IS NULL OR r.user_id IN (
        SELECT cm.user_id FROM crew_members cm WHERE cm.crew_id = p_crew_id
      ))
    LIMIT p_max_ratings
  ),
  summed AS (
    SELECT user_id, sum(yg_value::numeric) AS total_yg
    FROM base
    GROUP BY user_id
    ORDER BY total_yg DESC
    LIMIT p_limit
  )
  SELECT jsonb_agg(jsonb_build_object('user_id', user_id, 'total_yg', total_yg))
  INTO v_top_yg
  FROM summed;

  -- Most venues (count per venue_id)
  WITH base AS (
    SELECT r.venue_id
    FROM ratings r
    WHERE (v_since IS NULL OR r.created_at >= v_since)
      AND r.venue_id IS NOT NULL
      AND (p_crew_id IS NULL OR r.user_id IN (
        SELECT cm.user_id FROM crew_members cm WHERE cm.crew_id = p_crew_id
      ))
    LIMIT p_max_ratings
  ),
  counted AS (
    SELECT venue_id, count(*) AS cnt
    FROM base
    GROUP BY venue_id
    ORDER BY cnt DESC
    LIMIT p_limit
  )
  SELECT jsonb_agg(jsonb_build_object('venue_id', c.venue_id, 'count', c.cnt, 'venue_name', v.name))
  INTO v_top_venues
  FROM counted c
  LEFT JOIN venues v ON v.id = c.venue_id;

  RETURN jsonb_build_object(
    'top_reviewers', COALESCE(v_top_reviewers, '[]'::jsonb),
    'top_beers', COALESCE(v_top_beers, '[]'::jsonb),
    'top_yg_values', COALESCE(v_top_yg, '[]'::jsonb),
    'most_venues', COALESCE(v_top_venues, '[]'::jsonb),
    'truncated', v_truncated
  );
END;
$$;

COMMENT ON FUNCTION public.leaderboard_aggregate IS
  'Phase 4.1: DB-side leaderboard aggregation. period=weekly|monthly|alltime; optional crew_id; returns truncated when input capped.';

--------------------------------------------------------------------------------
-- RPC: crew_beer_stats
-- Returns paginated beer aggregates (beer_name, brewery, style, review_count, avg_rating, last_reviewed)
-- for ratings belonging to crew members. DB-side aggregation.
-- Returns: { data: [...], pagination: { limit, offset, total }, truncated }
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.crew_beer_stats(
  p_crew_id text,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
  v_rows jsonb;
  v_total_reviews bigint;
  v_total_users bigint;
BEGIN
  SELECT count(*), count(DISTINCT user_id) INTO v_total_reviews, v_total_users
  FROM ratings r
  WHERE r.user_id IN (SELECT cm.user_id FROM crew_members cm WHERE cm.crew_id = p_crew_id);

  WITH crew_ratings AS (
    SELECT r.beer_name, r.brewery, r.style, r.rating, r.created_at
    FROM ratings r
    WHERE r.user_id IN (SELECT cm.user_id FROM crew_members cm WHERE cm.crew_id = p_crew_id)
  ),
  agg AS (
    SELECT
      beer_name,
      brewery,
      style,
      count(*)::int AS review_count,
      round(avg(rating)::numeric, 2) AS avg_rating,
      max(created_at) AS last_reviewed
    FROM crew_ratings
    GROUP BY beer_name, brewery, style
    ORDER BY avg_rating DESC
  ),
  total_cte AS (
    SELECT count(*) AS total FROM agg
  )
  SELECT total_cte.total INTO v_total FROM total_cte;

  WITH crew_ratings AS (
    SELECT r.beer_name, r.brewery, r.style, r.rating, r.created_at
    FROM ratings r
    WHERE r.user_id IN (SELECT cm.user_id FROM crew_members cm WHERE cm.crew_id = p_crew_id)
  ),
  agg AS (
    SELECT
      beer_name,
      brewery,
      style,
      count(*)::int AS review_count,
      round(avg(rating)::numeric, 2) AS avg_rating,
      max(created_at) AS last_reviewed
    FROM crew_ratings
    GROUP BY beer_name, brewery, style
    ORDER BY avg_rating DESC
    LIMIT p_limit
    OFFSET p_offset
  )
  SELECT jsonb_agg(to_jsonb(agg)) INTO v_rows FROM agg;

  RETURN jsonb_build_object(
    'data', COALESCE(v_rows, '[]'::jsonb),
    'pagination', jsonb_build_object(
      'limit', p_limit,
      'offset', p_offset,
      'total', COALESCE(v_total, 0)
    ),
    'truncated', (v_total > COALESCE(p_offset, 0) + jsonb_array_length(COALESCE(v_rows, '[]'::jsonb))),
    'summary', jsonb_build_object(
      'totalBeers', COALESCE(v_total, 0),
      'totalReviews', COALESCE(v_total_reviews, 0),
      'totalUsers', COALESCE(v_total_users, 0)
    )
  );
END;
$$;

COMMENT ON FUNCTION public.crew_beer_stats IS
  'Phase 4.1: DB-side crew beer stats with pagination. Returns data, pagination, truncated.';

--------------------------------------------------------------------------------
-- RPC: user_stats_aggregate
-- Returns rating-derived stats for a user (total_ratings, styles, avg_rating, etc.)
-- for GET /api/users/:id/stats. Follower/following/crew counts are not included
-- (caller uses follow_counts and crew_members). DB-side aggregation only.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_stats_aggregate(p_user_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_total_ratings int;
  v_style_dist jsonb;
  v_rating_dist jsonb;
  v_monthly jsonb;
BEGIN
  SELECT count(*)::int INTO v_total_ratings FROM ratings WHERE user_id = p_user_id;

  IF v_total_ratings = 0 THEN
    RETURN jsonb_build_object(
      'total_ratings', 0,
      'total_styles', 0,
      'avg_rating', 0,
      'avg_yg_value', 0,
      'total_yg_portfolio', 0,
      'most_rated_style', null,
      'highest_rated_beer', null,
      'style_distribution', '{}'::jsonb,
      'rating_distribution', jsonb_build_object('1', 0, '2', 0, '3', 0, '4', 0, '5', 0),
      'monthly_activity', '[]'::jsonb
    );
  END IF;

  SELECT jsonb_object_agg(style, cnt) INTO v_style_dist
  FROM (SELECT style, count(*) AS cnt FROM ratings WHERE user_id = p_user_id GROUP BY style) s;

  SELECT jsonb_object_agg(rating::text, cnt) INTO v_rating_dist
  FROM (SELECT rating, count(*) AS cnt FROM ratings WHERE user_id = p_user_id GROUP BY rating) r;

  SELECT jsonb_agg(jsonb_build_object('month', month, 'count', cnt) ORDER BY month DESC)
  INTO v_monthly
  FROM (
    SELECT to_char(created_at, 'YYYY-MM') AS month, count(*)::int AS cnt
    FROM ratings
    WHERE user_id = p_user_id AND created_at >= now() - interval '12 months'
    GROUP BY to_char(created_at, 'YYYY-MM')
    ORDER BY month DESC
    LIMIT 12
  ) m;

  SELECT jsonb_build_object(
    'total_ratings', v_total_ratings,
    'total_styles', (SELECT count(DISTINCT style)::int FROM ratings WHERE user_id = p_user_id),
    'avg_rating', round((SELECT avg(rating)::numeric FROM ratings WHERE user_id = p_user_id), 2),
    'avg_yg_value', round((SELECT avg(yg_value)::numeric FROM ratings WHERE user_id = p_user_id AND yg_value IS NOT NULL), 2),
    'total_yg_portfolio', round((SELECT coalesce(sum(yg_value), 0)::numeric FROM ratings WHERE user_id = p_user_id), 2),
    'most_rated_style', (SELECT style FROM ratings WHERE user_id = p_user_id GROUP BY style ORDER BY count(*) DESC LIMIT 1),
    'highest_rated_beer', (
      SELECT jsonb_build_object('beer_name', beer_name, 'rating', rating)
      FROM ratings WHERE user_id = p_user_id ORDER BY rating DESC, created_at DESC LIMIT 1
    ),
    'style_distribution', COALESCE(v_style_dist, '{}'::jsonb),
    'rating_distribution', COALESCE(v_rating_dist, '{}'::jsonb),
    'monthly_activity', COALESCE(v_monthly, '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.user_stats_aggregate IS
  'Phase 4.1: DB-side user stats (rating aggregates only). Caller adds follower_count, following_count, crew_count from follow_counts/crew_members.';

--------------------------------------------------------------------------------
-- RPC: global_stats_counts
-- Returns total rating count and distinct user count for global stats (GET /api/stats without crew_id).
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.global_stats_counts()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_ratings', (SELECT count(*) FROM ratings),
    'total_users', (SELECT count(DISTINCT user_id) FROM ratings)
  );
$$;

COMMENT ON FUNCTION public.global_stats_counts IS
  'Phase 4.1: Global stats counts (total_ratings, total_users) for GET /api/stats.';
