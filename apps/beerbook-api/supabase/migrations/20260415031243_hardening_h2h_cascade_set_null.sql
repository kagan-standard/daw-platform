-- Backlog A1: flip head_to_head_prompts FKs to ratings.id from
-- ON DELETE CASCADE to ON DELETE SET NULL, so H2H prompt rows
-- survive deletion of the underlying rating. Preserves H2H
-- comparison audit trail when a user deletes a rating that was
-- previously part of a head-to-head comparison.
--
-- Prerequisite: drop NOT NULL on both FK columns. PostgreSQL
-- rejects ON DELETE SET NULL on a NOT NULL column.
--
-- Out of scope: rating_comments.rating_id and reactions.rating_id
-- intentionally remain ON DELETE CASCADE. beer_elo_events is not
-- reachable via cascade and is already safe.
--
-- Recon: a1_recon_report.md, a1_ordering_check.md, a1_addendum.md

BEGIN;

ALTER TABLE public.head_to_head_prompts
  ALTER COLUMN challenger_rating_id DROP NOT NULL;

ALTER TABLE public.head_to_head_prompts
  ALTER COLUMN current_rating_id DROP NOT NULL;

ALTER TABLE public.head_to_head_prompts
  DROP CONSTRAINT head_to_head_prompts_challenger_rating_id_fkey;

ALTER TABLE public.head_to_head_prompts
  ADD CONSTRAINT head_to_head_prompts_challenger_rating_id_fkey
  FOREIGN KEY (challenger_rating_id)
  REFERENCES public.ratings(id)
  ON DELETE SET NULL;

ALTER TABLE public.head_to_head_prompts
  DROP CONSTRAINT head_to_head_prompts_current_rating_id_fkey;

ALTER TABLE public.head_to_head_prompts
  ADD CONSTRAINT head_to_head_prompts_current_rating_id_fkey
  FOREIGN KEY (current_rating_id)
  REFERENCES public.ratings(id)
  ON DELETE SET NULL;

COMMIT;
