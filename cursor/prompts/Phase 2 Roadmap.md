# Phase 2.x Roadmap — BeerBook: The Full Experience

Each phase is a self-contained Cursor session. Commit and deploy between phases.
Each phase has its own prompt file in `cursor/prompts/`.

---

## Phase 2.1 — Schema & API Expansion
**Prompt:** `cursor/prompts/03_phase_2_1_schema_api.md`
**What it delivers:** All new database tables + all new API endpoints. Pure backend.
**Frontend changes:** None.
**New files:** migration-2.1.sql, updated database-schema.sql, expanded server.js
**Risk:** Low — backend only, existing frontend unaffected.
**Gate:** All new endpoints return correct data via curl before proceeding.

## Phase 2.2 — Rating Form & Dashboard Polish
**Prompt:** `cursor/prompts/04_phase_2_2_form_dashboard.md`
**What it delivers:** Upgraded rating form (stars, autocomplete, YG slider, geotag, photo, prices), dashboard polish (stats, charts, activity feed, empty states, toasts, skeleton loaders), delete reviews, leaderboard tabs.
**Frontend changes:** Heavy — index.html, app.js, supabase.js, styles.css, charts.js
**New files:** None (all edits to existing files).
**Risk:** Medium — lots of UI changes but no new dependencies.
**Gate:** Can rate a beer with all new fields, dashboard shows activity feed.

## Phase 2.3 — YG Exchange & Beer Map
**Prompt:** `cursor/prompts/05_phase_2_3_exchange_map.md`
**What it delivers:** YG Exchange trading floor, cross-rate calculator, Leaflet beer map, venue pins, venue detail pages, happy hour tracking, price logging, "Best Beer Near Me" deals engine.
**Frontend changes:** Heavy — 3 new JS files, Leaflet CDN added, new nav items, new views.
**New files:** exchange.js, map.js, venues.js
**New CDN deps:** Leaflet.js, leaflet.markercluster
**Risk:** High — most new frontend code, map integration, geolocation.
**Gate:** Exchange table loads, map shows pins, venue detail opens, deals endpoint works.

## Phase 2.4 — Social, Profiles & Mobile Polish
**Prompt:** `cursor/prompts/06_phase_2_4_social_mobile.md`
**What it delivers:** User profiles, beer detail pages, cheers reactions, advanced filters, infinite scroll, style tooltips, mobile responsive audit, PWA manifest, keyboard shortcuts, data caching.
**Frontend changes:** Medium — 1 new JS file, polish across all views.
**New files:** profiles.js, manifest.json, icons/
**Risk:** Medium — many small changes across many files.
**Gate:** Full smoke test passes (15-point checklist in prompt).

---

## Execution Order

```
Phase 2.1 (backend) → deploy → verify API
    ↓
Phase 2.2 (form + dashboard) → deploy → verify UI
    ↓
Phase 2.3 (exchange + map) → deploy → verify features
    ↓
Phase 2.4 (social + polish) → deploy → full regression test
    ↓
Phase 2 COMPLETE ✅
```

## File Manifest (what exists after all phases)

```
apps/beerbook/
├── index.html          (modified in 2.2, 2.3, 2.4)
├── app.js              (modified in 2.2, 2.3, 2.4)
├── supabase.js         (modified in 2.2, 2.4)
├── styles.css          (modified in 2.2, 2.3, 2.4)
├── charts.js           (modified in 2.2, 2.4)
├── config.js           (unchanged)
├── exchange.js         (NEW in 2.3)
├── map.js              (NEW in 2.3)
├── venues.js           (NEW in 2.3)
├── profiles.js         (NEW in 2.4)
├── manifest.json       (NEW in 2.4)
├── icons/
│   ├── icon-192.png    (NEW in 2.4)
│   └── icon-512.png    (NEW in 2.4)
└── docs/
    ├── database-schema.sql  (modified in 2.1)
    └── migration-2.1.sql    (NEW in 2.1)

apps/beerbook-api/
├── server.js           (modified in 2.1 — may be split into route files)
├── package.json        (modified in 2.1 — add multer)
├── Dockerfile          (possibly modified in 2.1)
└── routes/             (NEW in 2.1 if server.js is split)
```