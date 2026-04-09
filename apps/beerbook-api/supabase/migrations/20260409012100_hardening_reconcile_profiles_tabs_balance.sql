-- Hardening migration: reconcile profiles.tabs_balance against tabs_ledger.
--
-- BACKGROUND
-- ----------
-- Discovered during Day 3 hardening: profiles.tabs_balance drifted -27 from
-- SUM(tabs_ledger.amount) for a single user (the development test user
-- 061d5154-c846-49e5-9758-d279bb3ab8bd). All other users had zero drift.
--
-- Investigation ruled out:
--   - Pre-trigger inserts (trigger has existed since 2025-03-04)
--   - JS-side direct writes to profiles.tabs_balance (none in current codebase)
--   - Non-trigger DB function writers (cash_out_back, purchase_cosmetic were
--     false positives from regex on SELECT ... tabs_balance FROM profiles)
--   - Trigger disabled at some point (no evidence in logs, migrations, or backups)
--   - Ongoing trigger malfunction (simulator test confirmed +2 delta matches
--     award amount correctly in current state)
--
-- Most likely cause: a legacy direct PATCH or manual dev-time UPDATE to
-- profiles.tabs_balance that bypassed the ledger, now frozen as a -27 artifact
-- on the test user's account. No ongoing bug.
--
-- This migration aligns profiles.tabs_balance to match the ledger ground truth.
-- It is structurally identical to the lifetime_tabs_earned reconciliation
-- from earlier today, except it uses a signed SUM (because tabs_balance
-- reflects net holdings, not lifetime gross awards).

BEGIN;

-- Diagnostic: how many rows will the UPDATE touch?
WITH computed AS (
  SELECT user_id, COALESCE(SUM(amount), 0) AS expected
  FROM tabs_ledger
  GROUP BY user_id
)
SELECT
  COUNT(*) FILTER (WHERE p.tabs_balance IS DISTINCT FROM c.expected) AS drift_rows,
  COUNT(*) AS total_profiles_with_ledger_activity
FROM profiles p
JOIN computed c ON c.user_id = p.id;

-- The actual reconciliation
WITH computed AS (
  SELECT user_id, COALESCE(SUM(amount), 0) AS expected
  FROM tabs_ledger
  GROUP BY user_id
)
UPDATE profiles p
SET tabs_balance = c.expected
FROM computed c
WHERE p.id = c.user_id
  AND p.tabs_balance IS DISTINCT FROM c.expected
RETURNING p.id, p.tabs_balance AS new_value;

COMMIT;
