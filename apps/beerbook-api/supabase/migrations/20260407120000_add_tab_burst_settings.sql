-- Add tab_burst_settings JSONB column to app_config.
-- NULL means "use mobile defaults" (no server override).
ALTER TABLE app_config ADD COLUMN IF NOT EXISTS tab_burst_settings JSONB NULL;
