-- Add serve_type to ratings (nullable; existing rows unchanged).
-- Run this in Supabase SQL Editor before deploying API/frontend changes.

ALTER TABLE ratings
ADD COLUMN IF NOT EXISTS serve_type TEXT
CHECK (serve_type IN ('draft', 'can', 'bottle', 'crowler', 'growler', 'nitro'));

CREATE INDEX IF NOT EXISTS idx_ratings_serve_type ON ratings(serve_type);
