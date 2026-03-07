-- Phase 2.10: Scheduler Idempotency and Pagination
-- Resolves: BE-H-01, BE-H-02, BE-H-03, BE-H-08
-- Creates job_runs tracking table, notification dedupe infrastructure, and
-- supporting RPCs that give scheduler scripts idempotency guards, distributed
-- locking, and deduplication for generated notifications.

--------------------------------------------------------------------------------
-- 1. Job-runs tracking table
-- Unique constraint on (job_name, week_start) prevents double-runs.
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_runs (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    job_name    TEXT NOT NULL,
    week_start  TIMESTAMPTZ NOT NULL,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    status      TEXT NOT NULL DEFAULT 'running'
                CHECK (status IN ('running', 'completed', 'failed')),
    users_processed INTEGER DEFAULT 0,
    UNIQUE (job_name, week_start)
);

CREATE INDEX IF NOT EXISTS idx_job_runs_name
    ON job_runs(job_name, week_start DESC);

--------------------------------------------------------------------------------
-- 2. Add week_start column to tab_notifications for scheduler dedupe.
-- Existing non-scheduler rows keep NULL; dedupe index is partial.
--------------------------------------------------------------------------------
ALTER TABLE tab_notifications
    ADD COLUMN IF NOT EXISTS week_start TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tab_notif_dedupe
    ON tab_notifications(user_id, notification_type, week_start)
    WHERE week_start IS NOT NULL;

--------------------------------------------------------------------------------
-- 3. RPC: claim_job_run
-- Atomically claims a job run for a given (job_name, week_start).
-- Uses a transaction-scoped advisory lock to serialise concurrent callers,
-- then checks whether a completed run already exists.
-- Returns TRUE if the caller should proceed, FALSE to skip (idempotent).
-- Crashed/failed runs are re-claimable (only 'completed' blocks re-entry).
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_job_run(
    p_job_name   text,
    p_week_start timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext(p_job_name));

    IF EXISTS (
        SELECT 1 FROM job_runs
        WHERE job_name = p_job_name
          AND week_start = p_week_start
          AND status = 'completed'
    ) THEN
        RETURN false;
    END IF;

    INSERT INTO job_runs (job_name, week_start, started_at, status)
    VALUES (p_job_name, p_week_start, now(), 'running')
    ON CONFLICT (job_name, week_start)
    DO UPDATE SET started_at      = now(),
                  status          = 'running',
                  completed_at    = NULL,
                  users_processed = 0;

    RETURN true;
END;
$$;

--------------------------------------------------------------------------------
-- 4. RPC: complete_job_run
-- Marks a running job as completed and records the user count.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION complete_job_run(
    p_job_name        text,
    p_week_start      timestamptz,
    p_users_processed integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE job_runs
    SET status          = 'completed',
        completed_at    = now(),
        users_processed = p_users_processed
    WHERE job_name = p_job_name
      AND week_start = p_week_start;
END;
$$;

--------------------------------------------------------------------------------
-- 5. RPC: fail_job_run
-- Marks a running job as failed so it can be re-claimed on retry.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fail_job_run(
    p_job_name   text,
    p_week_start timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE job_runs
    SET status       = 'failed',
        completed_at = now()
    WHERE job_name = p_job_name
      AND week_start = p_week_start;
END;
$$;

--------------------------------------------------------------------------------
-- 6. RPC: insert_scheduler_notification
-- Inserts a scheduler-generated notification with ON CONFLICT DO NOTHING,
-- relying on the partial unique index (user_id, notification_type, week_start)
-- to silently deduplicate repeat runs.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION insert_scheduler_notification(
    p_user_id           text,
    p_notification_type text,
    p_title             text,
    p_message           text,
    p_week_start        timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO tab_notifications
        (user_id, notification_type, title, message, week_start)
    VALUES
        (p_user_id, p_notification_type, p_title, p_message, p_week_start)
    ON CONFLICT (user_id, notification_type, week_start)
        WHERE week_start IS NOT NULL
    DO NOTHING;
END;
$$;
