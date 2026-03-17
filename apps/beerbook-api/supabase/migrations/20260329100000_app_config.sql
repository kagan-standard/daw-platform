-- Global app config (single row). Used by GET /api/config and PATCH /api/admin/config for app theme.
CREATE TABLE IF NOT EXISTS app_config (
  id text PRIMARY KEY DEFAULT 'default',
  theme text NOT NULL DEFAULT 'default' CHECK (theme IN ('default', 'st_patricks_day'))
);

-- Ensure single row exists so PATCH always has a target.
INSERT INTO app_config (id, theme) VALUES ('default', 'default')
ON CONFLICT (id) DO NOTHING;
