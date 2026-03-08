-- Phase 4.2: Tracking durability (BE-G-06)
-- Dead-letter table for tracking write failures after retries.
-- Enables failure metrics and visibility for fire-and-forget tracking writes.

CREATE TABLE IF NOT EXISTS tracking_failures (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type    TEXT NOT NULL,
    payload        JSONB NOT NULL,
    error_message TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracking_failures_created_at
    ON tracking_failures(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_failures_event_type
    ON tracking_failures(event_type);

ALTER TABLE tracking_failures ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS in Supabase; allow authenticated backend to insert.
-- Optional: grant SELECT to admin role for dead-letter visibility dashboards.
CREATE POLICY "tracking_failures_service_insert"
    ON tracking_failures FOR INSERT
    TO service_role
    WITH CHECK (true);

CREATE POLICY "tracking_failures_service_select"
    ON tracking_failures FOR SELECT
    TO service_role
    USING (true);
