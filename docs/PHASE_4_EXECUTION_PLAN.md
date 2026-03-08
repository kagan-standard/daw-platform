---
name: Phase 4 Execution Plan
overview: "Turn FIX_ROADMAP Phase 4 (Performance / Cleanup / Parity) into an execution-ready cross-repo plan: root causes, issue IDs, repo ownership, batch order, contract/validation, and dependency notes, output as PHASE_4_EXECUTION_PLAN.md."
todos: []
isProject: false
---

# Phase 4 Execution Plan

## Deliverable

Create **[PHASE_4_EXECUTION_PLAN.md](c:\dev\Audit Master\PHASE_4_EXECUTION_PLAN.md)** at workspace root with the content below. No code edits; plan only.

---

## 1. Phase 4 Overview (for the document)

- **Goal (from FIX_ROADMAP):** Replace in-memory aggregation patterns, remove dead code, add missing test coverage, and harden operational surfaces.
- **Scope:** 7 work items (4.1–4.7). Estimated 10–15 engineering days. Medium-to-low urgency; all Phase 1–3 gates satisfied.
- **Issues addressed:** 3 High (BE-G-01, BE-G-02, BE-G-03), 12 Medium, 8 Low, 4 Possible. Plus INT-06, INT-11.
- **Architectural risks:** ARCH-04 (in-memory aggregation ceiling) is the main systemic risk; 4.1 is the primary mitigation.

**Repo ownership summary:**

- **Backend-only:** 4.1, 4.2, 4.6 (backend test coverage), 4.7 (backend low items).
- **Frontend-only:** 4.3, 4.4, 4.5, 4.6 (frontend/nav tests), 4.7 (frontend low items).
- **Coordinated:** 4.1 has an optional frontend facet (consuming new pagination/truncation fields); treat as **backend-first** with contract/doc and frontend validation after backend ships.

**Dependency order within Phase 4:**

- 4.1 and 4.2 have no in-phase deps; 4.1 depends on Phase 2.7 (done).
- 4.3 depends on Phase 2.9 (done). 4.4 depends on Phase 1.6 (done). 4.5 and 4.7 have no deps.
- 4.6 depends on Phases 2.1, 2.5, 2.10 (all done).
- Recommended execution order: **Batch 1** (4.1, 4.2) → **Batch 2** (4.3, 4.4, 4.5) → **Batch 3** (4.6) → **Batch 4** (4.7).

---

## 2. Implementation Batches and Per-Item Detail

### Batch 1: Backend — Aggregation and Tracking (root-cause-first)

**Priority:** HIGH. Contains the only remaining High-severity issues (BE-G-01, BE-G-02, BE-G-03).


| Item                                            | Root cause                                                                                            | Issue IDs resolved                                                                                   | Repo                                         | Which repo first | Contract/doc updates                                                                                                                           | Validation / regression                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **4.1 — Replace bounded in-memory aggregation** | ARCH-04 / BE-C-02: Bounded in-memory scans reported as complete; silent truncation and scale ceiling. | BE-C-02, BE-G-01, BE-G-02, BE-G-03, BE-G-04, BE-G-05, BE-D-07 (Possible), BE-G-07 (Possible), INT-11 | Backend-first (optional FE validation after) | Backend first    | Document new RPCs/views; standardize pagination/truncation response fields (`truncated`, `pagination`); update API contract and INT-11 status. | Per-endpoint: leaderboard full-period or truncation metadata; map bounds + DB-side aggregation; deals RPC(lat,lng,radius); stats/activity DB aggregates; follower COUNT per user; brewery map cursor/truncation. Load/perf tests with large fixtures. Regression: existing clients still work (additive fields). |
| **4.2 — Tracking durability**                   | BE-G-06: Fire-and-forget tracking writes; failures swallowed.                                         | BE-G-06                                                                                              | Backend-only                                 | Backend only     | Document retry/queue behavior and any new failure metrics or strict-mode query params.                                                         | Queue/retry or persistent queue; failure metrics; dead-letter visibility. Test: simulate upstream failure, assert retry or metrics. Regression: 202 + `tracked: true` preserved for happy path.                                                                                                                  |


**Dependency:** 4.1 depends on Phase 2.7 (crew atomics) — already complete. 4.2 has no Phase 4 deps.

---

### Batch 2: Frontend — Dead code and query-cache cleanup

**Priority:** MEDIUM. Single-repo; no cross-repo coordination.


| Item                                     | Root cause                                                                        | Issue IDs resolved                       | Repo          | Which repo first | Contract/doc updates                                                                                  | Validation / regression                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------- | ------------- | ---------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **4.3 — Dead navigation code**           | ARCH-08 / FE-B-03: Orphaned routes and dead leaderboard footer.                   | FE-B-03, FE-D-03, FE-D-04, FE-B-05 (Low) | Frontend-only | Frontend only    | Update `types/navigation.ts` and any route manifest; remove or document `my-ratings` until supported. | Remove or implement RateStack placeholders (BeerSearch, BrewerySearch, RatingConfirm); remove or fix leaderboard footer (or implement when backend provides off-list rank per INT-10); remove `my-ratings` from BrowseStackParamList or add runtime support. Navigation reachability smoke test. |
| **4.4 — Centralize query key factories** | FE-J-04 / FE-H-05: Stale key shapes and broad invalidation.                       | FE-J-04, FE-H-05                         | Frontend-only | Frontend only    | Document canonical query-key factory module and invalidation matrix.                                  | Single factory module; remove `['profile','me']`; narrow cosmetics invalidation to affected keys. Regression: all "me" queries still user-scoped (Phase 1.6).                                                                                                                                    |
| **4.5 — Follow status normalization**    | INT-06 / FE-G-05: Asymmetric `following` vs `is_following` in status vs mutation. | FE-G-05, INT-06                          | Frontend-only | Frontend only    | None (internal normalization).                                                                        | Use same normalize function in `useFollowStatus` as in `useToggleFollow`. Regression: follow button state correct after refetch/mutation.                                                                                                                                                        |


**Dependency:** 4.3 references Phase 2.9 (feature wiring). 4.4 references Phase 1.6 (user-scoped keys). 4.5 has none.

---

### Batch 3: Test coverage (both repos)


| Item                            | Root cause                                                                        | Issue IDs resolved | Repo               | Which repo first                                                             | Contract/doc updates                        | Validation / regression                                                                                                                                                                                                                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------- | ------------------ | ------------------ | ---------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **4.6 — Missing test coverage** | BE-H-07: Critical paths (scheduler, Edge parity, migration safety, nav) untested. | BE-H-07            | Backend + Frontend | Backend first (scheduler/parity/migration), then frontend (nav reachability) | CI policy docs; test README for new suites. | Backend: scheduler idempotency (e.g. weekly-tabs-eval double-run); scheduler population >10k; notification dedupe (streak-risk double-run); Node-vs-Edge parity (same input → same output); migration safety policy in CI. Frontend: navigation reachability (every registered route has ≥1 entry path). Regression: existing tests stay green. |


**Dependency:** Phases 2.1, 2.5, 2.10 complete. No in-Phase-4 ordering between 4.6 backend and 4.6 frontend.

---

### Batch 4: Remaining low-priority items


| Item                             | Root cause                     | Issue IDs resolved                                                                                                        | Repo               | Which repo first | Contract/doc updates | Validation / regression                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **4.7 — Remaining low-priority** | Scattered low/possible issues. | FE-A-04, FE-D-05, FE-I-06, FE-J-06, BE-D-08, BE-E-05, BE-F-06, BE-C-05; BE-H-08 already fixed in 2.10 (optional re-check) | Backend + Frontend | Parallel         | None material.       | FE: scoped/toast API banner (FE-A-04); cheers nav guard for missing beer_id/beer_name (FE-D-05); dev-log guard behind debug flags for map (FE-J-06). BE: follower/following auth policy review (BE-D-08); cosmetic upsert response check (BE-E-05); hardened file-serving headers (BE-F-06); activity/stats scale note or follow-up (BE-C-05). Optional: verify 2.10 advisory lock for BE-H-08. Regression: no behavior break. |


**Dependency:** None. Can run last and in parallel across repos.

---

## 3. Per-batch repo ownership (summary for document)

- **Batch 1:** Backend (4.1, 4.2). Backend-first; frontend only validates 4.1 contract after release.
- **Batch 2:** Frontend (4.3, 4.4, 4.5). Frontend-only.
- **Batch 3:** Backend (4.6 backend tests), Frontend (4.6 frontend tests). Backend-first recommended, then frontend.
- **Batch 4:** Backend (4.7 BE items), Frontend (4.7 FE items). Parallel.

---

## 4. Validation checklist (consolidated for document)

- **4.1:** Leaderboard: full-period or explicit truncation; map: bounds + DB aggregation; deals: RPC with indexed predicates; stats/activity: DB aggregates; follower: COUNT per user; brewery map: cursor/truncation. Load/perf tests; regression on existing clients.
- **4.2:** Retry or queue; failure metrics; dead-letter visibility; 202 preserved on success.
- **4.3:** No orphan RateStack/BrowseStack routes without decision; leaderboard footer fixed or removed; navigation reachability smoke.
- **4.4:** One query-key factory; no stale keys; cosmetics invalidation narrow; regression on 1.6 user-scoping.
- **4.5:** Same normalize in status and mutation; follow button regression.
- **4.6:** Scheduler idempotency + population + dedupe; Node/Edge parity; migration safety CI; nav reachability.
- **4.7:** Per-item checks; no regressions.

---

## 5. Dependency and risk notes (for document)

- **Phase 4 dependency order:** 4.1 ◄ 2.7; 4.3 ◄ 2.9; 4.4 ◄ 1.6; 4.6 ◄ 2.1, 2.5, 2.10. All satisfied.
- **Cross-repo risk:** Low. Only 4.1 has an optional frontend side (consuming new response fields); backend ships first, then frontend can adopt truncation/pagination UI if desired.
- **Execution order:** Batch 1 (4.1, 4.2) → Batch 2 (4.3, 4.4, 4.5) → Batch 3 (4.6) → Batch 4 (4.7). Within Batch 1, 4.1 and 4.2 can be parallel. Within Batch 2, 4.3/4.4/4.5 can be parallel.
- **Risk if deferred:** ARCH-04 (scale ceiling) continues; leaderboard/stats/map/deals degrade as data grows. Dead code and cache drift (4.3–4.5) remain maintenance and correctness risks.

---

## 6. File to create

- **Path:** [PHASE_4_EXECUTION_PLAN.md](c:\dev\Audit Master\PHASE_4_EXECUTION_PLAN.md)
- **Content:** Expand the sections above into a single, well-structured markdown document that includes:
  - Title and status (Ready — all gates satisfied)
  - Phase 4 overview (goal, scope, issues, ARCH-04, repo ownership summary)
  - Dependency graph (mermaid): Phase 2/3 complete → Batch 1 → Batch 2 → Batch 3 → Batch 4
  - For each of 4.1–4.7: root cause, issue IDs, backend-only / frontend-only / coordinated, which repo first, contract/doc updates, validation and regression checks, dependency within Phase 4
  - Implementation batches in order (Batches 1–4) with per-batch repo ownership
  - Consolidated validation checklist
  - Dependency and risk notes

Use the same tone and structure as [phase_3_execution_plan_7304d84e.plan.md](c:\dev\Audit Mastercursor\plans\phase_3_execution_plan_7304d84e.plan.md) and [phase_2_execution_plan_f119a70e.plan.md](c:\dev\Audit Mastercursor\plans\phase_2_execution_plan_f119a70e.plan.md) (overview, repo ownership, dependency graph, per-item tables, validation, risks). No code edits; only create this one markdown file.