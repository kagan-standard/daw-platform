-- Admin flag new beers for review (catalog edit flow).
-- When a beer is created from submission or is_new_beer rating, set flagged_for_review = true.
-- GET /api/admin/beers/for-review lists these; PATCH /api/admin/beers/:id clears the flag on save.

ALTER TABLE beers
  ADD COLUMN IF NOT EXISTS flagged_for_review BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS flagged_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_beers_flagged_for_review ON beers(flagged_for_review) WHERE flagged_for_review = TRUE;

COMMENT ON COLUMN beers.flagged_for_review IS 'True when beer was user-submitted and needs admin review of name/brewery/style/abv';
COMMENT ON COLUMN beers.flagged_at IS 'When the beer was flagged for review (e.g. created_at at creation)';
