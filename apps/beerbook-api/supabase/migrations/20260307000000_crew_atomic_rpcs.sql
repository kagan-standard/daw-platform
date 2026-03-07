-- Phase 2.7: Atomic Crew Mutations
-- Resolves: BE-D-02, BE-D-03, BE-D-04, BE-D-06
-- Creates SQL RPCs to replace multi-step PostgREST writes with single-transaction operations,
-- eliminating orphan crews, capacity oversubscription, and incorrect member counts.

--------------------------------------------------------------------------------
-- Helper: generate a random 6-char invite code (same charset as JS generateInviteCode)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generate_crew_invite_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text := '';
  i int;
BEGIN
  FOR i IN 1..6 LOOP
    code := code || substr(chars, floor(random() * length(chars))::int + 1, 1);
  END LOOP;
  RETURN code;
END;
$$;

--------------------------------------------------------------------------------
-- RPC: create_crew_with_owner
-- Atomically creates a crew row and inserts the owner as the first member.
-- Retries invite code generation up to 5 times on unique-constraint conflict.
-- Returns: the full crew row as JSONB.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_crew_with_owner(p_name text, p_owner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_crew_id uuid;
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
-- RPC: join_crew
-- Atomically validates capacity (50-member cap) under a row lock and inserts
-- the new member. Prevents TOCTOU oversubscription from concurrent joins.
-- Raises coded exceptions for caller-side HTTP mapping:
--   23505 (unique_violation) = already a member
--   P0003                    = crew full
--   P0002 (no_data_found)    = crew not found
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION join_crew(p_crew_id uuid, p_user_id uuid)
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
-- RPC: remove_crew_member
-- Atomically removes a member and deletes the crew if no members remain.
-- Prevents orphan-crew scenario where a recount failure leaves an empty crew.
-- Returns: JSONB with { crew_deleted: bool, remaining_members: int }.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION remove_crew_member(p_crew_id uuid, p_user_id uuid)
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
