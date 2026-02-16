# Phase 2.4 — Social, Profiles & Mobile Polish — Deliverable

## Execution plan (completed)

1. Client-side cache in supabase.js (cachedFetch, TTLs, invalidation on mutations).
2. profiles.js: user profile modal, API/demo data fetch, stats, YG portfolio, charts (flavor radar, style, distribution, monthly), beer trail list, recent ratings.
3. Username links app-wide (activity, browse, recent reviews, leaderboard) opening profile modal.
4. Beer detail modal: fetch beer by name, YG context, “Rate This Beer” pre-fill, all ratings list.
5. Beer name links (review cards, browse cards, activity) opening beer detail.
6. Cheers: button on rating cards (recent, activity, profile, beer detail), toggle API, animation, “Sign in to cheers” when not logged in; leaderboard “Most Cheered” from client cache.
7. Browse: min rating, YG min/max, user filter, sort (recent, highest, lowest, YG, cheers, name), Clear filters; YG filters shown only when YG data exists.
8. Infinite scroll: browse (sentinel + browseShownCount), activity (sentinel + loadMoreActivity).
9. STYLE_GUIDE tooltips on style hover (200ms delay).
10. Mobile CSS: 414px/360px breakpoints for forms, stats, charts, modals, browse, leaderboard.
11. PWA: manifest.json, link + theme-color + apple-mobile-web-app-capable; icons/ directory + generate-icons.html.
12. Keyboard shortcuts: N, Esc, /, M, E, B, D, L, ? (shortcuts modal); nav button title tooltips; guard so only existing views are navigable.

## New files

- `apps/beerbook/profiles.js`
- `apps/beerbook/manifest.json`
- `apps/beerbook/icons/README.txt`
- `apps/beerbook/generate-icons.html`
- `apps/beerbook/docs/PHASE-2.4-DELIVERABLE.md`

Icons: place `icon-192.png` and `icon-512.png` in `apps/beerbook/icons/` (generate via `generate-icons.html` in browser).

## Modified files

- `apps/beerbook/index.html` — profile modal, beer detail modal, style tooltip div, manifest link, meta, nav titles, browse filters/sentinel, activity sentinel, lb-cheers card, script profiles.js.
- `apps/beerbook/app.js` — cheers (delegation, cache, leaderboard Most Cheered), beer detail open/close, browse filters/sort/infinite scroll, style tooltip, keyboard shortcuts, setupInfiniteScroll, navigate guard, _previousView.
- `apps/beerbook/supabase.js` — _cache, cachedFetch, invalidateCache, cacheInvalidate; getStats/getActivity/getLeaderboard/searchBeers cached; getUserProfile, getUserStats, getBeerDetail, getRatingCheers, toggleCheers, getMapUser, getExchangePortfolio, getBeerCrossRates, getExchangeRates; invalidation on addRating/deleteRating/toggleCheers.
- `apps/beerbook/styles.css` — username-link, beer-name-link, profile modal, beer detail, cheers, review-actions, filter-input, infinite-scroll sentinel/loading, style-tooltip-popup, shortcuts-list, mobile 414/360.
- `apps/beerbook/charts.js` — renderProfileDistribution, renderProfileStyleDoughnut, renderProfileMonthly, renderProfileFlavorRadar.

## Validation commands (VPS)

No server or schema changes. Frontend-only deploy.

```bash
# After deploying updated static files to BeerBook (e.g. nginx docroot or CDN)
curl -sI https://beerbook.drinksafterwork.net/ | head -5
curl -sI https://beerbook.drinksafterwork.net/manifest.json | head -3
curl -s https://beerbook.drinksafterwork.net/profiles.js | head -3
```

## Rollback

- Restore previous `index.html`, `app.js`, `supabase.js`, `styles.css`, `charts.js` from version control.
- Remove `profiles.js` from docroot and from script list in `index.html`.
- Remove profile modal, beer detail modal, style tooltip div, manifest link, and any Phase 2.4–only markup from `index.html`.
- Redeploy static assets; no DB or API rollback needed.

## Smoke test checklist (Phase 2.4)

- [ ] Rate a beer (stars, YG, geotag, photo, price) — submits correctly.
- [ ] Dashboard: stats, charts, activity feed load.
- [ ] Browse: style filter, min rating, YG range, user filter, sort, clear filters; infinite scroll loads more.
- [ ] Leaderboard: weekly/monthly/alltime; Most Cheered shows after cheering.
- [ ] User profile: click username → profile modal; stats, portfolio, charts, beer trail, recent ratings.
- [ ] Beer detail: click beer name → modal; aggregate stats, YG context, all ratings; “Rate This Beer” pre-fills and navigates.
- [ ] Cheers: toggle on card, count updates, animation; “Sign in to cheers” when not logged in.
- [ ] Delete own review: confirm modal, deletion, toast.
- [ ] Mobile: all views usable at 360px width.
- [ ] PWA: manifest detected; add-to-homescreen available (icons in place).
- [ ] Shortcuts: N, Esc, /, B, D, L, ? work (M/E when views exist).
- [ ] Demo mode: app loads, empty states without API.

## Assumptions

- API already provides `/api/users/:id`, `/api/users/:id/stats`, `/api/ratings/user/:id`, `/api/map/user/:id`, `/api/exchange/portfolio/:id`, `/api/beers/:name`, `/api/ratings/:id/cheers` (GET/POST). Demo and 404s handled with client-derived data or empty state.
- Map/Exchange views may be added in Phase 2.3; shortcuts M/E no-op until those views exist.
- Leaderboard “Most Cheered” is client-side from cheers cache (no new API).
- PWA icons: user generates via `generate-icons.html` and saves to `icons/`.
