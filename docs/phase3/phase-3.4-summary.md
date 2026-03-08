# Phase 3.4 — Fix Notification UX: Loading States + Action Contract

**Status:** Backend implemented (2026-03-07); frontend not present in workspace
**Issues addressed:** FE-I-03 (Medium), FE-I-04 (Medium), INT-09 (Medium)
**Root cause:** INT-09 — Backend generated typed notifications without destination metadata; frontend had no navigation-on-press contract. FE-I-03: modal showed false "All caught up" on unloaded/error.

---

## Summary

Backend changes for item 3.4 are implemented: `tab_notifications` now has `target_type` and `target_id` for the notification action contract, and all backend notification insert points populate them where applicable. Existing notifications remain valid with NULL target fields (backward compatible). The frontend files listed in the plan (`NotificationsModal.tsx`, `useTabs.ts`, `api/tabs.ts`) were not found in this workspace, so frontend work (loading/error/empty states, per-type press handlers with navigation, optimistic mark-read) was not implemented and is a prerequisite for full 3.4 closure.

---

## Files Changed

| File | Change |
|------|--------|
| `apps/beerbook-api/supabase/migrations/20260308110000_phase3_notification_action_contract.sql` | **New.** Adds `target_type`, `target_id` to `tab_notifications` (with CHECK); updates `insert_scheduler_notification` to accept and store optional `p_target_type`, `p_target_id`. |
| `apps/beerbook-api/scripts/streak-risk-check.js` | `sendNotification` now passes `p_target_type: 'tabs_profile'`, `p_target_id: userId`. |
| `apps/beerbook-api/scripts/weekly-tabs-eval.js` | Same: `p_target_type: 'tabs_profile'`, `p_target_id: userId`. |
| `apps/beerbook-api/routes/tabs.js` | Seeder notification: added `target_type: 'tabs_profile'`, `target_id: userId`. Tier promotion notification: same. Beer approved/rejected notification: added `target_type: 'beer'`, `target_id: submission.id`. |
| `apps/beerbook-api/docs/DATABASE_SCHEMAS_OVERVIEW.md` | Documented `tab_notifications` columns `week_start`, `target_type`, `target_id` and Phase 3.4 action contract. |
| `apps/beerbook-api/docs/API_CONTRACT.md` | GET /api/tabs/notifications and PATCH …/:id/read response shapes updated to include `target_type`, `target_id`; added "Notification action contract (Phase 3.4)" note. |

---

## Validation Steps Completed

### Tests run

**No automated tests were run for this item.** The codebase has no tests that target notification insert payloads or the new columns. Recommended manual checks:

- Run migration against a dev DB; confirm `tab_notifications` has `target_type` and `target_id` (nullable).
- Call `GET /api/tabs/notifications` after creating a new notification (e.g. via seeder grant or submission review); confirm response includes `target_type` and `target_id` for new rows.
- Run `node scripts/streak-risk-check.js` (or weekly-tabs-eval) against a dev instance with the new migration; confirm no RPC errors (new params are optional).

### Exact validation commands

None executed. Suggested:

```bash
cd c:\Users\kenyo\OneDrive\Desktop\daw-platform\daw-platform\apps\beerbook-api
# Apply migration (Supabase or psql)
npx supabase db push
# Or: psql "$DATABASE_URL" -f supabase/migrations/20260308110000_phase3_notification_action_contract.sql
```

---

## Contract / Doc Implications

- **HTTP/API:** Response shape is extended only. `GET /api/tabs/notifications` and `PATCH /api/tabs/notifications/:id/read` now include optional `target_type` and `target_id` on each notification object. No request or URL changes; existing clients can ignore the new fields.
- **Database:** `tab_notifications` has two new nullable columns and an updated `insert_scheduler_notification` signature (backward compatible via default NULL).
- **Docs updated:** `DATABASE_SCHEMAS_OVERVIEW.md` and `API_CONTRACT.md` describe the new columns and the notification action payload contract.

---

## Known Risks / Follow-up

1. **Frontend missing in workspace:** The plan references `components/common/NotificationsModal.tsx`, `hooks/useTabs.ts`, and `api/tabs.ts`. These were not found in the workspace (no `.tsx` or matching paths). To complete 3.4 UX:
   - Implement loading, error, and empty states in the notifications modal (so "All caught up" only shows when loaded and empty).
   - Define `NotificationAction` type and implement mark-read + navigate by `target_type` (e.g. `tabs_profile` → profile/tabs screen, `beer` → submission/beer detail).
   - Add optimistic cache update for mark-read to reduce badge/list flicker.

2. **Achievement-unlock notifications:** The plan mentions "achievement unlocks set target_type='achievement'". The backend does not currently insert `tab_notifications` for achievement unlocks (`unlock_achievement_with_rewards` and `processEventEngine.js` do not create notifications). If product adds in-app achievement notifications later, those inserts should set `target_type='achievement'` and `target_id=<achievement_id>`.

3. **processEventEngine.js:** Listed in the plan as a notification insert point; there are no `tab_notifications` inserts in that file. No code changes were made there for 3.4.
