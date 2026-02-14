# BeerBook + Keycloak SSO — Deployment Guide

See PHASE1.md and runbooks/deploy.md for the canonical Phase 1 deployment. This doc is kept for reference.

## Architecture Overview

- Keycloak at auth.drinksafterwork.net (realm `daw`)
- BeerBook at beerbook.drinksafterwork.net (static nginx)
- beerbook-api at api.beerbook.drinksafterwork.net (BFF; browser never talks to Supabase directly)

One account. One login. Every DAW service.

## DNS Summary

| Record | Type | Value |
|---|---|---|
| auth.drinksafterwork.net | A | 178.156.232.88 |
| beerbook.drinksafterwork.net | A | 178.156.232.88 |
| api.beerbook.drinksafterwork.net | A | 178.156.232.88 |

## First-Time BeerBook (Phase 1)

1. Deploy via `runbooks/deploy.md`
2. Visit https://beerbook.drinksafterwork.net — config is baked in (config.js), no manual Supabase form
3. Click "Sign In with DAW" → Keycloak → back to BeerBook
