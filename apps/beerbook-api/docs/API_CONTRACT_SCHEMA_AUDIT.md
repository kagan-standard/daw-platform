# API Contract Schema Audit

Generated: 2026-03-06  
Scope: `apps/beerbook-api`  
Baseline doc: `docs/API_CONTRACT.md`

---

## What Was Audited

- Endpoint coverage parity (`server.js` + `routes/*.js` vs `API_CONTRACT.md`) was already confirmed at `98/98`.
- This pass focused on **schema-level drift**:
  - request body/query param behavior
  - success response shape
  - error status/shape coverage

---

## Findings

### High Priority

1) `POST /api/crews/join` has additional structured error codes not listed in contract  
- **Implementation:** `routes/crews.js` can return:
  - `UPSTREAM_ERROR` (status from upstream, with 5xx mapped to 502)
  - `JOIN_FAILED` (status from upstream, with 5xx mapped to 502)
- **Contract gap:** `API_CONTRACT.md` currently lists only:
  - `INVITE_REQUIRED`, `CREW_FULL`, `CREW_NOT_FOUND`, `ALREADY_MEMBER`
- **Impact:** Clients handling crew-join errors by `error_code` may miss legitimate failure modes.

2) `DELETE /api/crews/:id` omits documented 502 failure mode  
- **Implementation:** returns `502 { "error": "Delete failed" }` when upstream delete fails.
- **Contract gap:** only `403` is documented in that endpoint section.
- **Impact:** Clients expecting only auth-related failures may treat delete failures as unknown.

3) `DELETE /api/crews/:id/members/:userId` omits documented 502 failure mode  
- **Implementation:** returns `502 { "error": "Remove member failed" }` on upstream delete failure.
- **Contract gap:** endpoint section currently lists only `400`/`403`.
- **Impact:** Same as above; missing contract coverage for operational failures.

### Medium Priority

4) `POST /api/follows/:userId` error contract is incomplete for follow-insert failures  
- **Implementation:** follow insert path returns upstream status/body for non-`unfollow` failures.
- **Contract gap:** endpoint currently documents `400` validation errors and `502` for unfollow delete failure, but not upstream insert failure variants.
- **Impact:** Client error handling may be incomplete for follow action edge cases.

5) `GET /api/admin/users` `avg_rating` can be `null`  
- **Implementation:** users with no ratings get `avg_rating: null`.
- **Contract gap:** examples imply numeric-only (`0`) without explicitly allowing `null`.
- **Impact:** Strict typed clients that treat `avg_rating` as non-null number may fail runtime validation.

### Low Priority / Clarifications

6) `GET /api/follows/:userId/status` returns `{ "is_following": false }` when `userId` is empty  
- **Implementation:** graceful false response for empty/blank target.
- **Contract note:** not currently called out.
- **Impact:** low; behavior is safe, but documenting helps remove ambiguity.

---

## Recommended Contract Updates

1. Expand `POST /api/crews/join` error list to include `UPSTREAM_ERROR` and `JOIN_FAILED`.
2. Add `502` error responses to:
   - `DELETE /api/crews/:id`
   - `DELETE /api/crews/:id/members/:userId`
3. Expand `POST /api/follows/:userId` error section to include upstream insert failure behavior.
4. Explicitly type `avg_rating` in `GET /api/admin/users` as `number | null`.
5. Add a brief note for empty-target behavior on `GET /api/follows/:userId/status`.

---

## Notes

- No request/response shape breaks were found for Tabs/Achievements/Cosmetics/Tracking/Admin Tabs endpoints in this audit pass.
- Most drift found is in **error-contract completeness** rather than core success payload structure.
