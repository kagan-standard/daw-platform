-- Phase 3.2: Comment counter transactionality (BE-C-03)
-- Replaces non-transactional comment insert/delete + separate counter RPCs with
-- single-transaction RPCs so counter cannot drift on partial failures.

--------------------------------------------------------------------------------
-- RPC: create_comment_and_increment
-- Inserts one comment and increments ratings.comment_count in one transaction.
-- Returns the new comment row as JSONB.
-- Raises if rating does not exist (FK would also fail; explicit for 404 mapping).
--------------------------------------------------------------------------------
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
    INSERT INTO rating_comments (rating_id, user_id, user_name, body)
    VALUES (
      create_comment_and_increment.rating_id,
      create_comment_and_increment.user_id,
      create_comment_and_increment.user_name,
      v_trimmed
    )
    RETURNING id, rating_id, user_id, user_name, body, created_at
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

--------------------------------------------------------------------------------
-- RPC: delete_comment_and_decrement
-- Verifies ownership, deletes the comment, and decrements comment_count in one transaction.
-- Returns: { "ok": true } on success; { "ok": false, "error": "not_found"|"forbidden" } otherwise.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION delete_comment_and_decrement(comment_id text, user_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rating_id text;
  v_owner_id text;
BEGIN
  SELECT c.rating_id, c.user_id INTO v_rating_id, v_owner_id
  FROM rating_comments c
  WHERE c.id = delete_comment_and_decrement.comment_id
  LIMIT 1;

  IF v_rating_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_owner_id IS DISTINCT FROM delete_comment_and_decrement.user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  DELETE FROM rating_comments
  WHERE id = delete_comment_and_decrement.comment_id
    AND user_id = delete_comment_and_decrement.user_id;

  UPDATE ratings
  SET comment_count = GREATEST(COALESCE(comment_count, 0) - 1, 0)
  WHERE id = v_rating_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

--------------------------------------------------------------------------------
-- Reconciliation: view for data healing
-- Run periodically to find ratings where comment_count != actual count.
-- Healing: UPDATE ratings r SET comment_count = c.actual
--   FROM (SELECT rating_id, count(*)::int AS actual FROM rating_comments GROUP BY rating_id) c
--   WHERE r.id = c.rating_id AND r.comment_count IS DISTINCT FROM c.actual;
--------------------------------------------------------------------------------
CREATE OR REPLACE VIEW ratings_comment_count_drift AS
SELECT r.id,
       r.comment_count,
       count(c.id)::int AS actual_count
FROM ratings r
LEFT JOIN rating_comments c ON c.rating_id = r.id
GROUP BY r.id, r.comment_count
HAVING r.comment_count IS DISTINCT FROM count(c.id)::int;

COMMENT ON VIEW ratings_comment_count_drift IS 'Phase 3.2: Ratings where comment_count does not match actual comment rows. Use for periodic reconciliation.';
