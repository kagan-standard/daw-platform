# Phase 1 Plan Critique (BeerBook + DAW SSO)

## Overall assessment
The plan is strong on target architecture and security boundaries, but it is vulnerable to execution drift because several requirements are not expressed as explicit acceptance checks (especially around token validation behavior, secrets lifecycle, and rollback safety).

## What is good already
- Clear north-star outcome and concrete definition of done.
- Correct separation of trust boundaries: browser → API → internal PostgREST.
- Explicitly isolates Keycloak DB from Supabase DB.
- Calls out common Keycloak proxy pitfalls (`KC_PROXY`, hostname settings).
- Includes practical smoke-test expectations and runbook deliverables.

## Key risks / ambiguities

### 1) File naming mismatch can break automation
The plan references `ARCHITECTURE.md`, but the repository currently has `architecture.md` (lowercase). Any scripted docs checks or copy/paste agent prompts may fail on case-sensitive filesystems.

**Recommendation:** Standardize filename casing across docs and prompts.

### 2) “Public read” endpoints are underspecified for abuse controls
`GET /api/ratings` and `/api/stats` are public. No pagination, rate limiting, or size caps are required in acceptance criteria.

**Risk:** DoS/memory blowups, noisy scraping, expensive aggregate queries.

**Recommendation:** Add Phase 1 non-negotiables:
- Max page size + default limit (e.g., 50/100)
- Sort + cursor/offset contract
- Basic per-IP rate limiting on public routes

### 3) Token validation requirements omit audience and azp checks
Current middleware requirements include `iss` and `exp`, but not `aud`/`azp`.

**Risk:** Tokens minted for other clients may be accepted if issuer matches.

**Recommendation:** Require:
- `aud` includes `beerbook` (or explicit client audience strategy)
- `azp` equals `beerbook` for public-client tokens
- Clock-skew tolerance setting documented

### 4) Service-role key blast radius is high
Plan correctly keeps service-role key server-side, but does not define rotation/runbook cadence or emergency invalidation steps.

**Recommendation:** Add minimum operational controls:
- Quarterly rotation policy (or at least “on incident + staff turnover”)
- Clear procedure for generating/redeploying keys with minimal downtime
- Verification checklist after rotation

### 5) RLS disabled is acceptable short term but needs an explicit exit gate
The plan says RLS disabled is safe in Phase 1 due to internal-only PostgREST.

**Risk:** Temporary control becomes permanent debt.

**Recommendation:** Add a Phase-2 gate: “No feature work beyond X until RLS baseline policy is enabled and tested.”

### 6) Missing rollback criteria per deployment step
Plan has smoke tests but not explicit rollback triggers.

**Recommendation:** For each major task (Keycloak, API, frontend), define:
- “Abort/rollback if” conditions
- Last-known-good image tag/config
- Fast rollback command sequence

### 7) Realtime use is stated but not validated in acceptance
Supabase Realtime is in architecture, but no explicit end-to-end realtime validation case exists.

**Recommendation:** Add one smoke test proving a second client receives a review-change event.

### 8) CORS and origin hardening can regress silently
Only one allow-origin is specified.

**Recommendation:** Add tests for:
- Allowed origin succeeds
- Unexpected origin blocked
- Preflight (`OPTIONS`) behavior validated

## Suggested acceptance-criteria additions (copy/paste)
- API rejects tokens where `aud`/`azp` do not match `beerbook`.
- Public endpoints enforce pagination defaults and maximum page size.
- Public endpoints are rate-limited (documented threshold).
- `OPTIONS` preflight succeeds only for allowed origins.
- Key rotation runbook validated in staging or via tabletop drill.
- Realtime propagation test passes between two browser sessions.
- Rollback drill executed once: deploy bad config, recover to last-known-good in < 10 minutes.

## Priority order
1. Audience/authorized-party token checks
2. Pagination + rate limiting on public endpoints
3. Rollback procedure and drill
4. Secret rotation runbook
5. Realtime smoke test
6. Filename/casing cleanup

## Verdict
The plan is directionally correct and implementation-ready, but should be tightened with explicit non-functional controls (abuse resistance, token strictness, rollback, and key lifecycle) before execution starts.
