-- Fix: crew RPCs used uuid for IDs while crews/crew_members use text (Keycloak sub, uuid-as-text).
-- This caused "operator does not exist: text = uuid" on POST /api/crews.
-- Drop uuid-signature overloads and recreate with text parameters.

DROP FUNCTION IF EXISTS public.create_crew_with_owner(text, uuid);
DROP FUNCTION IF EXISTS public.join_crew(uuid, uuid);
DROP FUNCTION IF EXISTS public.remove_crew_member(uuid, uuid);

--------------------------------------------------------------------------------
-- create_crew_with_owner(p_name text, p_owner_id text)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_crew_with_owner(p_name text, p_owner_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_crew_id text;
  v_invite_code text;
  v_crew jsonb;
  v_attempts int := 0;
  v_max_attempts int := 5;
BEGIN
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Crew name is required'
      USING ERRCODE = 'check_violation';
  END IF;

  IF length(trim(p_name)) > 50 THEN
    RAISE EXCEPTION 'Crew name must be 50 chars or fewer'
      USING ERRCODE = 'check_violation';
  END IF;

  LOOP
    v_attempts := v_attempts + 1;
    v_invite_code := generate_crew_invite_code();

    BEGIN
      INSERT INTO crews (name, created_by, invite_code)
      VALUES (trim(p_name), p_owner_id, v_invite_code)
      RETURNING id INTO v_crew_id;

      EXIT; -- insert succeeded
    EXCEPTION
      WHEN unique_violation THEN
        IF v_attempts >= v_max_attempts THEN
          RAISE EXCEPTION 'Failed to generate unique invite code after % attempts',
            v_max_attempts;
        END IF;
    END;
  END LOOP;

  INSERT INTO crew_members (crew_id, user_id, role)
  VALUES (v_crew_id, p_owner_id, 'owner');

  SELECT to_jsonb(c) INTO v_crew
  FROM crews c
  WHERE c.id = v_crew_id;

  RETURN v_crew;
END;
$$;

--------------------------------------------------------------------------------
-- join_crew(p_crew_id text, p_user_id text)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_crew(p_crew_id text, p_user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int;
  v_exists boolean;
BEGIN
  PERFORM 1 FROM crews WHERE id = p_crew_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Crew not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM crew_members
    WHERE crew_id = p_crew_id AND user_id = p_user_id
  ) INTO v_exists;

  IF v_exists THEN
    RAISE EXCEPTION 'Already a member'
      USING ERRCODE = '23505';
  END IF;

  SELECT count(*) INTO v_count
  FROM crew_members
  WHERE crew_id = p_crew_id;

  IF v_count >= 50 THEN
    RAISE EXCEPTION 'Crew is full (50/50)'
      USING ERRCODE = 'P0003';
  END IF;

  INSERT INTO crew_members (crew_id, user_id, role)
  VALUES (p_crew_id, p_user_id, 'member');
END;
$$;

--------------------------------------------------------------------------------
-- remove_crew_member(p_crew_id text, p_user_id text)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_crew_member(p_crew_id text, p_user_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_remaining int;
  v_crew_deleted boolean := false;
BEGIN
  PERFORM 1 FROM crews WHERE id = p_crew_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Crew not found'
      USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM crew_members
  WHERE crew_id = p_crew_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*) INTO v_remaining
  FROM crew_members
  WHERE crew_id = p_crew_id;

  IF v_remaining = 0 THEN
    DELETE FROM crews WHERE id = p_crew_id;
    v_crew_deleted := true;
  END IF;

  RETURN jsonb_build_object(
    'crew_deleted', v_crew_deleted,
    'remaining_members', v_remaining
  );
END;
$$;
