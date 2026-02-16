# SYSTEM RULES

You are operating inside an existing live deployment (DAW Platform). Do NOT rebuild from scratch.

---

## Prime Directive

Do not break production. Avoid changes that can lock users out or lose DB data.

---

## Context Loading (do this FIRST on every session)

1. Read `ARCHITECTURE.md` — understand the full system topology
2. Read `DECISIONS.md` — understand past decisions and constraints
3. Read the **active phase prompt** (e.g., `cursor/prompts/03_phase_2_5_beerbook_polish.md`) — understand what you're building
4. Read the **existing code you're about to modify** before changing it — understand current state
5. If the phase prompt references existing files (schema, API, frontend), read them before writing

**Do not start writing code until you have read all context files.**

---

## Execution Model

### Workstream Ordering

Phase prompts are organized into numbered workstreams. Execute them **in order** unless the prompt explicitly says otherwise. Each workstream builds on the previous one:
- **Schema first** (workstream 1) — tables must exist before API endpoints reference them
- **API second** (workstream 2) — endpoints must exist before frontend calls them
- **Frontend after** (workstreams 3+) — UI wires up to working API

**Never skip ahead.** If workstream 4 depends on workstream 2 endpoints, finish workstream 2 first.

### Checkpoint Gates

After completing each workstream:
1. List all files created or modified
2. State acceptance criteria that passed
3. State any assumptions made (add to assumption log)
4. Confirm no regressions to prior workstreams

**Do not proceed to the next workstream until the current one's acceptance criteria are met.**

### Large Phase Execution (5+ workstreams)

For phases with many workstreams:
- **Plan first:** Before writing any code, produce a numbered execution plan (max 20 bullets) showing the order of operations across all workstreams
- **One workstream at a time:** Complete, verify, then move on
- **Track progress:** Maintain a running checklist of completed workstreams at the top of your deliverable
- **Incremental delivery:** Each workstream should leave the app in a working state — no half-built features that break existing functionality

---

## Required in Every Phase

- Acceptance criteria (per workstream and overall)
- Validation commands (exact, VPS-side)
- Rollback steps (exact, per workstream)

---

## Safety Rails

- **Never** run `docker compose down -v` on prod
- **Always** use explicit compose file path:
  ```
  docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml --env-file /opt/daw-platform/infra/compose/.env ...
  ```
- **Backup first**; document restore
- **No docker commands executed locally** — all deploy instructions target VPS at `/opt/daw-platform/`
- **Schema changes must be additive** — no column drops, no renames, no destructive migrations
- **Use `IF NOT EXISTS` / `IF EXISTS`** on all DDL — migrations must be idempotent (safe to run twice)

---

## Code Quality Rules

### File Organization
- Keep files focused: one concern per file
- Frontend JS files: split by feature area (e.g., `exchange.js`, `map.js`, `venues.js`) not one giant `app.js`
- If a file exceeds ~500 lines, split it
- New CSS goes in `styles.css` (extend, don't create separate CSS files unless justified)
- New API endpoints: add to existing `server.js` if <20 new routes; split into route files if more

### Backward Compatibility
- **Never break existing functionality** — all current features must continue working after every change
- **New columns are nullable** — existing rows must remain valid
- **New API endpoints don't affect existing ones** — no shared middleware changes that alter existing behavior
- **Frontend changes are additive** — new views/features don't remove or alter existing views unless explicitly instructed
- **Demo mode must keep working** — localStorage-only fallback for unconnected state

### Style Consistency
- **Frontend:** Match existing aesthetic — see CSS variables in `styles.css` (amber/mahogany pub theme)
- **API:** Follow existing patterns in `server.js` — same pagination helper, same auth middleware, same PostgREST proxy pattern
- **Naming:** snake_case for DB columns, camelCase for JS variables, kebab-case for CSS classes

---

## Assumption Handling

Per `DECISIONS.md`: **assume sensible defaults and log them.** Do not ask unless:
- DNS change required
- Security risk introduced
- Data could be deleted or corrupted
- Cost increase (new external service, paid API, etc.)

Log all assumptions in the **Agent Assumption Log** table at the bottom of the phase prompt.

---

## What NOT to Do

- Do not introduce new frameworks (React, Vue, Svelte, etc.) — the frontend is vanilla JS
- Do not add a build step (webpack, vite, rollup, etc.)
- Do not install npm packages in the frontend — CDN scripts only
- Do not expose PostgREST or any internal service to the public internet
- Do not store secrets in code, config.js, or any file that ships to the browser
- Do not create separate CSS files per feature — extend `styles.css`
- Do not rewrite working code "for cleanliness" unless the phase prompt requires it
- Do not add TypeScript, ESLint, Prettier, or other tooling unless explicitly requested
- Do not create README files unless the phase prompt asks for documentation

---

## BeerBook / YG Value

- **YG value range:** 0–12, step 1, integer. The `yg_value` column and API validation accept integer values 0–12. Client-side validation and UI (beer glass slider) use this range; 0 means “not set” (submit as null).