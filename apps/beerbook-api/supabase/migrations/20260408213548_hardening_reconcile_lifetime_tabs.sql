-- Day 3 hardening: reconcile lifetime_tabs_earned from tabs_ledger ground truth.
--
-- The active RPCs (refresh_rating_award_profile_cache, award_tabs) both add to
-- lifetime_tabs_earned only when amount > 0. This reconciliation mirrors that
-- invariant: SUM(amount) FILTER (WHERE amount > 0).
--
-- Legacy JS writers (awardTabsForRating, awardSingleSourceTabs) were removed in
-- the preceding commit. Any historical drift from when they were active will be
-- corrected here.

BEGIN;

-- Diagnostic: how many rows will the UPDATE touch?
WITH computed AS (
  SELECT user_id,
         COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0) AS expected
  FROM tabs_ledger
  GROUP BY user_id
)
SELECT
  COUNT(*) FILTER (WHERE utp.lifetime_tabs_earned IS DISTINCT FROM c.expected) AS drift_rows,
  COUNT(*) AS total_profiles_with_ledger_activity
FROM user_tabs_profile utp
JOIN computed c ON c.user_id = utp.user_id;

-- The actual reconciliation
WITH computed AS (
  SELECT user_id,
         COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0) AS expected
  FROM tabs_ledger
  GROUP BY user_id
)
UPDATE user_tabs_profile utp
SET lifetime_tabs_earned = c.expected
FROM computed c
WHERE utp.user_id = c.user_id
  AND utp.lifetime_tabs_earned IS DISTINCT FROM c.expected
RETURNING utp.user_id, utp.lifetime_tabs_earned AS new_value;

COMMIT;
