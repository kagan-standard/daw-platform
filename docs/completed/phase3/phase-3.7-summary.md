# Phase 3.7 - Fix Achievement Labels on Foreign Profiles

**Status:** Backend Option A implemented (2026-03-07); frontend prerequisite missing in this workspace  
**Issues addressed:** FE-G-02 (Medium), INT-04 (Medium) - backend contract portion  
**Scope executed:** Item 3.7 only

---

## Summary

Implemented the backend-first contract change for item 3.7 by extending `GET /api/achievements` to accept optional `user_id`.  
When `user_id` is provided, the endpoint now resolves achievements for that profile user instead of always using the authenticated viewer, preventing cross-user label hydration mistakes in foreign-profile views.

To keep foreign-profile responses public-only, `earned_at` is masked to `null` when `user_id` differs from the authenticated user.  
A `tier` field is added in the response, sourced from achievement `difficulty`, to support label rendering without exposing private achievement context.

The frontend files referenced in the plan for the consumer-side fix (`UserProfileScreen.tsx`, `useAchievements.ts`) were not present in this workspace, so frontend integration for 3.7 could not be completed here.

---

## Files Changed

| File | Change |
|------|--------|
| `apps/beerbook-api/routes/tabs.js` | Updated `GET /api/achievements` to support optional `user_id`, scope lookup to requested profile user, add `tier` in output, and mask `earned_at` for foreign-profile requests. |
| `apps/beerbook-api/test/achievements-profile-scope.integration.test.js` | **New.** Added targeted integration tests for self-scope default behavior and foreign-profile `user_id` behavior. |
| `apps/beerbook-api/docs/API_CONTRACT.md` | Documented optional `user_id` query parameter and updated response contract with `tier` plus foreign-profile behavior note. |

---

## Validation Steps Completed

### Tests run

- Ran targeted integration tests for this item: both passed.

### Exact validation commands run

```bash
cd c:\Users\kenyo\OneDrive\Desktop\daw-platform\daw-platform\apps\beerbook-api
node --test test/achievements-profile-scope.integration.test.js
```

### Lint/diagnostic check

- Checked diagnostics for changed files; no linter errors reported.

---

## Contract / Doc Implications

- **HTTP/API contract change (additive):** `GET /api/achievements` now accepts optional `user_id`.
- **Response shape change (additive):** each achievement item now includes `tier`.
- **Behavioral contract change:** when requesting another user's achievements (`user_id != auth user`), `earned_at` is returned as `null` and only public metadata is exposed.
- **Docs updated:** `apps/beerbook-api/docs/API_CONTRACT.md`.

---

## Known Risks / Follow-up (Not Implemented)

1. **Frontend prerequisite missing:** the 3.7 consumer-side files in the plan were not found in this workspace, so end-to-end foreign-profile label rendering is not validated here.
2. **Cross-repo validation pending:** after frontend integration is available, verify:
   - viewing user B profile shows user B labels,
   - own profile remains unchanged,
   - no cross-profile achievement contamination.
