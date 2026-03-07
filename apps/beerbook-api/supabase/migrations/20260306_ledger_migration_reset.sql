-- ============================================================================
-- 20260306_ledger_migration_reset.sql  (NEUTERED — safe no-op)
--
-- The original migration contained unconditional TRUNCATE … CASCADE across
-- 12 user-generated data tables plus UPDATE resets for user_tabs_profile and
-- profiles.  Those statements have been moved to:
--
--     scripts/manual-ledger-reset.sql
--
-- That runbook script includes an environment guard that prevents execution
-- outside development environments.  See docs/PHASE_1_7_CHANGELOG.md.
--
-- This file is intentionally left as a no-op so that Supabase migration
-- tracking remains consistent for environments that already ran it.
-- ============================================================================

SELECT 1;  -- no-op placeholder
