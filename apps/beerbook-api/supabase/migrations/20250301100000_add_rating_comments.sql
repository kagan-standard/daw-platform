-- Rating comments
CREATE TABLE IF NOT EXISTS rating_comments (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    rating_id TEXT NOT NULL REFERENCES ratings(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rating_comments_rating ON rating_comments(rating_id);
CREATE INDEX idx_rating_comments_user ON rating_comments(user_id);
CREATE INDEX idx_rating_comments_created ON rating_comments(created_at);

-- Add comment_count to ratings for fast display (avoids COUNT query per card)
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS comment_count INTEGER DEFAULT 0;

-- Atomic increment/decrement for comment_count (avoids race conditions)
CREATE OR REPLACE FUNCTION increment_comment_count(rating_id_input TEXT)
RETURNS void AS $$
  UPDATE ratings SET comment_count = COALESCE(comment_count, 0) + 1
  WHERE id = rating_id_input;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION decrement_comment_count(rating_id_input TEXT)
RETURNS void AS $$
  UPDATE ratings SET comment_count = GREATEST(COALESCE(comment_count, 0) - 1, 0)
  WHERE id = rating_id_input;
$$ LANGUAGE sql;

-- Grant access matching existing pattern
GRANT SELECT ON rating_comments TO anon;
