-- Fix ambiguous column reference in create_comment_and_increment (PostgreSQL 42702).
-- The function parameter rating_id shadowed the rating_comments.rating_id column in
-- INSERT ... RETURNING. Use a table alias so RETURNING refers unambiguously to the
-- inserted row's columns.

CREATE OR REPLACE FUNCTION create_comment_and_increment(
  rating_id text,
  user_id text,
  user_name text,
  content text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_comment jsonb;
  v_trimmed text;
BEGIN
  v_trimmed := trim(content);
  IF v_trimmed IS NULL OR length(v_trimmed) < 1 THEN
    RAISE EXCEPTION 'Comment body is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF length(v_trimmed) > 500 THEN
    RAISE EXCEPTION 'Comment must be 500 characters or less'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM ratings WHERE id = create_comment_and_increment.rating_id) THEN
    RAISE EXCEPTION 'Rating not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  WITH ins AS (
    INSERT INTO rating_comments AS rc (rating_id, user_id, user_name, body)
    VALUES (
      create_comment_and_increment.rating_id,
      create_comment_and_increment.user_id,
      create_comment_and_increment.user_name,
      v_trimmed
    )
    RETURNING rc.id, rc.rating_id, rc.user_id, rc.user_name, rc.body, rc.created_at
  ),
  upd AS (
    UPDATE ratings
    SET comment_count = COALESCE(comment_count, 0) + 1
    WHERE id = create_comment_and_increment.rating_id
  )
  SELECT to_jsonb(ins.*) INTO v_comment FROM ins;

  RETURN v_comment;
END;
$$;
