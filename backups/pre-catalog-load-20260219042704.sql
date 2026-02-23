--
-- PostgreSQL database dump
--

-- Dumped from database version 15.6
-- Dumped by pg_dump version 15.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auth; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA auth;


ALTER SCHEMA auth OWNER TO supabase_admin;

--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA extensions;


ALTER SCHEMA extensions OWNER TO postgres;

--
-- Name: graphql; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA graphql;


ALTER SCHEMA graphql OWNER TO supabase_admin;

--
-- Name: graphql_public; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA graphql_public;


ALTER SCHEMA graphql_public OWNER TO supabase_admin;

--
-- Name: pgbouncer; Type: SCHEMA; Schema: -; Owner: pgbouncer
--

CREATE SCHEMA pgbouncer;


ALTER SCHEMA pgbouncer OWNER TO pgbouncer;

--
-- Name: pgsodium; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA pgsodium;


ALTER SCHEMA pgsodium OWNER TO supabase_admin;

--
-- Name: pgsodium; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgsodium WITH SCHEMA pgsodium;


--
-- Name: EXTENSION pgsodium; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgsodium IS 'Pgsodium is a modern cryptography library for Postgres.';


--
-- Name: realtime; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA realtime;


ALTER SCHEMA realtime OWNER TO supabase_admin;

--
-- Name: storage; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA storage;


ALTER SCHEMA storage OWNER TO supabase_admin;

--
-- Name: vault; Type: SCHEMA; Schema: -; Owner: supabase_admin
--

CREATE SCHEMA vault;


ALTER SCHEMA vault OWNER TO supabase_admin;

--
-- Name: pg_graphql; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_graphql WITH SCHEMA graphql;


--
-- Name: EXTENSION pg_graphql; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_graphql IS 'pg_graphql: GraphQL support';


--
-- Name: pg_stat_statements; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;


--
-- Name: EXTENSION pg_stat_statements; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_stat_statements IS 'track planning and execution statistics of all SQL statements executed';


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: pgjwt; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgjwt WITH SCHEMA extensions;


--
-- Name: EXTENSION pgjwt; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgjwt IS 'JSON Web Token API for Postgresql';


--
-- Name: supabase_vault; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;


--
-- Name: EXTENSION supabase_vault; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION supabase_vault IS 'Supabase Vault Extension';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: email(); Type: FUNCTION; Schema: auth; Owner: supabase_auth_admin
--

CREATE FUNCTION auth.email() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select nullif(current_setting('request.jwt.claim.email', true), '')::text;
$$;


ALTER FUNCTION auth.email() OWNER TO supabase_auth_admin;

--
-- Name: role(); Type: FUNCTION; Schema: auth; Owner: supabase_auth_admin
--

CREATE FUNCTION auth.role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select nullif(current_setting('request.jwt.claim.role', true), '')::text;
$$;


ALTER FUNCTION auth.role() OWNER TO supabase_auth_admin;

--
-- Name: uid(); Type: FUNCTION; Schema: auth; Owner: supabase_auth_admin
--

CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;


ALTER FUNCTION auth.uid() OWNER TO supabase_auth_admin;

--
-- Name: grant_pg_cron_access(); Type: FUNCTION; Schema: extensions; Owner: postgres
--

CREATE FUNCTION extensions.grant_pg_cron_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
  END IF;
END;
$$;


ALTER FUNCTION extensions.grant_pg_cron_access() OWNER TO postgres;

--
-- Name: FUNCTION grant_pg_cron_access(); Type: COMMENT; Schema: extensions; Owner: postgres
--

COMMENT ON FUNCTION extensions.grant_pg_cron_access() IS 'Grants access to pg_cron';


--
-- Name: grant_pg_graphql_access(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.grant_pg_graphql_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
    func_is_graphql_resolve bool;
BEGIN
    func_is_graphql_resolve = (
        SELECT n.proname = 'resolve'
        FROM pg_event_trigger_ddl_commands() AS ev
        LEFT JOIN pg_catalog.pg_proc AS n
        ON ev.objid = n.oid
    );

    IF func_is_graphql_resolve
    THEN
        -- Update public wrapper to pass all arguments through to the pg_graphql resolve func
        DROP FUNCTION IF EXISTS graphql_public.graphql;
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language sql
        as $$
            select graphql.resolve(
                query := query,
                variables := coalesce(variables, '{}'),
                "operationName" := "operationName",
                extensions := extensions
            );
        $$;

        -- This hook executes when `graphql.resolve` is created. That is not necessarily the last
        -- function in the extension so we need to grant permissions on existing entities AND
        -- update default permissions to any others that are created after `graphql.resolve`
        grant usage on schema graphql to postgres, anon, authenticated, service_role;
        grant select on all tables in schema graphql to postgres, anon, authenticated, service_role;
        grant execute on all functions in schema graphql to postgres, anon, authenticated, service_role;
        grant all on all sequences in schema graphql to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on tables to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on functions to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on sequences to postgres, anon, authenticated, service_role;

        -- Allow postgres role to allow granting usage on graphql and graphql_public schemas to custom roles
        grant usage on schema graphql_public to postgres with grant option;
        grant usage on schema graphql to postgres with grant option;
    END IF;

END;
$_$;


ALTER FUNCTION extensions.grant_pg_graphql_access() OWNER TO supabase_admin;

--
-- Name: FUNCTION grant_pg_graphql_access(); Type: COMMENT; Schema: extensions; Owner: supabase_admin
--

COMMENT ON FUNCTION extensions.grant_pg_graphql_access() IS 'Grants access to pg_graphql';


--
-- Name: grant_pg_net_access(); Type: FUNCTION; Schema: extensions; Owner: postgres
--

CREATE FUNCTION extensions.grant_pg_net_access() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;

    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
    ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

    ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
    ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

    REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
    REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

    GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
  END IF;
END;
$$;


ALTER FUNCTION extensions.grant_pg_net_access() OWNER TO postgres;

--
-- Name: FUNCTION grant_pg_net_access(); Type: COMMENT; Schema: extensions; Owner: postgres
--

COMMENT ON FUNCTION extensions.grant_pg_net_access() IS 'Grants access to pg_net';


--
-- Name: pgrst_ddl_watch(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


ALTER FUNCTION extensions.pgrst_ddl_watch() OWNER TO supabase_admin;

--
-- Name: pgrst_drop_watch(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


ALTER FUNCTION extensions.pgrst_drop_watch() OWNER TO supabase_admin;

--
-- Name: set_graphql_placeholder(); Type: FUNCTION; Schema: extensions; Owner: supabase_admin
--

CREATE FUNCTION extensions.set_graphql_placeholder() RETURNS event_trigger
    LANGUAGE plpgsql
    AS $_$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$_$;


ALTER FUNCTION extensions.set_graphql_placeholder() OWNER TO supabase_admin;

--
-- Name: FUNCTION set_graphql_placeholder(); Type: COMMENT; Schema: extensions; Owner: supabase_admin
--

COMMENT ON FUNCTION extensions.set_graphql_placeholder() IS 'Reintroduces placeholder function for graphql_public.graphql';


--
-- Name: get_auth(text); Type: FUNCTION; Schema: pgbouncer; Owner: postgres
--

CREATE FUNCTION pgbouncer.get_auth(p_usename text) RETURNS TABLE(username text, password text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    RAISE WARNING 'PgBouncer auth request: %', p_usename;

    RETURN QUERY
    SELECT usename::TEXT, passwd::TEXT FROM pg_catalog.pg_shadow
    WHERE usename = p_usename;
END;
$$;


ALTER FUNCTION pgbouncer.get_auth(p_usename text) OWNER TO postgres;

--
-- Name: search_beer_catalog(text, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.search_beer_catalog(search_term text, max_results integer DEFAULT 10) RETURNS TABLE(id text, name text, brewery_name text, style text, abv numeric, review_overall numeric, review_count integer, source text, similarity_score real)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        b.id::TEXT, b.name, b.brewery_name, b.style,
        b.abv, b.review_overall, b.review_count, b.source,
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


ALTER FUNCTION public.search_beer_catalog(search_term text, max_results integer) OWNER TO postgres;

--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;


ALTER FUNCTION public.update_updated_at() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: venues; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.venues (
    id text DEFAULT (extensions.uuid_generate_v4())::text NOT NULL,
    name text NOT NULL,
    address text,
    latitude numeric(9,6) NOT NULL,
    longitude numeric(9,6) NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.venues OWNER TO postgres;

--
-- Name: venues_within_radius(numeric, numeric, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.venues_within_radius(lat numeric, lng numeric, radius_m integer) RETURNS SETOF public.venues
    LANGUAGE sql STABLE
    AS $$
    SELECT * FROM venues
    WHERE (
        6371000 * acos(
            cos(radians(lat)) * cos(radians(latitude)) *
            cos(radians(longitude) - radians(lng)) +
            sin(radians(lat)) * sin(radians(latitude))
        )
    ) <= radius_m;
$$;


ALTER FUNCTION public.venues_within_radius(lat numeric, lng numeric, radius_m integer) OWNER TO postgres;

--
-- Name: extension(text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.extension(name text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
_filename text;
BEGIN
    select string_to_array(name, '/') into _parts;
    select _parts[array_length(_parts,1)] into _filename;
    -- @todo return the last part instead of 2
    return split_part(_filename, '.', 2);
END
$$;


ALTER FUNCTION storage.extension(name text) OWNER TO supabase_storage_admin;

--
-- Name: filename(text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.filename(name text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
BEGIN
    select string_to_array(name, '/') into _parts;
    return _parts[array_length(_parts,1)];
END
$$;


ALTER FUNCTION storage.filename(name text) OWNER TO supabase_storage_admin;

--
-- Name: foldername(text); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.foldername(name text) RETURNS text[]
    LANGUAGE plpgsql
    AS $$
DECLARE
_parts text[];
BEGIN
    select string_to_array(name, '/') into _parts;
    return _parts[1:array_length(_parts,1)-1];
END
$$;


ALTER FUNCTION storage.foldername(name text) OWNER TO supabase_storage_admin;

--
-- Name: search(text, text, integer, integer, integer); Type: FUNCTION; Schema: storage; Owner: supabase_storage_admin
--

CREATE FUNCTION storage.search(prefix text, bucketname text, limits integer DEFAULT 100, levels integer DEFAULT 1, offsets integer DEFAULT 0) RETURNS TABLE(name text, id uuid, updated_at timestamp with time zone, created_at timestamp with time zone, last_accessed_at timestamp with time zone, metadata jsonb)
    LANGUAGE plpgsql
    AS $$
DECLARE
_bucketId text;
BEGIN
    -- will be replaced by migrations when server starts
    -- saving space for cloud-init
END
$$;


ALTER FUNCTION storage.search(prefix text, bucketname text, limits integer, levels integer, offsets integer) OWNER TO supabase_storage_admin;

--
-- Name: secrets_encrypt_secret_secret(); Type: FUNCTION; Schema: vault; Owner: supabase_admin
--

CREATE FUNCTION vault.secrets_encrypt_secret_secret() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
		BEGIN
		        new.secret = CASE WHEN new.secret IS NULL THEN NULL ELSE
			CASE WHEN new.key_id IS NULL THEN NULL ELSE pg_catalog.encode(
			  pgsodium.crypto_aead_det_encrypt(
				pg_catalog.convert_to(new.secret, 'utf8'),
				pg_catalog.convert_to((new.id::text || new.description::text || new.created_at::text || new.updated_at::text)::text, 'utf8'),
				new.key_id::uuid,
				new.nonce
			  ),
				'base64') END END;
		RETURN new;
		END;
		$$;


ALTER FUNCTION vault.secrets_encrypt_secret_secret() OWNER TO supabase_admin;

--
-- Name: audit_log_entries; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.audit_log_entries (
    instance_id uuid,
    id uuid NOT NULL,
    payload json,
    created_at timestamp with time zone
);


ALTER TABLE auth.audit_log_entries OWNER TO supabase_auth_admin;

--
-- Name: TABLE audit_log_entries; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.audit_log_entries IS 'Auth: Audit trail for user actions.';


--
-- Name: instances; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.instances (
    id uuid NOT NULL,
    uuid uuid,
    raw_base_config text,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


ALTER TABLE auth.instances OWNER TO supabase_auth_admin;

--
-- Name: TABLE instances; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.instances IS 'Auth: Manages users across multiple sites.';


--
-- Name: refresh_tokens; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.refresh_tokens (
    instance_id uuid,
    id bigint NOT NULL,
    token character varying(255),
    user_id character varying(255),
    revoked boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


ALTER TABLE auth.refresh_tokens OWNER TO supabase_auth_admin;

--
-- Name: TABLE refresh_tokens; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.refresh_tokens IS 'Auth: Store of tokens used to refresh JWT tokens once they expire.';


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: auth; Owner: supabase_auth_admin
--

CREATE SEQUENCE auth.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE auth.refresh_tokens_id_seq OWNER TO supabase_auth_admin;

--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: auth; Owner: supabase_auth_admin
--

ALTER SEQUENCE auth.refresh_tokens_id_seq OWNED BY auth.refresh_tokens.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.schema_migrations (
    version character varying(255) NOT NULL
);


ALTER TABLE auth.schema_migrations OWNER TO supabase_auth_admin;

--
-- Name: TABLE schema_migrations; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.schema_migrations IS 'Auth: Manages updates to the auth system.';


--
-- Name: users; Type: TABLE; Schema: auth; Owner: supabase_auth_admin
--

CREATE TABLE auth.users (
    instance_id uuid,
    id uuid NOT NULL,
    aud character varying(255),
    role character varying(255),
    email character varying(255),
    encrypted_password character varying(255),
    confirmed_at timestamp with time zone,
    invited_at timestamp with time zone,
    confirmation_token character varying(255),
    confirmation_sent_at timestamp with time zone,
    recovery_token character varying(255),
    recovery_sent_at timestamp with time zone,
    email_change_token character varying(255),
    email_change character varying(255),
    email_change_sent_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    raw_app_meta_data jsonb,
    raw_user_meta_data jsonb,
    is_super_admin boolean,
    created_at timestamp with time zone,
    updated_at timestamp with time zone
);


ALTER TABLE auth.users OWNER TO supabase_auth_admin;

--
-- Name: TABLE users; Type: COMMENT; Schema: auth; Owner: supabase_auth_admin
--

COMMENT ON TABLE auth.users IS 'Auth: Stores user login data within a secure schema.';


--
-- Name: beer_aliases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.beer_aliases (
    id text DEFAULT (extensions.uuid_generate_v4())::text NOT NULL,
    beer_id text NOT NULL,
    alias_name text NOT NULL,
    normalized_alias text NOT NULL,
    source text DEFAULT 'import'::text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.beer_aliases OWNER TO postgres;

--
-- Name: ratings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ratings (
    id text DEFAULT (extensions.uuid_generate_v4())::text NOT NULL,
    user_id text NOT NULL,
    user_name text DEFAULT 'Anonymous'::text NOT NULL,
    beer_name text NOT NULL,
    brewery text DEFAULT ''::text,
    style text NOT NULL,
    abv numeric(4,1),
    rating integer NOT NULL,
    flavor_hoppy integer DEFAULT 0,
    flavor_malty integer DEFAULT 0,
    flavor_bitter integer DEFAULT 0,
    flavor_sweet integer DEFAULT 0,
    flavor_fruity integer DEFAULT 0,
    notes text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now(),
    yg_value numeric(3,1),
    latitude numeric(9,6),
    longitude numeric(9,6),
    location_name character varying(255),
    venue_id text,
    photo_url text,
    beer_id text,
    CONSTRAINT ratings_flavor_bitter_check CHECK (((flavor_bitter >= 0) AND (flavor_bitter <= 5))),
    CONSTRAINT ratings_flavor_fruity_check CHECK (((flavor_fruity >= 0) AND (flavor_fruity <= 5))),
    CONSTRAINT ratings_flavor_hoppy_check CHECK (((flavor_hoppy >= 0) AND (flavor_hoppy <= 5))),
    CONSTRAINT ratings_flavor_malty_check CHECK (((flavor_malty >= 0) AND (flavor_malty <= 5))),
    CONSTRAINT ratings_flavor_sweet_check CHECK (((flavor_sweet >= 0) AND (flavor_sweet <= 5))),
    CONSTRAINT ratings_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT ratings_yg_value_check CHECK (((yg_value >= 0.1) AND (yg_value <= 10.0)))
);


ALTER TABLE public.ratings OWNER TO postgres;

--
-- Name: beer_averages; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.beer_averages AS
 SELECT ratings.beer_name,
    ratings.brewery,
    ratings.style,
    count(*) AS review_count,
    round(avg(ratings.rating), 2) AS avg_rating,
    round(avg(ratings.yg_value), 2) AS avg_yg_value,
    round(avg(ratings.flavor_hoppy), 1) AS avg_hoppy,
    round(avg(ratings.flavor_malty), 1) AS avg_malty,
    round(avg(ratings.flavor_bitter), 1) AS avg_bitter,
    round(avg(ratings.flavor_sweet), 1) AS avg_sweet,
    round(avg(ratings.flavor_fruity), 1) AS avg_fruity,
    max(ratings.created_at) AS last_reviewed
   FROM public.ratings
  GROUP BY ratings.beer_name, ratings.brewery, ratings.style
  ORDER BY (round(avg(ratings.rating), 2)) DESC;


ALTER TABLE public.beer_averages OWNER TO postgres;

--
-- Name: beer_styles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.beer_styles (
    id text DEFAULT (extensions.uuid_generate_v4())::text NOT NULL,
    name text NOT NULL,
    category text,
    description text,
    abv_min numeric(4,2),
    abv_max numeric(4,2),
    ibu_min integer,
    ibu_max integer
);


ALTER TABLE public.beer_styles OWNER TO postgres;

--
-- Name: beers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.beers (
    id text DEFAULT (extensions.uuid_generate_v4())::text NOT NULL,
    name text NOT NULL,
    slug text,
    normalized_name text,
    brewery_id text,
    brewery_name text,
    style text,
    style_category text,
    style_source text DEFAULT 'inferred'::text,
    abv numeric(4,2),
    ibu_min integer,
    ibu_max integer,
    srm integer,
    flavor_astringency integer,
    flavor_body integer,
    flavor_alcohol integer,
    flavor_bitter integer,
    flavor_sweet integer,
    flavor_sour integer,
    flavor_salty integer,
    flavor_fruity integer,
    flavor_hoppy integer,
    flavor_spicy integer,
    flavor_malty integer,
    review_aroma numeric(4,2),
    review_appearance numeric(4,2),
    review_palate numeric(4,2),
    review_taste numeric(4,2),
    review_overall numeric(4,2),
    review_count integer DEFAULT 0,
    description text,
    flavor_notes text[],
    ingredients jsonb,
    food_pairings text[],
    image_url text,
    label_url text,
    source text DEFAULT 'user_submitted'::text NOT NULL,
    source_id text,
    source_brewery_id text,
    import_batch_id text,
    verified boolean DEFAULT false,
    submitted_by text,
    crew_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.beers OWNER TO postgres;

--
-- Name: breweries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.breweries (
    id text DEFAULT (extensions.uuid_generate_v4())::text NOT NULL,
    name text NOT NULL,
    slug text,
    normalized_name text,
    street text,
    city text,
    state text,
    postal_code text,
    country text DEFAULT 'US'::text,
    latitude numeric(9,6),
    longitude numeric(9,6),
    phone text,
    website_url text,
    referral_url text,
    brewery_type text,
    logo_url text,
    description text,
    source text DEFAULT 'user_submitted'::text NOT NULL,
    source_id text,
    import_batch_id text,
    verified boolean DEFAULT false,
    claimed boolean DEFAULT false,
    crew_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.breweries OWNER TO postgres;

--
-- Name: brewery_aliases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.brewery_aliases (
    id text DEFAULT (extensions.uuid_generate_v4())::text NOT NULL,
    brewery_id text NOT NULL,
    alias_name text NOT NULL,
    normalized_alias text NOT NULL,
    source text DEFAULT 'import'::text,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.brewery_aliases OWNER TO postgres;

--
-- Name: flavor_descriptors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.flavor_descriptors (
    id integer NOT NULL,
    category text NOT NULL,
    keyword text NOT NULL,
    impact integer DEFAULT 1
);


ALTER TABLE public.flavor_descriptors OWNER TO postgres;

--
-- Name: flavor_descriptors_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.flavor_descriptors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.flavor_descriptors_id_seq OWNER TO postgres;

--
-- Name: flavor_descriptors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.flavor_descriptors_id_seq OWNED BY public.flavor_descriptors.id;


--
-- Name: happy_hours; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.happy_hours (
    id text DEFAULT (extensions.uuid_generate_v4())::text NOT NULL,
    venue_id text NOT NULL,
    day_of_week integer NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    description text NOT NULL,
    reported_by text NOT NULL,
    reported_at timestamp with time zone DEFAULT now(),
    confirmed_count integer DEFAULT 1,
    last_confirmed_at timestamp with time zone DEFAULT now(),
    CONSTRAINT happy_hours_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))
);


ALTER TABLE public.happy_hours OWNER TO postgres;

--
-- Name: price_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.price_logs (
    id text DEFAULT (extensions.uuid_generate_v4())::text NOT NULL,
    venue_id text NOT NULL,
    beer_name text NOT NULL,
    style text,
    price_cents integer NOT NULL,
    is_happy_hour boolean DEFAULT false,
    rating_id text,
    logged_by text NOT NULL,
    logged_at timestamp with time zone DEFAULT now(),
    confirmed_count integer DEFAULT 1,
    last_confirmed_at timestamp with time zone DEFAULT now(),
    CONSTRAINT price_logs_price_cents_check CHECK ((price_cents > 0))
);


ALTER TABLE public.price_logs OWNER TO postgres;

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.profiles (
    id text NOT NULL,
    display_name text DEFAULT 'Beer Lover'::text NOT NULL,
    email text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.profiles OWNER TO postgres;

--
-- Name: reactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.reactions (
    id text DEFAULT (extensions.uuid_generate_v4())::text NOT NULL,
    rating_id text NOT NULL,
    user_id text NOT NULL,
    reaction_type text DEFAULT 'cheers'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT reactions_reaction_type_check CHECK ((reaction_type = 'cheers'::text))
);


ALTER TABLE public.reactions OWNER TO postgres;

--
-- Name: venue_menus; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.venue_menus AS
 SELECT DISTINCT ON (price_logs.venue_id, price_logs.beer_name) price_logs.venue_id,
    price_logs.beer_name,
    price_logs.style,
    price_logs.price_cents,
    price_logs.is_happy_hour,
    price_logs.logged_by,
    price_logs.logged_at,
    price_logs.confirmed_count,
    price_logs.last_confirmed_at
   FROM public.price_logs
  ORDER BY price_logs.venue_id, price_logs.beer_name, price_logs.logged_at DESC;


ALTER TABLE public.venue_menus OWNER TO postgres;

--
-- Name: yg_exchange; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.yg_exchange AS
 SELECT ratings.beer_name,
    ratings.brewery,
    ratings.style,
    count(*) AS rating_count,
    round(avg(ratings.yg_value), 2) AS yg_rate,
    round(avg(ratings.rating), 2) AS avg_stars,
    min(ratings.yg_value) AS yg_low,
    max(ratings.yg_value) AS yg_high
   FROM public.ratings
  WHERE (ratings.yg_value IS NOT NULL)
  GROUP BY ratings.beer_name, ratings.brewery, ratings.style
  ORDER BY (round(avg(ratings.yg_value), 2)) DESC;


ALTER TABLE public.yg_exchange OWNER TO postgres;

--
-- Name: buckets; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.buckets (
    id text NOT NULL,
    name text NOT NULL,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE storage.buckets OWNER TO supabase_storage_admin;

--
-- Name: migrations; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.migrations (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    hash character varying(40) NOT NULL,
    executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE storage.migrations OWNER TO supabase_storage_admin;

--
-- Name: objects; Type: TABLE; Schema: storage; Owner: supabase_storage_admin
--

CREATE TABLE storage.objects (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    bucket_id text,
    name text,
    owner uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_accessed_at timestamp with time zone DEFAULT now(),
    metadata jsonb
);


ALTER TABLE storage.objects OWNER TO supabase_storage_admin;

--
-- Name: decrypted_secrets; Type: VIEW; Schema: vault; Owner: supabase_admin
--

CREATE VIEW vault.decrypted_secrets AS
 SELECT secrets.id,
    secrets.name,
    secrets.description,
    secrets.secret,
        CASE
            WHEN (secrets.secret IS NULL) THEN NULL::text
            ELSE
            CASE
                WHEN (secrets.key_id IS NULL) THEN NULL::text
                ELSE convert_from(pgsodium.crypto_aead_det_decrypt(decode(secrets.secret, 'base64'::text), convert_to(((((secrets.id)::text || secrets.description) || (secrets.created_at)::text) || (secrets.updated_at)::text), 'utf8'::name), secrets.key_id, secrets.nonce), 'utf8'::name)
            END
        END AS decrypted_secret,
    secrets.key_id,
    secrets.nonce,
    secrets.created_at,
    secrets.updated_at
   FROM vault.secrets;


ALTER TABLE vault.decrypted_secrets OWNER TO supabase_admin;

--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('auth.refresh_tokens_id_seq'::regclass);


--
-- Name: flavor_descriptors id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flavor_descriptors ALTER COLUMN id SET DEFAULT nextval('public.flavor_descriptors_id_seq'::regclass);


--
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.audit_log_entries (instance_id, id, payload, created_at) FROM stdin;
\.


--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.instances (id, uuid, raw_base_config, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.refresh_tokens (instance_id, id, token, user_id, revoked, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.schema_migrations (version) FROM stdin;
20171026211738
20171026211808
20171026211834
20180103212743
20180108183307
20180119214651
20180125194653
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

COPY auth.users (instance_id, id, aud, role, email, encrypted_password, confirmed_at, invited_at, confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at, email_change_token, email_change, email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: key; Type: TABLE DATA; Schema: pgsodium; Owner: supabase_admin
--

COPY pgsodium.key (id, status, created, expires, key_type, key_id, key_context, name, associated_data, raw_key, raw_key_nonce, parent_key, comment, user_data) FROM stdin;
\.


--
-- Data for Name: beer_aliases; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.beer_aliases (id, beer_id, alias_name, normalized_alias, source, created_at) FROM stdin;
\.


--
-- Data for Name: beer_styles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.beer_styles (id, name, category, description, abv_min, abv_max, ibu_min, ibu_max) FROM stdin;
57f92e5b-1461-4c1c-b0d4-24a66e9af46f	American Light Lager	Lager	Light American lager	2.80	4.20	8	12
f106a59b-2afd-4e18-9451-2ddd8a048dbb	American Lager	Lager	American standard lager	4.20	5.30	8	18
c31bfa91-ab1d-4600-b5f1-c75126351b51	Cream Ale	Hybrid	Cream ale	4.20	5.60	8	20
29ec70ef-7887-4dda-8372-68eb8389bb94	American Wheat Beer	Wheat	American wheat	4.00	5.50	15	30
d4b21ba2-52a7-4df6-b9fb-89da0d78fe57	International Pale Lager	Lager	International pale lager	4.50	6.00	18	25
24229cbd-6b49-4b77-910b-fec8d7708c2f	International Amber Lager	Lager	International amber lager	4.60	6.00	8	25
5b6100ff-04fa-47b9-9edb-f784e40019c1	International Dark Lager	Lager	International dark lager	4.20	6.00	8	20
24a16c25-6ff9-4fbe-99db-515a5b5eb97d	Czech Pale Lager	Lager	Czech pale lager	3.00	4.10	20	35
cd08f59f-ca00-42b1-bd42-f8b09ff17704	Czech Premium Pale Lager	Lager	Czech premium pale lager	4.20	5.80	30	45
b6c92711-ac13-4cf7-a2a3-1018e7980119	Czech Amber Lager	Lager	Czech amber lager	4.40	5.80	20	35
adabc210-a4e8-483a-9a43-8dc590cd74e0	Czech Dark Lager	Lager	Czech dark lager	4.40	5.80	18	34
edfa8cfc-2d35-4e54-beea-5f93119c5b4d	Munich Helles	Lager	Munich Helles	4.70	5.40	16	22
bb5b6b36-a480-4c44-9f14-c12641856ff3	Festbier	Lager	Festbier	5.80	6.30	18	25
f8592ec3-d338-44b9-95a6-394bb303f624	Helles Bock	Bock	Helles Bock	6.30	7.40	23	35
7910082f-a7d2-4b1f-87e3-1eda7bdbb03b	German Leichtbier	Lager	German Leichtbier	2.40	3.60	15	28
68a1fb1c-c213-4f9c-aa11-fa2ba5949622	Kolsch	Hybrid	Kolsch	4.40	5.20	18	30
dfee2448-b397-409a-aff1-49345019a3aa	German Helles Export	Lager	German Helles Export	5.00	6.00	20	30
2459a6cc-c2a0-4840-bf6c-d647cc151f11	German Pils	Lager	German Pils	4.40	5.20	22	40
c876c0f4-6470-4d09-99c5-bf9388c15fe1	Marzen	Lager	Marzen	5.80	6.30	18	24
9275b028-e37b-4b23-b575-e2ae11ed9bc4	Rauchbier	Lager	Rauchbier	5.10	6.00	20	30
5c25a8a4-49d3-4dcd-9c88-f9225465c97b	Dunkles Bock	Bock	Dunkles Bock	6.30	7.20	20	27
5986904c-4dbf-4e8b-892b-d95e8ae00d24	Eisbock	Bock	Eisbock	9.00	14.00	25	35
ab811c0a-a9b3-42a8-ad99-f96e4b51d9aa	Baltic Porter	Porter	Baltic Porter	6.50	9.50	20	40
c619d211-7d7e-4d33-9a21-19f67ec81219	American Pale Ale	Pale Ale	American Pale Ale	4.50	5.40	30	50
46ee689e-4e9f-4950-aa9d-dbd7fb6f1459	American IPA	IPA	American IPA	5.50	7.50	40	70
dc55fff2-c6c0-444b-ba3c-4306d07defa9	Imperial IPA	IPA	Imperial IPA	7.50	10.00	65	100
e9071061-583a-4280-b22e-70580c44ce38	Hazy IPA	IPA	Hazy IPA	5.50	7.50	35	70
6680a084-dbf6-4ee2-8d6f-5f66edfbfcd2	British Golden Ale	Pale Ale	British Golden Ale	3.80	5.00	20	45
3b49e680-2423-46d3-8085-6775e71708bd	Australian Sparkling Ale	Pale Ale	Australian Sparkling Ale	4.50	6.00	20	35
19b1bb21-577b-45d4-a32a-2738017fa716	English Pale Ale	Pale Ale	English Pale Ale	4.00	5.50	20	40
1fa0ff29-f4a9-45dd-90e0-4f30e70d0950	American Amber Ale	Amber/Red	American Amber Ale	4.50	6.20	25	45
27a0b356-31b0-4837-9980-ab36ee17e334	California Common	Amber/Red	California Common	4.50	5.50	30	45
e6a0b7fa-21f1-4796-9a60-00ec04226166	American Brown Ale	Brown Ale	American Brown Ale	4.30	6.20	25	45
5986d7cd-f776-41c5-af28-fe3ca5b517bc	English Brown Ale	Brown Ale	English Brown Ale	4.00	5.40	20	30
60068c02-79aa-45d3-acc8-ee6ee92ab7a7	Brown Porter	Porter	Brown Porter	4.00	5.40	18	35
4f850cda-8cf0-4421-b5a4-de8ec7c2d1dc	Robust Porter	Porter	Robust Porter	4.80	6.50	25	50
5432c9a1-c608-4561-96ea-8b17a9008c49	Irish Stout	Stout	Irish Stout	4.00	4.50	25	45
99b68f96-af49-41fb-bec9-f7ee97dea42b	Sweet Stout	Stout	Sweet Stout	4.00	6.00	20	40
da2c3d8b-07b9-46ca-90d3-816f1afe5314	Oatmeal Stout	Stout	Oatmeal Stout	4.20	5.90	25	40
a794069f-d727-4308-ba3d-6a242ee08eda	American Stout	Stout	American Stout	5.00	7.00	35	75
f7506901-e224-40a6-98d6-c6532fa0866e	Imperial Stout	Stout	Imperial Stout	8.00	12.00	50	90
93e25453-cdbe-4a0c-ab60-5109c25a2e9c	Irish Extra Stout	Stout	Irish Extra Stout	5.50	6.50	35	50
a5c08ef2-d0c9-44a2-b99d-6e9c86f0a49d	Milk Stout	Stout	Milk Stout	4.00	6.00	15	40
558714cc-68b4-4f18-9816-f1f1f9fc7150	Scottish Light	Amber/Red	Scottish Light	2.50	3.20	10	20
72b0c64b-480a-474e-b114-8819699e4db7	Scottish Heavy	Amber/Red	Scottish Heavy	3.20	3.90	12	20
e8a51407-49bd-47a7-92f5-be71154919b5	Scottish Export	Amber/Red	Scottish Export	3.90	5.00	15	30
1aa21301-dadc-4b37-bdba-9840d789f111	Irish Red Ale	Amber/Red	Irish Red Ale	4.00	5.00	18	28
ad2f8a56-cf5e-4de6-8e52-4b4a7bd616eb	American Strong Ale	Strong Ale	American Strong Ale	6.00	10.00	50	100
55fb6466-88cc-4f8b-8751-ed4e070e74e9	English Barleywine	Barleywine	English Barleywine	8.00	12.00	35	70
00e46f34-f37d-43d2-828f-d0d5f5f54cbb	American Barleywine	Barleywine	American Barleywine	8.00	12.00	50	100
55bd8239-4c45-425b-96e2-5156219d0224	Witbier	Belgian	Witbier	4.50	5.50	8	20
f58cb0c2-7faf-4ca3-9386-fa64787ee93b	Belgian Pale Ale	Belgian	Belgian Pale Ale	4.80	5.50	20	30
88aabedb-c9fb-49df-9ddb-291e7e6897a6	Saison	Belgian	Saison	5.00	7.00	20	35
85acafbd-8428-4e28-ac5b-792e4765f260	Belgian Blond Ale	Belgian	Belgian Blond Ale	6.00	7.50	15	30
f23af3c5-f180-4018-86d2-c03116760204	Belgian Dubbel	Belgian	Belgian Dubbel	6.00	7.60	15	25
53d58cc4-ff9a-42ec-92c5-e1a409c5d294	Belgian Tripel	Belgian	Belgian Tripel	7.50	9.50	20	40
73bf815d-d3c5-43f4-ac92-1f3ed97b096e	Belgian Golden Strong	Belgian	Belgian Golden Strong	7.50	10.50	22	35
b8fe42d4-d018-4292-bde6-0fa68d2dc4d8	Belgian Dark Strong	Belgian	Belgian Dark Strong	8.00	12.00	20	35
345bcb53-f7bf-4bb5-8f12-53503062865b	Flanders Red	Sour/Wild	Flanders Red	4.60	6.50	10	25
26d126d4-6726-4ace-97b6-6da1ece351f8	Flanders Brown	Sour/Wild	Flanders Brown	4.00	8.00	10	25
f2331ce8-226c-46a3-981a-554cd092e45e	Gueuze	Sour/Wild	Gueuze	5.00	8.00	0	15
8422eacf-4ffd-4906-8024-92fe76289e30	Lambic	Sour/Wild	Lambic	5.00	6.50	0	10
1ec8ce8f-f43c-4f79-9936-edd878ed2f43	Berliner Weisse	Sour/Wild	Berliner Weisse	2.80	3.80	3	8
05059198-7f2b-477d-9c14-354cfb2a5d7b	Gose	Sour/Wild	Gose	4.20	4.80	5	12
a0f694a4-e726-441e-b6aa-acda90a75085	American Wild Ale	Sour/Wild	American Wild Ale	4.00	8.00	0	30
b6d34e08-d6dd-43bb-bc80-1cffdc3dfbab	Weissbier	Wheat	Weissbier	4.30	5.60	8	15
cda1fb6b-4711-4f6a-a06f-df837552652a	Dunkles Weissbier	Wheat	Dunkles Weissbier	4.30	5.60	10	18
ece2316b-ff88-4f1e-9119-d19901895ae8	Weizenbock	Wheat	Weizenbock	6.50	9.00	15	30
53b58345-d823-48b3-9733-7357954e0eef	Ordinary Bitter	Pale Ale	Ordinary Bitter	3.20	3.80	25	35
21fa15e6-5fb9-44a5-a56c-e3b4330edf6c	Best Bitter	Pale Ale	Best Bitter	3.80	4.60	25	40
0f5e4a24-dbfc-4f43-9b4d-2caefb64fb91	Strong Bitter	Pale Ale	Strong Bitter	4.60	6.20	30	50
cc2f3485-3632-4e09-b8da-1d758b9fae86	English Mild	Brown Ale	English Mild	3.00	3.80	10	25
a51f3c43-8a46-488c-a31c-2c8aeaa824ce	Old Ale	Strong Ale	Old Ale	5.50	9.00	30	55
c4078f45-156f-4db1-83b0-2c022c7fe3ce	English IPA	IPA	English IPA	5.00	7.50	40	60
80256207-8479-4342-842b-52420cf46c85	Dark Mild	Brown Ale	Dark Mild	3.00	3.80	10	25
8b6c0fae-8f06-42e4-831c-79b52c3cf2fb	Doppelbock	Bock	Doppelbock	7.00	10.00	16	26
8e1d0c4e-95f6-4f8d-a12b-e834d38fcd84	Maibock	Bock	Maibock	6.30	7.40	23	35
d6c761ba-b1ce-4483-8ccb-f4c4adc6b601	Schwarzbier	Lager	Schwarzbier	4.40	5.40	22	32
b6b10f00-cf9e-44a0-9bca-2daab83bba5f	Vienna Lager	Lager	Vienna Lager	4.70	5.50	18	30
d88e6f33-19f0-47bb-95a6-8d0db91a65e2	Altbier	Amber/Red	Altbier	4.30	5.50	25	50
1398a4b8-2416-4cf9-bc33-da894dbdf4e3	Dusseldorf Altbier	Amber/Red	Dusseldorf Altbier	4.50	5.20	35	50
6505d716-039d-4285-9823-5d8e39cdf415	Kellerbier	Lager	Kellerbier	4.70	5.40	20	35
62f131e5-7a61-43e5-bce0-d75d0c0e83c1	Kentucky Common	Hybrid	Kentucky Common	4.00	5.50	15	30
8b297afd-f485-4a9d-9fec-7f2652daa321	Pre-Prohibition Lager	Lager	Pre-Prohibition Lager	4.50	6.00	25	40
32696b4a-8653-48cf-bb0b-040222503fe9	Pre-Prohibition Porter	Porter	Pre-Prohibition Porter	4.50	6.00	20	30
e02cdeb5-cfe2-46d2-81bc-3846c7dfcb1e	Rye Beer	Hybrid	Rye Beer	4.00	6.00	25	45
eccfb1e9-c35f-46d6-a92a-46d271c86f48	Fruit Beer	Specialty	Fruit Beer	2.50	7.00	5	70
93b6a10e-9ccc-40f7-a5a5-6ac8fc1482de	Spice Beer	Specialty	Spice Beer	2.50	12.00	5	70
2b43947d-6580-4676-9aad-bb885e1d8dfc	Smoke Beer	Specialty	Smoke Beer	4.00	6.00	20	40
19335e89-771e-4127-9f1c-340b45837306	Winter Warmer	Strong Ale	Winter Warmer	5.50	9.00	20	45
004de797-c588-4b8e-b999-c43aeeb0b9b2	Honey Beer	Specialty	Honey Beer	3.50	7.00	10	40
584ed210-bdd6-484f-99b0-7a6742c55659	Roggenbier	Wheat	Roggenbier	4.50	6.00	15	30
9b3d01ad-da6a-4a23-8c74-5c3fd6e0a2d4	New Zealand Pilsner	Lager	New Zealand Pilsner	4.50	5.50	25	45
3dd7fbf4-f135-46e7-9a18-a29588169cf0	Belgian Single	Belgian	Belgian Single	4.50	5.50	20	35
c66ce6f6-f647-4010-b08c-926a3e6d1c2c	Dark Lager	Lager	Dark Lager	4.00	6.00	14	28
3a631e9e-e21d-492b-8d63-228590f919a1	Pale Lager	Lager	Pale Lager	4.00	6.00	18	35
a8694714-3246-4f57-9a5a-f143fba0d991	Pilsner	Lager	Pilsner	4.20	5.50	22	40
cccbfbd2-2574-4f5f-8788-1ad4d4095a80	Bock	Bock	Bock	6.00	7.50	20	30
014ca727-f1a5-4c3e-aefd-03a1ac364767	Chocolate Stout	Stout	Chocolate Stout	4.00	6.00	20	40
edba43fb-8a95-4593-aa73-a84299e63625	Coffee Stout	Stout	Coffee Stout	4.00	7.00	25	50
0fd5fd5e-a55e-4e8f-9d5d-0e8fb235b306	Pale Ale	Pale Ale	Pale Ale	4.00	5.50	20	45
0fc27df8-8525-46fd-8473-10a124afe271	IPA	IPA	IPA	5.00	7.50	40	70
5082a6b7-c620-4880-9cbe-b2e7dcdfc976	Porter	Porter	Porter	4.00	6.50	18	50
901a957a-d62c-4d5d-a625-9ca8ddf03ab2	Stout	Stout	Stout	4.00	7.00	25	60
dcae4335-90a4-423f-ba08-29f91cc9d2a6	Barleywine	Barleywine	Barleywine	8.00	12.00	35	100
\.


--
-- Data for Name: beers; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.beers (id, name, slug, normalized_name, brewery_id, brewery_name, style, style_category, style_source, abv, ibu_min, ibu_max, srm, flavor_astringency, flavor_body, flavor_alcohol, flavor_bitter, flavor_sweet, flavor_sour, flavor_salty, flavor_fruity, flavor_hoppy, flavor_spicy, flavor_malty, review_aroma, review_appearance, review_palate, review_taste, review_overall, review_count, description, flavor_notes, ingredients, food_pairings, image_url, label_url, source, source_id, source_brewery_id, import_batch_id, verified, submitted_by, crew_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: breweries; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.breweries (id, name, slug, normalized_name, street, city, state, postal_code, country, latitude, longitude, phone, website_url, referral_url, brewery_type, logo_url, description, source, source_id, import_batch_id, verified, claimed, crew_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: brewery_aliases; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.brewery_aliases (id, brewery_id, alias_name, normalized_alias, source, created_at) FROM stdin;
\.


--
-- Data for Name: flavor_descriptors; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.flavor_descriptors (id, category, keyword, impact) FROM stdin;
1	fruity	berries	1
2	fruity	berry	1
3	fruity	blabaer	1
4	fruity	blackberries	1
5	fruity	blackberry	1
6	fruity	blackcurrant	1
7	fruity	blue	1
8	fruity	blueberries	1
9	fruity	blueberry	1
10	fruity	boysenberries	1
11	fruity	boysenberry	1
12	fruity	cassis	1
13	fruity	cherries	1
14	fruity	cherry	1
15	fruity	cranberries	1
16	fruity	cranberry	1
17	fruity	currant	1
18	fruity	currants	1
19	fruity	date	1
20	fruity	dates	1
21	fruity	elderberries	1
22	fruity	elderberry	1
23	fruity	fig	1
24	fruity	figgy	1
25	fruity	figs	1
26	fruity	fruit	1
27	fruity	fruited	1
28	fruity	fruitier	1
29	fruity	fruitiness	1
30	fruity	fruiting	1
31	fruity	fruitness	1
32	fruity	fruits	1
33	fruity	goose	1
34	fruity	gooseberries	1
35	fruity	gooseberry	1
36	fruity	grape	1
37	fruity	grapes	1
38	fruity	juice	1
39	fruity	juiced	1
40	fruity	juices	1
41	fruity	juiciness	1
42	fruity	juicy	1
43	fruity	lingonberries	1
44	fruity	maraschino	1
45	fruity	plum	1
46	fruity	plums	1
47	fruity	pluots	1
48	fruity	pomegranate	1
49	fruity	pomegranates	1
50	fruity	prune	1
51	fruity	raisin	1
52	fruity	raisins	1
53	fruity	raisiny	1
54	fruity	raspberries	1
55	fruity	raspberry	1
56	fruity	rhubarb	1
57	fruity	strawberries	1
58	fruity	strawberry	1
59	fruity	berried	1
60	fruity	rasberries	1
61	fruity	mulberries	1
62	fruity	blackcurrants	1
63	fruity	blackcurrent	1
64	fruity	cherrys	1
65	fruity	redcurrant	1
66	fruity	lingonberry	1
67	fruity	plumy	1
68	fruity	plume	1
69	fruity	plummy	1
70	fruity	pluot	1
71	fruity	pruney	1
72	fruity	prunes	1
73	fruity	apple	1
74	fruity	apples	1
75	fruity	bergamot	1
76	fruity	citra	1
77	fruity	citric	1
78	fruity	citron	1
79	fruity	citrus	1
80	fruity	citrusy	1
81	fruity	clementine	1
82	fruity	grapefruit	1
83	fruity	grapefruits	1
84	fruity	kumquat	1
85	fruity	kumquats	1
86	fruity	lemon	1
87	fruity	lemonade	1
88	fruity	lemondrop	1
89	fruity	lemongrass	1
90	fruity	lemons	1
91	fruity	lemony	1
92	fruity	lime	1
93	fruity	limes	1
94	fruity	mandarin	1
95	fruity	mandarina	1
96	fruity	orange	1
97	fruity	oranges	1
98	fruity	orangey	1
99	fruity	tangelo	1
100	fruity	tangerine	1
101	fruity	yuzu	1
102	fruity	zest	1
103	fruity	zesty	1
104	fruity	tangerines	1
105	fruity	fruitty	1
106	fruity	fruiter	1
107	fruity	frutiness	1
108	fruity	fruityness	1
109	fruity	fruittyness	1
110	fruity	clementines	1
111	fruity	grapefruity	1
112	fruity	grapfruit	1
113	fruity	grapefuit	1
114	fruity	lemmon	1
115	fruity	limey	1
116	fruity	mandarins	1
117	fruity	orang	1
118	fruity	orangy	1
119	fruity	orangeish	1
120	fruity	orangish	1
121	fruity	zestiness	1
122	fruity	apricot	1
123	fruity	apricots	1
124	fruity	banana	1
125	fruity	bananas	1
126	fruity	cantaloupe	1
127	fruity	cider	1
128	fruity	coconut	1
129	fruity	ester	1
130	fruity	esters	1
131	fruity	estery	1
132	fruity	honeydew	1
133	fruity	kiwi	1
134	fruity	kiwifruit	1
135	fruity	kiwis	1
136	fruity	koji	1
137	fruity	lychee	1
138	fruity	mango	1
139	fruity	mangos	1
140	fruity	melon	1
141	fruity	melons	1
142	fruity	mongo	1
143	fruity	nectar	1
144	fruity	nectarine	1
145	fruity	nectars	1
146	fruity	papaya	1
147	fruity	passionfruit	1
148	fruity	peach	1
149	fruity	peaches	1
150	fruity	peachyness	1
151	fruity	pear	1
152	fruity	pears	1
153	fruity	pineapple	1
154	fruity	pumpkin	1
155	fruity	pumpkins	1
156	fruity	pumpkiny	1
157	fruity	tropical	1
158	fruity	watermelon	1
159	fruity	yams	1
160	fruity	cantelope	1
161	fruity	nectary	1
162	fruity	nectarines	1
163	fruity	pineapples	1
164	fruity	bannana	1
165	fruity	bananna	1
166	fruity	coconuts	1
167	fruity	lychees	1
168	fruity	mang	1
169	fruity	mangoes	1
170	fruity	peachy	1
171	fruity	pumkin	1
172	fruity	tropicals	1
173	fruity	topical	1
174	fruity	watermelons	1
175	hoppy	ahtanum	1
176	hoppy	amarillo	1
177	hoppy	apollo	1
178	hoppy	azacca	1
179	hoppy	bitter	1
180	hoppy	bittered	1
181	hoppy	bitterhop	1
182	hoppy	bittering	1
183	hoppy	bitterly	1
184	hoppy	bitterness	1
185	hoppy	bitters	1
186	hoppy	bittersweet	1
187	hoppy	bittnerness	1
188	hoppy	chinook	1
189	hoppy	cypress	1
190	hoppy	czech	1
191	hoppy	forest	1
192	hoppy	forester	1
193	hoppy	forests	1
194	hoppy	fuggle	1
195	hoppy	fuggles	1
196	hoppy	golding	1
197	hoppy	goldings	1
198	hoppy	hallaertau	1
199	hoppy	hallartau	1
200	hoppy	hallertau	1
201	hoppy	hallertauer	1
202	hoppy	hallertaur	1
203	hoppy	hallerteau	1
204	hoppy	hop	1
205	hoppy	hopped	1
206	hoppy	hoppier	1
207	hoppy	hoppiest	1
208	hoppy	hoppin	1
209	hoppy	hoppiness	1
210	hoppy	hopping	1
211	hoppy	hoppings	1
212	hoppy	hoppy	1
213	hoppy	hops	1
214	hoppy	mosaic	1
215	hoppy	mosaics	1
216	hoppy	myrcene	1
217	hoppy	palisade	1
218	hoppy	resin	1
219	hoppy	resinous	1
220	hoppy	resins	1
221	hoppy	resiny	1
222	hoppy	saaz	1
223	hoppy	tettanang	1
224	hoppy	tettnang	1
225	hoppy	willamette	1
226	hoppy	willamettehops	1
227	hoppy	williamette	1
228	hoppy	hopy	1
229	hoppy	hoppyness	1
230	hoppy	mosiac	1
231	hoppy	tettnanger	1
232	hoppy	earthyness	1
233	hoppy	earth	1
234	hoppy	earthiness	1
235	hoppy	earthy	1
236	hoppy	forrest	1
237	hoppy	foresty	1
238	hoppy	pines	1
239	hoppy	pine	1
240	hoppy	piney	1
241	hoppy	piny	1
242	hoppy	sprucey	1
243	hoppy	sprucy	1
244	hoppy	earthly	1
245	hoppy	earthen	1
246	hoppy	grasses	1
247	hoppy	gassy	1
248	hoppy	basil	1
249	hoppy	cilantro	1
250	hoppy	clover	1
251	hoppy	clovers	1
252	hoppy	coriander	1
253	hoppy	corriander	1
254	hoppy	herb	1
255	hoppy	herbaceous	1
256	hoppy	herbaceousness	1
257	hoppy	herbed	1
258	hoppy	herbs	1
259	hoppy	lawn	1
260	hoppy	lawns	1
261	hoppy	mint	1
262	hoppy	minty	1
263	hoppy	parsley	1
264	hoppy	peppermint	1
265	hoppy	rosemary	1
266	hoppy	saffron	1
267	hoppy	sage	1
268	hoppy	spearmint	1
269	hoppy	spruce	1
270	hoppy	tea	1
271	hoppy	thistle	1
272	hoppy	thyme	1
273	hoppy	ulmaria	1
274	hoppy	herby	1
275	hoppy	herbal	1
276	hoppy	herbacious	1
277	hoppy	herbals	1
278	hoppy	teas	1
279	hoppy	chive	1
280	hoppy	blooms	1
281	hoppy	blossom	1
282	hoppy	blossoms	1
283	hoppy	botanical	1
284	hoppy	botanicals	1
285	hoppy	cologne	1
286	hoppy	daisy	1
287	hoppy	dandelion	1
288	hoppy	elderberries	1
289	hoppy	elderberry	1
290	hoppy	elderflower	1
291	hoppy	evergreen	1
292	hoppy	fern	1
293	hoppy	flora	1
294	hoppy	floral	1
295	hoppy	florals	1
296	hoppy	flower	1
297	hoppy	flowers	1
298	hoppy	flowery	1
299	hoppy	foliage	1
300	hoppy	grass	1
301	hoppy	grassy	1
302	hoppy	hibiscus	1
303	hoppy	holly	1
304	hoppy	honeysuckle	1
305	hoppy	lavender	1
306	hoppy	perfume	1
307	hoppy	perfumed	1
308	hoppy	rosa	1
309	hoppy	rose	1
310	hoppy	roses	1
311	hoppy	rosie	1
312	hoppy	wildflower	1
313	hoppy	wildflowers	1
314	hoppy	bloom	1
315	hoppy	florally	1
316	hoppy	florality	1
317	hoppy	floralness	1
318	hoppy	sunflower	1
319	hoppy	perfumey	1
320	hoppy	perfumes	1
321	hoppy	perfumy	1
322	hoppy	rosey	1
323	spices	absinthe	1
324	spices	allspice	1
325	spices	anise	1
326	spices	aniseed	1
327	spices	annatto	1
328	spices	bragget	1
329	spices	braggot	1
330	spices	cask	1
331	spices	casks	1
332	spices	cardamom	1
333	spices	cardamon	1
334	spices	cinnamon	1
335	spices	clove	1
336	spices	cloves	1
337	spices	cumin	1
338	spices	ginger	1
339	spices	nutmeg	1
340	spices	pepper	1
341	spices	peppercorn	1
342	spices	peppercorns	1
343	spices	peppered	1
344	spices	peppery	1
345	spices	spice	1
346	spices	spiced	1
347	spices	spices	1
348	spices	spiciness	1
349	spices	spicing	1
350	spices	vanilla	1
351	spices	vanille	1
352	spices	vanillla	1
353	spices	anis	1
354	spices	cinamon	1
355	spices	gingery	1
356	spices	spiceness	1
357	spices	spiceyness	1
358	spices	spicyness	1
359	spices	vanillas	1
360	spices	ancho	1
361	spices	bacon	1
362	spices	barbecue	1
363	spices	barbecues	1
364	spices	barbeque	1
365	spices	barbeques	1
366	spices	bbq	1
367	spices	bbqs	1
368	spices	capsaicin	1
369	spices	cayenne	1
370	spices	chile	1
371	spices	chiles	1
372	spices	chili	1
373	spices	chilies	1
374	spices	chilis	1
375	spices	chillies	1
376	spices	chillis	1
377	spices	chipotle	1
378	spices	chipotles	1
379	spices	cigar	1
380	spices	curries	1
381	spices	curry	1
382	spices	habanero	1
383	spices	habaneros	1
384	spices	habenero	1
385	spices	hickory	1
386	spices	jalape	1
387	spices	jalapeno	1
388	spices	jalapenos	1
389	spices	peppers	1
390	spices	serano	1
391	spices	serrano	1
392	spices	sichuan	1
393	spices	smoke	1
394	spices	smoked	1
395	spices	smokehouse	1
396	spices	smokemalt	1
397	spices	smoker	1
398	spices	smokestack	1
399	spices	smokey	1
400	spices	smokiness	1
401	spices	smoking	1
402	spices	smoky	1
403	spices	spicier	1
404	spices	spicy	1
405	spices	tandoori	1
406	spices	tobacco	1
407	spices	vindaloo	1
408	spices	bacony	1
409	spices	barbecued	1
410	spices	chilie	1
411	spices	chilli	1
412	spices	cigars	1
413	spices	jalepeno	1
414	spices	smokes	1
415	spices	smokier	1
416	spices	smokyness	1
417	spices	smokeyness	1
418	spices	smokiest	1
419	spices	tabacco	1
420	spices	spicey	1
421	spices	pepperoni	1
422	malty	amaranth	1
423	malty	azrael	1
424	malty	barley	1
425	malty	barleymalt	1
426	malty	barleys	1
427	malty	biscotti	1
428	malty	biscuit	1
429	malty	biscuits	1
430	malty	biscuity	1
431	malty	bisque	1
432	malty	bisquit	1
433	malty	bourbon	1
434	malty	bourbons	1
435	malty	bread	1
436	malty	breads	1
437	malty	bready	1
438	malty	buckwheat	1
439	malty	cereal	1
440	malty	cereals	1
441	malty	cookie	1
442	malty	cookies	1
443	malty	cracker	1
444	malty	crackers	1
445	malty	crackery	1
446	malty	doughnut	1
447	malty	doughnuts	1
448	malty	doughy	1
449	malty	faro	1
450	malty	fruitcake	1
451	malty	fruitcakes	1
452	malty	gingerbread	1
453	malty	graham	1
454	malty	grain	1
455	malty	grains	1
456	malty	grainy	1
457	malty	granola	1
458	malty	grits	1
459	malty	gritty	1
460	malty	koji	1
461	malty	koshihikari	1
462	malty	malt	1
463	malty	malted	1
464	malty	maltier	1
465	malty	maltiness	1
466	malty	malting	1
467	malty	maltings	1
468	malty	malto	1
469	malty	maltose	1
470	malty	malts	1
471	malty	malty	1
472	malty	molasses	1
473	malty	oat	1
474	malty	oatmeal	1
475	malty	oats	1
476	malty	pancakes	1
477	malty	pie	1
478	malty	pies	1
479	malty	pumpernickel	1
480	malty	quinoa	1
481	malty	rice	1
482	malty	rye	1
483	malty	ryed	1
484	malty	sourdough	1
485	malty	wheat	1
486	malty	wheated	1
487	malty	wheatey	1
488	malty	wheatier	1
489	malty	wheatly	1
490	malty	wheaty	1
491	malty	moleasses	1
492	malty	molassesy	1
493	malty	molassess	1
494	malty	molases	1
495	malty	mollases	1
496	malty	molassis	1
497	malty	molassas	1
498	malty	donuts	1
499	malty	mapley	1
500	malty	oatiness	1
501	malty	maltness	1
502	malty	bisuit	1
503	malty	biscut	1
504	malty	buiscuity	1
505	malty	buscuit	1
506	malty	biscuty	1
507	malty	buscuity	1
508	malty	biscuitiness	1
509	malty	bisquity	1
510	malty	breaddy	1
511	malty	cerealy	1
512	malty	cereales	1
513	malty	dough	1
514	malty	faros	1
515	malty	grainey	1
516	malty	grained	1
517	malty	malta	1
518	malty	maltly	1
519	malty	maltyness	1
520	malty	oaty	1
521	malty	pancake	1
522	malty	ricey	1
523	malty	ryes	1
524	malty	wheats	1
525	malty	wheaties	1
526	malty	almond	1
527	malty	almonds	1
528	malty	anjilanaka	1
529	malty	askinosie	1
530	malty	brandied	1
531	malty	brandy	1
532	malty	brownie	1
533	malty	brownies	1
534	malty	brulee	1
535	malty	bruleed	1
536	malty	butter	1
537	malty	buttery	1
538	malty	butterscotch	1
539	malty	cacao	1
540	malty	cacoa	1
541	malty	cappuccino	1
542	malty	caramel	1
543	malty	caramelised	1
544	malty	caramelized	1
545	malty	caramelly	1
546	malty	caramelo	1
547	malty	caramely	1
548	malty	carmel	1
549	malty	carmelization	1
550	malty	carmelized	1
551	malty	carmelly	1
552	malty	castanea	1
553	malty	chestnut	1
554	malty	chestnuts	1
555	malty	chocoalte	1
556	malty	chocolate	1
557	malty	chocolately	1
558	malty	chocolates	1
559	malty	chocolatey	1
560	malty	chocolatiers	1
561	malty	chocolaty	1
562	malty	cocoa	1
563	malty	coffee	1
564	malty	coffees	1
565	malty	dessert	1
566	malty	desserts	1
567	malty	espress	1
568	malty	espresso	1
569	malty	flan	1
570	malty	frappuccino	1
571	malty	fudge	1
572	malty	fudgey	1
573	malty	hazelnut	1
574	malty	hazelnuts	1
575	malty	honey	1
576	malty	horchata	1
577	malty	java	1
578	malty	maple	1
579	malty	mocha	1
580	malty	nougat	1
581	malty	nugget	1
582	malty	nut	1
583	malty	nuts	1
584	malty	nuttier	1
585	malty	nuttiness	1
586	malty	nutty	1
587	malty	oreo	1
588	malty	peanut	1
589	malty	peanuted	1
590	malty	peanuts	1
591	malty	pecan	1
592	malty	pecans	1
593	malty	pudding	1
594	malty	puddings	1
595	malty	rich	1
596	malty	richer	1
597	malty	richest	1
598	malty	richly	1
599	malty	richness	1
600	malty	riich	1
601	malty	seed	1
602	malty	seeded	1
603	malty	seeds	1
604	malty	toffee	1
605	malty	walnut	1
606	malty	walnuts	1
607	malty	chocholate	1
608	malty	choclate	1
609	malty	chcolate	1
610	malty	chocolatiness	1
611	malty	coco	1
612	malty	coca	1
613	malty	choco	1
614	malty	coffe	1
615	malty	cofee	1
616	malty	acorns	1
617	malty	acorn	1
618	malty	cinnabon	1
619	malty	chesnut	1
620	malty	express	1
621	malty	expresso	1
622	malty	fudgy	1
623	malty	hazlenut	1
624	malty	nutiness	1
625	malty	nuttyness	1
626	malty	oreos	1
627	malty	seedy	1
628	malty	toffe	1
629	malty	tofee	1
630	malty	toffeeish	1
\.


--
-- Data for Name: happy_hours; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.happy_hours (id, venue_id, day_of_week, start_time, end_time, description, reported_by, reported_at, confirmed_count, last_confirmed_at) FROM stdin;
\.


--
-- Data for Name: price_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.price_logs (id, venue_id, beer_name, style, price_cents, is_happy_hour, rating_id, logged_by, logged_at, confirmed_count, last_confirmed_at) FROM stdin;
ee18b54c-3336-4545-b9a7-00a7703d486a	5517575a-d56a-4aea-a8c6-42907f55ddec	Vienna Lager	Lager	400	t	\N	3bcee0a9-3f2b-4cea-98fd-21fc4ca8f2c5	2026-02-16 02:37:21.136268+00	1	2026-02-16 02:37:21.136268+00
bffe7bba-6603-448e-ba3c-d2d38ae4fa47	e71980a7-9e37-4d03-b791-53d9ba4379c2	Hoppy Cream Ale	Cream Ale	400	t	\N	3bcee0a9-3f2b-4cea-98fd-21fc4ca8f2c5	2026-02-16 03:40:38.214129+00	1	2026-02-16 03:40:38.214129+00
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.profiles (id, display_name, email, avatar_url, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: ratings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ratings (id, user_id, user_name, beer_name, brewery, style, abv, rating, flavor_hoppy, flavor_malty, flavor_bitter, flavor_sweet, flavor_fruity, notes, created_at, yg_value, latitude, longitude, location_name, venue_id, photo_url, beer_id) FROM stdin;
b945471e-43d0-448f-8bc7-59709875aa38	3bcee0a9-3f2b-4cea-98fd-21fc4ca8f2c5	test1	Rambo's Lager	Rambo's Outpost	Lager	4.8	5	3	4	1	2	1	amazing	2026-02-14 21:59:28.195763+00	\N	\N	\N	\N	\N	\N	\N
ec94719c-4d51-41d1-97f0-d1a28041ba26	3bcee0a9-3f2b-4cea-98fd-21fc4ca8f2c5	test1	Vienna Lager	Devil's Backbone	Lager	4.4	5	3	3	2	1	0		2026-02-16 02:37:20.968037+00	9.0	37.512180	-77.632069	12401, Sandbag Circle, Midlothian, Chesterfield County, Virginia, 23113, United States	\N	\N	\N
10591e52-61ce-474e-9904-fe3b2269e62a	3bcee0a9-3f2b-4cea-98fd-21fc4ca8f2c5	test1	Hoppy Cream Ale	Genesee	Cream Ale	4.4	5	4	3	1	2	1		2026-02-16 03:40:38.100447+00	5.0	37.511936	-77.632126	12403, Sandbag Circle, Midlothian, Chesterfield County, Virginia, 23113, United States	\N	\N	\N
c9652dae-2d39-4d4b-8250-2158bceebbde	061d5154-c846-49e5-9758-d279bb3ab8bd	rambo	Falcon Smash	Triple Crossing Brewing Company (Fullton)	IPA	7.0	5	4	2	2	1	3		2026-02-17 17:14:08.948856+00	10.0	\N	\N	123 dzo	\N	\N	\N
\.


--
-- Data for Name: reactions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.reactions (id, rating_id, user_id, reaction_type, created_at) FROM stdin;
8f8ef156-4861-48fc-bfae-8d86d2550806	ec94719c-4d51-41d1-97f0-d1a28041ba26	061d5154-c846-49e5-9758-d279bb3ab8bd	cheers	2026-02-17 11:48:11.828461+00
2ee11c99-de58-43dd-90ad-4e0f2bc6d360	b945471e-43d0-448f-8bc7-59709875aa38	061d5154-c846-49e5-9758-d279bb3ab8bd	cheers	2026-02-17 11:48:13.220264+00
c5b57703-63e6-4628-a1c2-7c2d0dc73315	10591e52-61ce-474e-9904-fe3b2269e62a	061d5154-c846-49e5-9758-d279bb3ab8bd	cheers	2026-02-17 12:06:22.983752+00
\.


--
-- Data for Name: venues; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.venues (id, name, address, latitude, longitude, created_by, created_at, updated_at) FROM stdin;
5517575a-d56a-4aea-a8c6-42907f55ddec	12401, Sandbag Circle, Midlothian, Chesterfield County, Virginia, 23113, United States	\N	37.512180	-77.632069	3bcee0a9-3f2b-4cea-98fd-21fc4ca8f2c5	2026-02-16 02:37:21.055227+00	2026-02-16 02:37:21.055227+00
e71980a7-9e37-4d03-b791-53d9ba4379c2	12403, Sandbag Circle, Midlothian, Chesterfield County, Virginia, 23113, United States	\N	37.511936	-77.632126	3bcee0a9-3f2b-4cea-98fd-21fc4ca8f2c5	2026-02-16 03:40:38.128945+00	2026-02-16 03:40:38.128945+00
\.


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.buckets (id, name, owner, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: migrations; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.migrations (id, name, hash, executed_at) FROM stdin;
\.


--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

COPY storage.objects (id, bucket_id, name, owner, created_at, updated_at, last_accessed_at, metadata) FROM stdin;
\.


--
-- Data for Name: secrets; Type: TABLE DATA; Schema: vault; Owner: supabase_admin
--

COPY vault.secrets (id, name, description, secret, key_id, nonce, created_at, updated_at) FROM stdin;
\.


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('auth.refresh_tokens_id_seq', 1, false);


--
-- Name: key_key_id_seq; Type: SEQUENCE SET; Schema: pgsodium; Owner: supabase_admin
--

SELECT pg_catalog.setval('pgsodium.key_key_id_seq', 1, false);


--
-- Name: flavor_descriptors_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.flavor_descriptors_id_seq', 630, true);


--
-- Name: audit_log_entries audit_log_entries_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.audit_log_entries
    ADD CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id);


--
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: auth; Owner: supabase_auth_admin
--

ALTER TABLE ONLY auth.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: beer_aliases beer_aliases_beer_id_normalized_alias_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.beer_aliases
    ADD CONSTRAINT beer_aliases_beer_id_normalized_alias_key UNIQUE (beer_id, normalized_alias);


--
-- Name: beer_aliases beer_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.beer_aliases
    ADD CONSTRAINT beer_aliases_pkey PRIMARY KEY (id);


--
-- Name: beer_styles beer_styles_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.beer_styles
    ADD CONSTRAINT beer_styles_name_key UNIQUE (name);


--
-- Name: beer_styles beer_styles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.beer_styles
    ADD CONSTRAINT beer_styles_pkey PRIMARY KEY (id);


--
-- Name: beers beers_brewery_id_normalized_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.beers
    ADD CONSTRAINT beers_brewery_id_normalized_name_key UNIQUE (brewery_id, normalized_name);


--
-- Name: beers beers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.beers
    ADD CONSTRAINT beers_pkey PRIMARY KEY (id);


--
-- Name: breweries breweries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.breweries
    ADD CONSTRAINT breweries_pkey PRIMARY KEY (id);


--
-- Name: breweries breweries_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.breweries
    ADD CONSTRAINT breweries_slug_key UNIQUE (slug);


--
-- Name: brewery_aliases brewery_aliases_brewery_id_normalized_alias_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.brewery_aliases
    ADD CONSTRAINT brewery_aliases_brewery_id_normalized_alias_key UNIQUE (brewery_id, normalized_alias);


--
-- Name: brewery_aliases brewery_aliases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.brewery_aliases
    ADD CONSTRAINT brewery_aliases_pkey PRIMARY KEY (id);


--
-- Name: flavor_descriptors flavor_descriptors_category_keyword_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flavor_descriptors
    ADD CONSTRAINT flavor_descriptors_category_keyword_key UNIQUE (category, keyword);


--
-- Name: flavor_descriptors flavor_descriptors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.flavor_descriptors
    ADD CONSTRAINT flavor_descriptors_pkey PRIMARY KEY (id);


--
-- Name: happy_hours happy_hours_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.happy_hours
    ADD CONSTRAINT happy_hours_pkey PRIMARY KEY (id);


--
-- Name: price_logs price_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_logs
    ADD CONSTRAINT price_logs_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: ratings ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_pkey PRIMARY KEY (id);


--
-- Name: reactions reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reactions
    ADD CONSTRAINT reactions_pkey PRIMARY KEY (id);


--
-- Name: reactions reactions_rating_id_user_id_reaction_type_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reactions
    ADD CONSTRAINT reactions_rating_id_user_id_reaction_type_key UNIQUE (rating_id, user_id, reaction_type);


--
-- Name: venues venues_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.venues
    ADD CONSTRAINT venues_pkey PRIMARY KEY (id);


--
-- Name: buckets buckets_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_pkey PRIMARY KEY (id);


--
-- Name: migrations migrations_name_key; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_name_key UNIQUE (name);


--
-- Name: migrations migrations_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.migrations
    ADD CONSTRAINT migrations_pkey PRIMARY KEY (id);


--
-- Name: objects objects_pkey; Type: CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_instance_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id);


--
-- Name: refresh_tokens_instance_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id);


--
-- Name: refresh_tokens_instance_id_user_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id);


--
-- Name: refresh_tokens_token_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX refresh_tokens_token_idx ON auth.refresh_tokens USING btree (token);


--
-- Name: users_instance_id_email_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, email);


--
-- Name: users_instance_id_idx; Type: INDEX; Schema: auth; Owner: supabase_auth_admin
--

CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id);


--
-- Name: idx_beer_aliases_normalized; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_beer_aliases_normalized ON public.beer_aliases USING btree (normalized_alias);


--
-- Name: idx_beer_aliases_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_beer_aliases_trgm ON public.beer_aliases USING gin (alias_name public.gin_trgm_ops);


--
-- Name: idx_beers_brewery_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_beers_brewery_id ON public.beers USING btree (brewery_id);


--
-- Name: idx_beers_name_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_beers_name_trgm ON public.beers USING gin (name public.gin_trgm_ops);


--
-- Name: idx_beers_normalized_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_beers_normalized_name ON public.beers USING btree (normalized_name);


--
-- Name: idx_beers_review_count; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_beers_review_count ON public.beers USING btree (review_count DESC NULLS LAST);


--
-- Name: idx_beers_review_overall; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_beers_review_overall ON public.beers USING btree (review_overall DESC NULLS LAST);


--
-- Name: idx_beers_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_beers_slug ON public.beers USING btree (slug);


--
-- Name: idx_beers_source; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_beers_source ON public.beers USING btree (source);


--
-- Name: idx_beers_style; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_beers_style ON public.beers USING btree (style);


--
-- Name: idx_beers_style_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_beers_style_category ON public.beers USING btree (style_category);


--
-- Name: idx_breweries_city_state; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_breweries_city_state ON public.breweries USING btree (state, city);


--
-- Name: idx_breweries_geo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_breweries_geo ON public.breweries USING btree (latitude, longitude);


--
-- Name: idx_breweries_name_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_breweries_name_trgm ON public.breweries USING gin (name public.gin_trgm_ops);


--
-- Name: idx_breweries_normalized_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_breweries_normalized_name ON public.breweries USING btree (normalized_name);


--
-- Name: idx_breweries_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_breweries_slug ON public.breweries USING btree (slug);


--
-- Name: idx_breweries_source; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_breweries_source ON public.breweries USING btree (source);


--
-- Name: idx_brewery_aliases_normalized; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_brewery_aliases_normalized ON public.brewery_aliases USING btree (normalized_alias);


--
-- Name: idx_brewery_aliases_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_brewery_aliases_trgm ON public.brewery_aliases USING gin (alias_name public.gin_trgm_ops);


--
-- Name: idx_descriptors_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_descriptors_category ON public.flavor_descriptors USING btree (category);


--
-- Name: idx_happy_hours_day; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_happy_hours_day ON public.happy_hours USING btree (day_of_week);


--
-- Name: idx_happy_hours_venue; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_happy_hours_venue ON public.happy_hours USING btree (venue_id);


--
-- Name: idx_price_logs_beer; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_price_logs_beer ON public.price_logs USING btree (beer_name);


--
-- Name: idx_price_logs_logged_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_price_logs_logged_at ON public.price_logs USING btree (logged_at DESC);


--
-- Name: idx_price_logs_venue; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_price_logs_venue ON public.price_logs USING btree (venue_id);


--
-- Name: idx_ratings_beer_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ratings_beer_id ON public.ratings USING btree (beer_id);


--
-- Name: idx_ratings_beer_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ratings_beer_name ON public.ratings USING btree (beer_name);


--
-- Name: idx_ratings_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ratings_created_at ON public.ratings USING btree (created_at DESC);


--
-- Name: idx_ratings_rating; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ratings_rating ON public.ratings USING btree (rating);


--
-- Name: idx_ratings_style; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ratings_style ON public.ratings USING btree (style);


--
-- Name: idx_ratings_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ratings_user_id ON public.ratings USING btree (user_id);


--
-- Name: idx_reactions_rating; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_reactions_rating ON public.reactions USING btree (rating_id);


--
-- Name: idx_venues_geo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_geo ON public.venues USING btree (latitude, longitude);


--
-- Name: idx_venues_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_venues_name ON public.venues USING btree (name);


--
-- Name: bname; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name);


--
-- Name: bucketid_objname; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name);


--
-- Name: name_prefix_search; Type: INDEX; Schema: storage; Owner: supabase_storage_admin
--

CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops);


--
-- Name: beers beers_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER beers_updated_at BEFORE UPDATE ON public.beers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: breweries breweries_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER breweries_updated_at BEFORE UPDATE ON public.breweries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: profiles profiles_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: beer_aliases beer_aliases_beer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.beer_aliases
    ADD CONSTRAINT beer_aliases_beer_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id) ON DELETE CASCADE;


--
-- Name: beers beers_brewery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.beers
    ADD CONSTRAINT beers_brewery_id_fkey FOREIGN KEY (brewery_id) REFERENCES public.breweries(id) ON DELETE SET NULL;


--
-- Name: brewery_aliases brewery_aliases_brewery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.brewery_aliases
    ADD CONSTRAINT brewery_aliases_brewery_id_fkey FOREIGN KEY (brewery_id) REFERENCES public.breweries(id) ON DELETE CASCADE;


--
-- Name: happy_hours happy_hours_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.happy_hours
    ADD CONSTRAINT happy_hours_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: price_logs price_logs_rating_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_logs
    ADD CONSTRAINT price_logs_rating_id_fkey FOREIGN KEY (rating_id) REFERENCES public.ratings(id) ON DELETE SET NULL;


--
-- Name: price_logs price_logs_venue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_logs
    ADD CONSTRAINT price_logs_venue_id_fkey FOREIGN KEY (venue_id) REFERENCES public.venues(id) ON DELETE CASCADE;


--
-- Name: ratings ratings_beer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT ratings_beer_id_fkey FOREIGN KEY (beer_id) REFERENCES public.beers(id) ON DELETE SET NULL;


--
-- Name: reactions reactions_rating_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.reactions
    ADD CONSTRAINT reactions_rating_id_fkey FOREIGN KEY (rating_id) REFERENCES public.ratings(id) ON DELETE CASCADE;


--
-- Name: buckets buckets_owner_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.buckets
    ADD CONSTRAINT buckets_owner_fkey FOREIGN KEY (owner) REFERENCES auth.users(id);


--
-- Name: objects objects_bucketId_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id);


--
-- Name: objects objects_owner_fkey; Type: FK CONSTRAINT; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE ONLY storage.objects
    ADD CONSTRAINT objects_owner_fkey FOREIGN KEY (owner) REFERENCES auth.users(id);


--
-- Name: objects; Type: ROW SECURITY; Schema: storage; Owner: supabase_storage_admin
--

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

--
-- Name: supabase_realtime; Type: PUBLICATION; Schema: -; Owner: postgres
--

CREATE PUBLICATION supabase_realtime WITH (publish = 'insert, update, delete, truncate');


ALTER PUBLICATION supabase_realtime OWNER TO postgres;

--
-- Name: supabase_realtime ratings; Type: PUBLICATION TABLE; Schema: public; Owner: postgres
--

ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.ratings;


--
-- Name: SCHEMA auth; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA auth TO anon;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT ALL ON SCHEMA auth TO supabase_auth_admin;
GRANT ALL ON SCHEMA auth TO dashboard_user;
GRANT ALL ON SCHEMA auth TO postgres;


--
-- Name: SCHEMA extensions; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA extensions TO anon;
GRANT USAGE ON SCHEMA extensions TO authenticated;
GRANT USAGE ON SCHEMA extensions TO service_role;
GRANT ALL ON SCHEMA extensions TO dashboard_user;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: SCHEMA realtime; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT USAGE ON SCHEMA realtime TO postgres;


--
-- Name: SCHEMA storage; Type: ACL; Schema: -; Owner: supabase_admin
--

GRANT ALL ON SCHEMA storage TO postgres;
GRANT USAGE ON SCHEMA storage TO anon;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT USAGE ON SCHEMA storage TO service_role;
GRANT ALL ON SCHEMA storage TO supabase_storage_admin;
GRANT ALL ON SCHEMA storage TO dashboard_user;


--
-- Name: FUNCTION gtrgm_in(cstring); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.gtrgm_in(cstring) TO postgres;
GRANT ALL ON FUNCTION public.gtrgm_in(cstring) TO anon;
GRANT ALL ON FUNCTION public.gtrgm_in(cstring) TO authenticated;
GRANT ALL ON FUNCTION public.gtrgm_in(cstring) TO service_role;


--
-- Name: FUNCTION gtrgm_out(public.gtrgm); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.gtrgm_out(public.gtrgm) TO postgres;
GRANT ALL ON FUNCTION public.gtrgm_out(public.gtrgm) TO anon;
GRANT ALL ON FUNCTION public.gtrgm_out(public.gtrgm) TO authenticated;
GRANT ALL ON FUNCTION public.gtrgm_out(public.gtrgm) TO service_role;


--
-- Name: FUNCTION email(); Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON FUNCTION auth.email() TO dashboard_user;


--
-- Name: FUNCTION role(); Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON FUNCTION auth.role() TO dashboard_user;


--
-- Name: FUNCTION uid(); Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON FUNCTION auth.uid() TO dashboard_user;


--
-- Name: FUNCTION algorithm_sign(signables text, secret text, algorithm text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.algorithm_sign(signables text, secret text, algorithm text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.algorithm_sign(signables text, secret text, algorithm text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION armor(bytea); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.armor(bytea) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.armor(bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION armor(bytea, text[], text[]); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.armor(bytea, text[], text[]) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.armor(bytea, text[], text[]) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION crypt(text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.crypt(text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.crypt(text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION dearmor(text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.dearmor(text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.dearmor(text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION decrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.decrypt(bytea, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.decrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION decrypt_iv(bytea, bytea, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.decrypt_iv(bytea, bytea, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.decrypt_iv(bytea, bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION digest(bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.digest(bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.digest(bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION digest(text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.digest(text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.digest(text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION encrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.encrypt(bytea, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.encrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION encrypt_iv(bytea, bytea, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.encrypt_iv(bytea, bytea, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.encrypt_iv(bytea, bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION gen_random_bytes(integer); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.gen_random_bytes(integer) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.gen_random_bytes(integer) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION gen_random_uuid(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.gen_random_uuid() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.gen_random_uuid() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION gen_salt(text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.gen_salt(text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.gen_salt(text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION gen_salt(text, integer); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.gen_salt(text, integer) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.gen_salt(text, integer) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION grant_pg_cron_access(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.grant_pg_cron_access() FROM postgres;
GRANT ALL ON FUNCTION extensions.grant_pg_cron_access() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.grant_pg_cron_access() TO dashboard_user;


--
-- Name: FUNCTION grant_pg_graphql_access(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.grant_pg_graphql_access() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION grant_pg_net_access(); Type: ACL; Schema: extensions; Owner: postgres
--

REVOKE ALL ON FUNCTION extensions.grant_pg_net_access() FROM postgres;
GRANT ALL ON FUNCTION extensions.grant_pg_net_access() TO postgres WITH GRANT OPTION;
GRANT ALL ON FUNCTION extensions.grant_pg_net_access() TO dashboard_user;


--
-- Name: FUNCTION hmac(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.hmac(bytea, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.hmac(bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION hmac(text, text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.hmac(text, text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.hmac(text, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT blk_read_time double precision, OUT blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT blk_read_time double precision, OUT blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pg_stat_statements_reset(userid oid, dbid oid, queryid bigint); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pg_stat_statements_reset(userid oid, dbid oid, queryid bigint) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_armor_headers(text, OUT key text, OUT value text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_armor_headers(text, OUT key text, OUT value text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_armor_headers(text, OUT key text, OUT value text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_key_id(bytea); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_key_id(bytea) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_key_id(bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_decrypt(bytea, bytea, text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_decrypt_bytea(bytea, bytea, text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_encrypt(text, bytea); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_encrypt(text, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt(text, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_encrypt_bytea(bytea, bytea); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_pub_encrypt_bytea(bytea, bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_decrypt(bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_decrypt(bytea, text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt(bytea, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_decrypt_bytea(bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_decrypt_bytea(bytea, text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_encrypt(text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_encrypt(text, text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt(text, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_encrypt_bytea(bytea, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgp_sym_encrypt_bytea(bytea, text, text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text, text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text, text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgrst_ddl_watch(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgrst_ddl_watch() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION pgrst_drop_watch(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.pgrst_drop_watch() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION set_graphql_placeholder(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.set_graphql_placeholder() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION sign(payload json, secret text, algorithm text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.sign(payload json, secret text, algorithm text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.sign(payload json, secret text, algorithm text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION try_cast_double(inp text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.try_cast_double(inp text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.try_cast_double(inp text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION url_decode(data text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.url_decode(data text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.url_decode(data text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION url_encode(data bytea); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.url_encode(data bytea) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.url_encode(data bytea) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_generate_v1(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_generate_v1() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_generate_v1() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_generate_v1mc(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_generate_v1mc() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_generate_v1mc() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_generate_v3(namespace uuid, name text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_generate_v3(namespace uuid, name text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_generate_v3(namespace uuid, name text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_generate_v4(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_generate_v4() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_generate_v4() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_generate_v5(namespace uuid, name text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_generate_v5(namespace uuid, name text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_generate_v5(namespace uuid, name text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_nil(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_nil() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_nil() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_ns_dns(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_ns_dns() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_ns_dns() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_ns_oid(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_ns_oid() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_ns_oid() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_ns_url(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_ns_url() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_ns_url() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION uuid_ns_x500(); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.uuid_ns_x500() TO dashboard_user;
GRANT ALL ON FUNCTION extensions.uuid_ns_x500() TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION verify(token text, secret text, algorithm text); Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON FUNCTION extensions.verify(token text, secret text, algorithm text) TO dashboard_user;
GRANT ALL ON FUNCTION extensions.verify(token text, secret text, algorithm text) TO postgres WITH GRANT OPTION;


--
-- Name: FUNCTION exception(message text); Type: ACL; Schema: graphql; Owner: supabase_admin
--

GRANT ALL ON FUNCTION graphql.exception(message text) TO postgres;
GRANT ALL ON FUNCTION graphql.exception(message text) TO anon;
GRANT ALL ON FUNCTION graphql.exception(message text) TO authenticated;
GRANT ALL ON FUNCTION graphql.exception(message text) TO service_role;


--
-- Name: FUNCTION graphql("operationName" text, query text, variables jsonb, extensions jsonb); Type: ACL; Schema: graphql_public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO postgres;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO anon;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO authenticated;
GRANT ALL ON FUNCTION graphql_public.graphql("operationName" text, query text, variables jsonb, extensions jsonb) TO service_role;


--
-- Name: FUNCTION get_auth(p_usename text); Type: ACL; Schema: pgbouncer; Owner: postgres
--

REVOKE ALL ON FUNCTION pgbouncer.get_auth(p_usename text) FROM PUBLIC;
GRANT ALL ON FUNCTION pgbouncer.get_auth(p_usename text) TO pgbouncer;


--
-- Name: FUNCTION crypto_aead_det_decrypt(message bytea, additional bytea, key_uuid uuid, nonce bytea); Type: ACL; Schema: pgsodium; Owner: pgsodium_keymaker
--

GRANT ALL ON FUNCTION pgsodium.crypto_aead_det_decrypt(message bytea, additional bytea, key_uuid uuid, nonce bytea) TO service_role;


--
-- Name: FUNCTION crypto_aead_det_encrypt(message bytea, additional bytea, key_uuid uuid, nonce bytea); Type: ACL; Schema: pgsodium; Owner: pgsodium_keymaker
--

GRANT ALL ON FUNCTION pgsodium.crypto_aead_det_encrypt(message bytea, additional bytea, key_uuid uuid, nonce bytea) TO service_role;


--
-- Name: FUNCTION crypto_aead_det_keygen(); Type: ACL; Schema: pgsodium; Owner: supabase_admin
--

GRANT ALL ON FUNCTION pgsodium.crypto_aead_det_keygen() TO service_role;


--
-- Name: FUNCTION gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal) TO postgres;
GRANT ALL ON FUNCTION public.gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal) TO anon;
GRANT ALL ON FUNCTION public.gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal) TO authenticated;
GRANT ALL ON FUNCTION public.gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal) TO service_role;


--
-- Name: FUNCTION gin_extract_value_trgm(text, internal); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.gin_extract_value_trgm(text, internal) TO postgres;
GRANT ALL ON FUNCTION public.gin_extract_value_trgm(text, internal) TO anon;
GRANT ALL ON FUNCTION public.gin_extract_value_trgm(text, internal) TO authenticated;
GRANT ALL ON FUNCTION public.gin_extract_value_trgm(text, internal) TO service_role;


--
-- Name: FUNCTION gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal) TO postgres;
GRANT ALL ON FUNCTION public.gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal) TO anon;
GRANT ALL ON FUNCTION public.gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal) TO authenticated;
GRANT ALL ON FUNCTION public.gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal) TO service_role;


--
-- Name: FUNCTION gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal) TO postgres;
GRANT ALL ON FUNCTION public.gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal) TO anon;
GRANT ALL ON FUNCTION public.gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal) TO authenticated;
GRANT ALL ON FUNCTION public.gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal) TO service_role;


--
-- Name: FUNCTION gtrgm_compress(internal); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.gtrgm_compress(internal) TO postgres;
GRANT ALL ON FUNCTION public.gtrgm_compress(internal) TO anon;
GRANT ALL ON FUNCTION public.gtrgm_compress(internal) TO authenticated;
GRANT ALL ON FUNCTION public.gtrgm_compress(internal) TO service_role;


--
-- Name: FUNCTION gtrgm_consistent(internal, text, smallint, oid, internal); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.gtrgm_consistent(internal, text, smallint, oid, internal) TO postgres;
GRANT ALL ON FUNCTION public.gtrgm_consistent(internal, text, smallint, oid, internal) TO anon;
GRANT ALL ON FUNCTION public.gtrgm_consistent(internal, text, smallint, oid, internal) TO authenticated;
GRANT ALL ON FUNCTION public.gtrgm_consistent(internal, text, smallint, oid, internal) TO service_role;


--
-- Name: FUNCTION gtrgm_decompress(internal); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.gtrgm_decompress(internal) TO postgres;
GRANT ALL ON FUNCTION public.gtrgm_decompress(internal) TO anon;
GRANT ALL ON FUNCTION public.gtrgm_decompress(internal) TO authenticated;
GRANT ALL ON FUNCTION public.gtrgm_decompress(internal) TO service_role;


--
-- Name: FUNCTION gtrgm_distance(internal, text, smallint, oid, internal); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.gtrgm_distance(internal, text, smallint, oid, internal) TO postgres;
GRANT ALL ON FUNCTION public.gtrgm_distance(internal, text, smallint, oid, internal) TO anon;
GRANT ALL ON FUNCTION public.gtrgm_distance(internal, text, smallint, oid, internal) TO authenticated;
GRANT ALL ON FUNCTION public.gtrgm_distance(internal, text, smallint, oid, internal) TO service_role;


--
-- Name: FUNCTION gtrgm_options(internal); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.gtrgm_options(internal) TO postgres;
GRANT ALL ON FUNCTION public.gtrgm_options(internal) TO anon;
GRANT ALL ON FUNCTION public.gtrgm_options(internal) TO authenticated;
GRANT ALL ON FUNCTION public.gtrgm_options(internal) TO service_role;


--
-- Name: FUNCTION gtrgm_penalty(internal, internal, internal); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.gtrgm_penalty(internal, internal, internal) TO postgres;
GRANT ALL ON FUNCTION public.gtrgm_penalty(internal, internal, internal) TO anon;
GRANT ALL ON FUNCTION public.gtrgm_penalty(internal, internal, internal) TO authenticated;
GRANT ALL ON FUNCTION public.gtrgm_penalty(internal, internal, internal) TO service_role;


--
-- Name: FUNCTION gtrgm_picksplit(internal, internal); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.gtrgm_picksplit(internal, internal) TO postgres;
GRANT ALL ON FUNCTION public.gtrgm_picksplit(internal, internal) TO anon;
GRANT ALL ON FUNCTION public.gtrgm_picksplit(internal, internal) TO authenticated;
GRANT ALL ON FUNCTION public.gtrgm_picksplit(internal, internal) TO service_role;


--
-- Name: FUNCTION gtrgm_same(public.gtrgm, public.gtrgm, internal); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.gtrgm_same(public.gtrgm, public.gtrgm, internal) TO postgres;
GRANT ALL ON FUNCTION public.gtrgm_same(public.gtrgm, public.gtrgm, internal) TO anon;
GRANT ALL ON FUNCTION public.gtrgm_same(public.gtrgm, public.gtrgm, internal) TO authenticated;
GRANT ALL ON FUNCTION public.gtrgm_same(public.gtrgm, public.gtrgm, internal) TO service_role;


--
-- Name: FUNCTION gtrgm_union(internal, internal); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.gtrgm_union(internal, internal) TO postgres;
GRANT ALL ON FUNCTION public.gtrgm_union(internal, internal) TO anon;
GRANT ALL ON FUNCTION public.gtrgm_union(internal, internal) TO authenticated;
GRANT ALL ON FUNCTION public.gtrgm_union(internal, internal) TO service_role;


--
-- Name: FUNCTION search_beer_catalog(search_term text, max_results integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.search_beer_catalog(search_term text, max_results integer) TO anon;
GRANT ALL ON FUNCTION public.search_beer_catalog(search_term text, max_results integer) TO authenticated;
GRANT ALL ON FUNCTION public.search_beer_catalog(search_term text, max_results integer) TO service_role;


--
-- Name: FUNCTION set_limit(real); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.set_limit(real) TO postgres;
GRANT ALL ON FUNCTION public.set_limit(real) TO anon;
GRANT ALL ON FUNCTION public.set_limit(real) TO authenticated;
GRANT ALL ON FUNCTION public.set_limit(real) TO service_role;


--
-- Name: FUNCTION show_limit(); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.show_limit() TO postgres;
GRANT ALL ON FUNCTION public.show_limit() TO anon;
GRANT ALL ON FUNCTION public.show_limit() TO authenticated;
GRANT ALL ON FUNCTION public.show_limit() TO service_role;


--
-- Name: FUNCTION show_trgm(text); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.show_trgm(text) TO postgres;
GRANT ALL ON FUNCTION public.show_trgm(text) TO anon;
GRANT ALL ON FUNCTION public.show_trgm(text) TO authenticated;
GRANT ALL ON FUNCTION public.show_trgm(text) TO service_role;


--
-- Name: FUNCTION similarity(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.similarity(text, text) TO postgres;
GRANT ALL ON FUNCTION public.similarity(text, text) TO anon;
GRANT ALL ON FUNCTION public.similarity(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.similarity(text, text) TO service_role;


--
-- Name: FUNCTION similarity_dist(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.similarity_dist(text, text) TO postgres;
GRANT ALL ON FUNCTION public.similarity_dist(text, text) TO anon;
GRANT ALL ON FUNCTION public.similarity_dist(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.similarity_dist(text, text) TO service_role;


--
-- Name: FUNCTION similarity_op(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.similarity_op(text, text) TO postgres;
GRANT ALL ON FUNCTION public.similarity_op(text, text) TO anon;
GRANT ALL ON FUNCTION public.similarity_op(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.similarity_op(text, text) TO service_role;


--
-- Name: FUNCTION strict_word_similarity(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.strict_word_similarity(text, text) TO postgres;
GRANT ALL ON FUNCTION public.strict_word_similarity(text, text) TO anon;
GRANT ALL ON FUNCTION public.strict_word_similarity(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.strict_word_similarity(text, text) TO service_role;


--
-- Name: FUNCTION strict_word_similarity_commutator_op(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.strict_word_similarity_commutator_op(text, text) TO postgres;
GRANT ALL ON FUNCTION public.strict_word_similarity_commutator_op(text, text) TO anon;
GRANT ALL ON FUNCTION public.strict_word_similarity_commutator_op(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.strict_word_similarity_commutator_op(text, text) TO service_role;


--
-- Name: FUNCTION strict_word_similarity_dist_commutator_op(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.strict_word_similarity_dist_commutator_op(text, text) TO postgres;
GRANT ALL ON FUNCTION public.strict_word_similarity_dist_commutator_op(text, text) TO anon;
GRANT ALL ON FUNCTION public.strict_word_similarity_dist_commutator_op(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.strict_word_similarity_dist_commutator_op(text, text) TO service_role;


--
-- Name: FUNCTION strict_word_similarity_dist_op(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.strict_word_similarity_dist_op(text, text) TO postgres;
GRANT ALL ON FUNCTION public.strict_word_similarity_dist_op(text, text) TO anon;
GRANT ALL ON FUNCTION public.strict_word_similarity_dist_op(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.strict_word_similarity_dist_op(text, text) TO service_role;


--
-- Name: FUNCTION strict_word_similarity_op(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.strict_word_similarity_op(text, text) TO postgres;
GRANT ALL ON FUNCTION public.strict_word_similarity_op(text, text) TO anon;
GRANT ALL ON FUNCTION public.strict_word_similarity_op(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.strict_word_similarity_op(text, text) TO service_role;


--
-- Name: FUNCTION update_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at() TO service_role;


--
-- Name: TABLE venues; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.venues TO anon;
GRANT ALL ON TABLE public.venues TO authenticated;
GRANT ALL ON TABLE public.venues TO service_role;


--
-- Name: FUNCTION venues_within_radius(lat numeric, lng numeric, radius_m integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.venues_within_radius(lat numeric, lng numeric, radius_m integer) TO anon;
GRANT ALL ON FUNCTION public.venues_within_radius(lat numeric, lng numeric, radius_m integer) TO authenticated;
GRANT ALL ON FUNCTION public.venues_within_radius(lat numeric, lng numeric, radius_m integer) TO service_role;


--
-- Name: FUNCTION word_similarity(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.word_similarity(text, text) TO postgres;
GRANT ALL ON FUNCTION public.word_similarity(text, text) TO anon;
GRANT ALL ON FUNCTION public.word_similarity(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.word_similarity(text, text) TO service_role;


--
-- Name: FUNCTION word_similarity_commutator_op(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.word_similarity_commutator_op(text, text) TO postgres;
GRANT ALL ON FUNCTION public.word_similarity_commutator_op(text, text) TO anon;
GRANT ALL ON FUNCTION public.word_similarity_commutator_op(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.word_similarity_commutator_op(text, text) TO service_role;


--
-- Name: FUNCTION word_similarity_dist_commutator_op(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.word_similarity_dist_commutator_op(text, text) TO postgres;
GRANT ALL ON FUNCTION public.word_similarity_dist_commutator_op(text, text) TO anon;
GRANT ALL ON FUNCTION public.word_similarity_dist_commutator_op(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.word_similarity_dist_commutator_op(text, text) TO service_role;


--
-- Name: FUNCTION word_similarity_dist_op(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.word_similarity_dist_op(text, text) TO postgres;
GRANT ALL ON FUNCTION public.word_similarity_dist_op(text, text) TO anon;
GRANT ALL ON FUNCTION public.word_similarity_dist_op(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.word_similarity_dist_op(text, text) TO service_role;


--
-- Name: FUNCTION word_similarity_op(text, text); Type: ACL; Schema: public; Owner: supabase_admin
--

GRANT ALL ON FUNCTION public.word_similarity_op(text, text) TO postgres;
GRANT ALL ON FUNCTION public.word_similarity_op(text, text) TO anon;
GRANT ALL ON FUNCTION public.word_similarity_op(text, text) TO authenticated;
GRANT ALL ON FUNCTION public.word_similarity_op(text, text) TO service_role;


--
-- Name: FUNCTION extension(name text); Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT ALL ON FUNCTION storage.extension(name text) TO anon;
GRANT ALL ON FUNCTION storage.extension(name text) TO authenticated;
GRANT ALL ON FUNCTION storage.extension(name text) TO service_role;
GRANT ALL ON FUNCTION storage.extension(name text) TO dashboard_user;
GRANT ALL ON FUNCTION storage.extension(name text) TO postgres;


--
-- Name: FUNCTION filename(name text); Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT ALL ON FUNCTION storage.filename(name text) TO anon;
GRANT ALL ON FUNCTION storage.filename(name text) TO authenticated;
GRANT ALL ON FUNCTION storage.filename(name text) TO service_role;
GRANT ALL ON FUNCTION storage.filename(name text) TO dashboard_user;
GRANT ALL ON FUNCTION storage.filename(name text) TO postgres;


--
-- Name: FUNCTION foldername(name text); Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT ALL ON FUNCTION storage.foldername(name text) TO anon;
GRANT ALL ON FUNCTION storage.foldername(name text) TO authenticated;
GRANT ALL ON FUNCTION storage.foldername(name text) TO service_role;
GRANT ALL ON FUNCTION storage.foldername(name text) TO dashboard_user;
GRANT ALL ON FUNCTION storage.foldername(name text) TO postgres;


--
-- Name: FUNCTION search(prefix text, bucketname text, limits integer, levels integer, offsets integer); Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT ALL ON FUNCTION storage.search(prefix text, bucketname text, limits integer, levels integer, offsets integer) TO anon;
GRANT ALL ON FUNCTION storage.search(prefix text, bucketname text, limits integer, levels integer, offsets integer) TO authenticated;
GRANT ALL ON FUNCTION storage.search(prefix text, bucketname text, limits integer, levels integer, offsets integer) TO service_role;
GRANT ALL ON FUNCTION storage.search(prefix text, bucketname text, limits integer, levels integer, offsets integer) TO dashboard_user;
GRANT ALL ON FUNCTION storage.search(prefix text, bucketname text, limits integer, levels integer, offsets integer) TO postgres;


--
-- Name: TABLE audit_log_entries; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.audit_log_entries TO dashboard_user;
GRANT ALL ON TABLE auth.audit_log_entries TO postgres;


--
-- Name: TABLE instances; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.instances TO dashboard_user;
GRANT ALL ON TABLE auth.instances TO postgres;


--
-- Name: TABLE refresh_tokens; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.refresh_tokens TO dashboard_user;
GRANT ALL ON TABLE auth.refresh_tokens TO postgres;


--
-- Name: SEQUENCE refresh_tokens_id_seq; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON SEQUENCE auth.refresh_tokens_id_seq TO dashboard_user;
GRANT ALL ON SEQUENCE auth.refresh_tokens_id_seq TO postgres;


--
-- Name: TABLE schema_migrations; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.schema_migrations TO dashboard_user;
GRANT ALL ON TABLE auth.schema_migrations TO postgres;


--
-- Name: TABLE users; Type: ACL; Schema: auth; Owner: supabase_auth_admin
--

GRANT ALL ON TABLE auth.users TO dashboard_user;
GRANT ALL ON TABLE auth.users TO postgres;


--
-- Name: TABLE pg_stat_statements; Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON TABLE extensions.pg_stat_statements TO postgres WITH GRANT OPTION;


--
-- Name: TABLE pg_stat_statements_info; Type: ACL; Schema: extensions; Owner: supabase_admin
--

GRANT ALL ON TABLE extensions.pg_stat_statements_info TO postgres WITH GRANT OPTION;


--
-- Name: TABLE decrypted_key; Type: ACL; Schema: pgsodium; Owner: supabase_admin
--

GRANT ALL ON TABLE pgsodium.decrypted_key TO pgsodium_keyholder;


--
-- Name: TABLE masking_rule; Type: ACL; Schema: pgsodium; Owner: supabase_admin
--

GRANT ALL ON TABLE pgsodium.masking_rule TO pgsodium_keyholder;


--
-- Name: TABLE mask_columns; Type: ACL; Schema: pgsodium; Owner: supabase_admin
--

GRANT ALL ON TABLE pgsodium.mask_columns TO pgsodium_keyholder;


--
-- Name: TABLE beer_aliases; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.beer_aliases TO anon;
GRANT ALL ON TABLE public.beer_aliases TO authenticated;
GRANT ALL ON TABLE public.beer_aliases TO service_role;


--
-- Name: TABLE ratings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ratings TO anon;
GRANT ALL ON TABLE public.ratings TO authenticated;
GRANT ALL ON TABLE public.ratings TO service_role;


--
-- Name: TABLE beer_averages; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.beer_averages TO anon;
GRANT ALL ON TABLE public.beer_averages TO authenticated;
GRANT ALL ON TABLE public.beer_averages TO service_role;


--
-- Name: TABLE beer_styles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.beer_styles TO anon;
GRANT ALL ON TABLE public.beer_styles TO authenticated;
GRANT ALL ON TABLE public.beer_styles TO service_role;


--
-- Name: TABLE beers; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.beers TO anon;
GRANT ALL ON TABLE public.beers TO authenticated;
GRANT ALL ON TABLE public.beers TO service_role;


--
-- Name: TABLE breweries; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.breweries TO anon;
GRANT ALL ON TABLE public.breweries TO authenticated;
GRANT ALL ON TABLE public.breweries TO service_role;


--
-- Name: TABLE brewery_aliases; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.brewery_aliases TO anon;
GRANT ALL ON TABLE public.brewery_aliases TO authenticated;
GRANT ALL ON TABLE public.brewery_aliases TO service_role;


--
-- Name: TABLE flavor_descriptors; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.flavor_descriptors TO anon;
GRANT ALL ON TABLE public.flavor_descriptors TO authenticated;
GRANT ALL ON TABLE public.flavor_descriptors TO service_role;


--
-- Name: SEQUENCE flavor_descriptors_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.flavor_descriptors_id_seq TO anon;
GRANT ALL ON SEQUENCE public.flavor_descriptors_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.flavor_descriptors_id_seq TO service_role;


--
-- Name: TABLE happy_hours; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.happy_hours TO anon;
GRANT ALL ON TABLE public.happy_hours TO authenticated;
GRANT ALL ON TABLE public.happy_hours TO service_role;


--
-- Name: TABLE price_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.price_logs TO anon;
GRANT ALL ON TABLE public.price_logs TO authenticated;
GRANT ALL ON TABLE public.price_logs TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE reactions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.reactions TO anon;
GRANT ALL ON TABLE public.reactions TO authenticated;
GRANT ALL ON TABLE public.reactions TO service_role;


--
-- Name: TABLE venue_menus; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.venue_menus TO anon;
GRANT ALL ON TABLE public.venue_menus TO authenticated;
GRANT ALL ON TABLE public.venue_menus TO service_role;


--
-- Name: TABLE yg_exchange; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.yg_exchange TO anon;
GRANT ALL ON TABLE public.yg_exchange TO authenticated;
GRANT ALL ON TABLE public.yg_exchange TO service_role;


--
-- Name: TABLE buckets; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT ALL ON TABLE storage.buckets TO anon;
GRANT ALL ON TABLE storage.buckets TO authenticated;
GRANT ALL ON TABLE storage.buckets TO service_role;
GRANT ALL ON TABLE storage.buckets TO postgres;


--
-- Name: TABLE migrations; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT ALL ON TABLE storage.migrations TO anon;
GRANT ALL ON TABLE storage.migrations TO authenticated;
GRANT ALL ON TABLE storage.migrations TO service_role;
GRANT ALL ON TABLE storage.migrations TO postgres;


--
-- Name: TABLE objects; Type: ACL; Schema: storage; Owner: supabase_storage_admin
--

GRANT ALL ON TABLE storage.objects TO anon;
GRANT ALL ON TABLE storage.objects TO authenticated;
GRANT ALL ON TABLE storage.objects TO service_role;
GRANT ALL ON TABLE storage.objects TO postgres;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: auth; Owner: supabase_auth_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON SEQUENCES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON SEQUENCES  TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: auth; Owner: supabase_auth_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON FUNCTIONS  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON FUNCTIONS  TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: auth; Owner: supabase_auth_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON TABLES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON TABLES  TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: extensions; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON SEQUENCES  TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: extensions; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON FUNCTIONS  TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: extensions; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA extensions GRANT ALL ON TABLES  TO postgres WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: graphql; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON SEQUENCES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: graphql; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON FUNCTIONS  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: graphql; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql GRANT ALL ON TABLES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: graphql_public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON SEQUENCES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: graphql_public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON FUNCTIONS  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: graphql_public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA graphql_public GRANT ALL ON TABLES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: pgsodium; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA pgsodium GRANT ALL ON SEQUENCES  TO pgsodium_keyholder;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: pgsodium; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA pgsodium GRANT ALL ON TABLES  TO pgsodium_keyholder;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: pgsodium_masks; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA pgsodium_masks GRANT ALL ON SEQUENCES  TO pgsodium_keyiduser;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: pgsodium_masks; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA pgsodium_masks GRANT ALL ON FUNCTIONS  TO pgsodium_keyiduser;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: pgsodium_masks; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA pgsodium_masks GRANT ALL ON TABLES  TO pgsodium_keyiduser;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: realtime; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON SEQUENCES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON SEQUENCES  TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: realtime; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON FUNCTIONS  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON FUNCTIONS  TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: realtime; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON TABLES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA realtime GRANT ALL ON TABLES  TO dashboard_user;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: storage; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON SEQUENCES  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: storage; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON FUNCTIONS  TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: storage; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES  TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES  TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES  TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA storage GRANT ALL ON TABLES  TO service_role;


--
-- Name: issue_graphql_placeholder; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
         WHEN TAG IN ('DROP EXTENSION')
   EXECUTE FUNCTION extensions.set_graphql_placeholder();


ALTER EVENT TRIGGER issue_graphql_placeholder OWNER TO supabase_admin;

--
-- Name: issue_pg_cron_access; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_cron_access();


ALTER EVENT TRIGGER issue_pg_cron_access OWNER TO supabase_admin;

--
-- Name: issue_pg_graphql_access; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
         WHEN TAG IN ('CREATE FUNCTION')
   EXECUTE FUNCTION extensions.grant_pg_graphql_access();


ALTER EVENT TRIGGER issue_pg_graphql_access OWNER TO supabase_admin;

--
-- Name: issue_pg_net_access; Type: EVENT TRIGGER; Schema: -; Owner: postgres
--

CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();


ALTER EVENT TRIGGER issue_pg_net_access OWNER TO postgres;

--
-- Name: pgrst_ddl_watch; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
   EXECUTE FUNCTION extensions.pgrst_ddl_watch();


ALTER EVENT TRIGGER pgrst_ddl_watch OWNER TO supabase_admin;

--
-- Name: pgrst_drop_watch; Type: EVENT TRIGGER; Schema: -; Owner: supabase_admin
--

CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
   EXECUTE FUNCTION extensions.pgrst_drop_watch();


ALTER EVENT TRIGGER pgrst_drop_watch OWNER TO supabase_admin;

--
-- PostgreSQL database dump complete
--

