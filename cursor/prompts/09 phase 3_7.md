# Phase 3.1 — Beer Catalog: Schema & Seed Data

Apply `cursor/prompts/00_system.md` rules.

## Context Files (read before writing code)
- `ARCHITECTURE.md`
- `DECISIONS.md`
- `apps/beerbook/docs/database-schema.sql` (current canonical schema)
- `apps/beerbook-api/server.js` (current API — **read-only, do NOT modify**)
- `infra/compose/docker-compose.yml` (current compose)

## Goal

Add a global beer and brewery catalog to BeerBook — normalized, deduplicated, and seeded with ~8,000 breweries and ~5,000+ beers from open data sources. This catalog becomes the backbone for autocomplete, beer discovery, and future monetization (brewery referral links). **No API or frontend changes in this phase.** Schema + seed data only.

## Background

Currently, beer identity in BeerBook is free-text strings (`beer_name`, `brewery`) on the `ratings` table. This causes duplicates ("Sierra Nevada Pale Ale" vs "SN Pale Ale" vs "sierra nevada pale"), makes aggregation unreliable, and blocks features like autocomplete, brewery pages, and beer detail views.

This phase introduces proper `breweries` and `beers` catalog tables with identity/dedup strategy, alias tables for name drift, and trigram indexes for fuzzy search. Existing ratings are **not migrated** to use `beer_id` yet — that happens in Phase 3.2.

---

## Workstream 1: Database Migration

Create `apps/beerbook/docs/migration-3.1.sql` — a single, idempotent migration file.

### 1A: Enable pg_trgm extension

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

### 1B: Create `breweries` table (global catalog)

```sql
CREATE TABLE IF NOT EXISTS breweries (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,

    -- Core identity
    name TEXT NOT NULL,
    slug TEXT UNIQUE,                    -- URL-safe: /brewery/sierra-nevada
    normalized_name TEXT,                -- lowercase, stripped punctuation, for dedup matching

    -- Location
    street TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    country TEXT DEFAULT 'US',
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),

    -- Contact & web
    phone TEXT,
    website_url TEXT,                    -- raw URL from source
    referral_url TEXT,                   -- tracked/affiliate link (future monetization)

    -- Classification
    brewery_type TEXT,                   -- micro, regional, brewpub, taproom, contract, proprietor, large, planning, closed

    -- Media
    logo_url TEXT,
    description TEXT,

    -- Data provenance
    source TEXT NOT NULL DEFAULT 'user_submitted',  -- openbrewerydb, user_submitted, scraped
    source_id TEXT,                                  -- original ID in source system
    source_url TEXT,                                 -- where the data came from
    import_batch_id TEXT,                            -- for rollback of bad imports
    verified BOOLEAN DEFAULT FALSE,
    claimed BOOLEAN DEFAULT FALSE,                   -- future: brewery claims their listing

    -- Multi-tenant
    crew_id TEXT,                        -- NULL = global catalog

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_breweries_slug ON breweries(slug);
CREATE INDEX IF NOT EXISTS idx_breweries_normalized_name ON breweries(normalized_name);
CREATE INDEX IF NOT EXISTS idx_breweries_name_trgm ON breweries USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_breweries_city_state ON breweries(state, city);
CREATE INDEX IF NOT EXISTS idx_breweries_geo ON breweries(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_breweries_source ON breweries(source);
CREATE INDEX IF NOT EXISTS idx_breweries_verified ON breweries(verified);

-- Grants
GRANT SELECT ON breweries TO anon;
```

### 1C: Create `beers` table (global catalog)

```sql
CREATE TABLE IF NOT EXISTS beers (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,

    -- Core identity
    name TEXT NOT NULL,
    slug TEXT,                                       -- URL-safe: /beer/pale-ale
    normalized_name TEXT,                             -- lowercase, stripped punctuation
    brewery_id TEXT REFERENCES breweries(id) ON DELETE SET NULL,
    brewery_name TEXT,                               -- denormalized fallback

    -- Classification
    style TEXT,                                      -- raw style string from source/user (e.g. "New England Style IPA")
    style_category TEXT,                             -- BJCP-derived style name (matches beer_styles.name, e.g. "Hazy IPA")
    style_source TEXT DEFAULT 'user',                -- mapped, user, vendor

    -- Specs
    abv DECIMAL(4,2),
    ibu INTEGER,
    srm INTEGER,                                     -- color scale

    -- Details
    description TEXT,
    flavor_notes TEXT[],                             -- array: ['citrus', 'pine', 'mango']
    ingredients JSONB,                               -- { malts: [], hops: [], yeast: '' }
    food_pairings TEXT[],

    -- Availability
    availability TEXT,                               -- year-round, seasonal, limited
    is_seasonal BOOLEAN DEFAULT FALSE,

    -- Media
    image_url TEXT,
    label_url TEXT,

    -- Data provenance
    source TEXT NOT NULL DEFAULT 'user_submitted',   -- openbeerdatabase, punkapi, user_submitted
    source_id TEXT,
    source_url TEXT,
    import_batch_id TEXT,
    verified BOOLEAN DEFAULT FALSE,
    submitted_by TEXT,                               -- user_id if user-submitted

    -- Multi-tenant
    crew_id TEXT,                                    -- NULL = global catalog

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Composite uniqueness: same brewery + same normalized beer name = same beer
    UNIQUE(brewery_id, normalized_name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_beers_slug ON beers(slug);
CREATE INDEX IF NOT EXISTS idx_beers_normalized_name ON beers(normalized_name);
CREATE INDEX IF NOT EXISTS idx_beers_name_trgm ON beers USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_beers_brewery_id ON beers(brewery_id);
CREATE INDEX IF NOT EXISTS idx_beers_style ON beers(style);
CREATE INDEX IF NOT EXISTS idx_beers_style_category ON beers(style_category);
CREATE INDEX IF NOT EXISTS idx_beers_source ON beers(source);
CREATE INDEX IF NOT EXISTS idx_beers_verified ON beers(verified);

-- Grants
GRANT SELECT ON beers TO anon;
```

### 1D: Create `beer_styles` lookup table

```sql
CREATE TABLE IF NOT EXISTS beer_styles (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    name TEXT NOT NULL UNIQUE,
    category TEXT,                       -- Ale, Lager, Wild/Sour, Hybrid
    description TEXT,
    abv_min DECIMAL(4,2),
    abv_max DECIMAL(4,2),
    ibu_min INTEGER,
    ibu_max INTEGER
);

GRANT SELECT ON beer_styles TO anon;
```

### 1E: Create alias tables (for dedup / name drift)

```sql
CREATE TABLE IF NOT EXISTS brewery_aliases (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    brewery_id TEXT NOT NULL REFERENCES breweries(id) ON DELETE CASCADE,
    alias_name TEXT NOT NULL,
    normalized_alias TEXT NOT NULL,       -- lowercase, stripped
    source TEXT DEFAULT 'import',         -- import, user_correction, merge
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(brewery_id, normalized_alias)
);

CREATE INDEX IF NOT EXISTS idx_brewery_aliases_normalized ON brewery_aliases(normalized_alias);
CREATE INDEX IF NOT EXISTS idx_brewery_aliases_trgm ON brewery_aliases USING gin(alias_name gin_trgm_ops);

GRANT SELECT ON brewery_aliases TO anon;


CREATE TABLE IF NOT EXISTS beer_aliases (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    beer_id TEXT NOT NULL REFERENCES beers(id) ON DELETE CASCADE,
    alias_name TEXT NOT NULL,
    normalized_alias TEXT NOT NULL,
    source TEXT DEFAULT 'import',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(beer_id, normalized_alias)
);

CREATE INDEX IF NOT EXISTS idx_beer_aliases_normalized ON beer_aliases(normalized_alias);
CREATE INDEX IF NOT EXISTS idx_beer_aliases_trgm ON beer_aliases USING gin(alias_name gin_trgm_ops);

GRANT SELECT ON beer_aliases TO anon;
```

### 1F: Add `beer_id` column to `ratings` (nullable, no enforcement yet)

```sql
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS beer_id TEXT REFERENCES beers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ratings_beer_id ON ratings(beer_id);
```

This column will be used in Phase 3.2 to link ratings to catalog beers. Existing ratings continue to work via `beer_name` strings.

### 1G: Add `updated_at` trigger for new tables

```sql
DROP TRIGGER IF EXISTS breweries_updated_at ON breweries;
CREATE TRIGGER breweries_updated_at BEFORE UPDATE ON breweries FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 1H: Update canonical schema

After migration runs, update `apps/beerbook/docs/database-schema.sql` to reflect the full merged schema (existing tables + new catalog tables). This is the single source of truth for "what does the DB look like now."

**Success criteria for Workstream 1:**
- [ ] Migration runs without error: `docker exec -i supabase-db psql -U postgres -d postgres < apps/beerbook/docs/migration-3.1.sql`
- [ ] `\dt` shows new tables: `breweries`, `beers`, `beer_styles`, `brewery_aliases`, `beer_aliases`
- [ ] `\d breweries` shows all columns including `slug`, `normalized_name`, `referral_url`
- [ ] `\d beers` shows all columns including `flavor_notes`, `ingredients`, composite unique constraint
- [ ] `\d ratings` shows new `beer_id` column
- [ ] `SELECT * FROM pg_extension WHERE extname = 'pg_trgm';` returns a row
- [ ] Existing data intact: `SELECT count(*) FROM ratings` matches pre-migration count
- [ ] Existing views still work: `SELECT * FROM beer_averages LIMIT 1;`

**STOP. Verify all criteria. Do not proceed to Workstream 2 until migration is confirmed.**

---

## Workstream 2: Seed Script

Create `scripts/seed-catalog.js` — a Node.js script that populates the catalog tables from open data sources.

### 2A: Dependencies

The script should use only:
- `node-fetch` (or native fetch if Node 18+) for HTTP requests
- `csv-parse` (from npm) for CSV parsing
- `pg` (node-postgres) for direct DB access

Create `scripts/package.json`:
```json
{
  "name": "beerbook-seed",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "csv-parse": "^5.5.0",
    "pg": "^8.12.0"
  }
}
```

The script connects directly to Postgres (not through PostgREST/beerbook-api). Connection string from environment:
```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/postgres
```

On VPS, if Postgres is only accessible via Docker network, use:
```bash
docker exec -i supabase-db psql -U postgres -d postgres
```
Or expose port 5432 temporarily for the seed run, or run the script inside a container on the same Docker network.

**Recommended approach:** Create a one-off Docker container that runs on the `default` network (same as supabase-db):
```bash
cd scripts
docker run --rm -it \
  --network daw-platform_default \
  -v $(pwd):/app \
  -w /app \
  -e DATABASE_URL=postgresql://postgres:$SUPABASE_DB_PASSWORD@supabase-db:5432/postgres \
  node:20-alpine \
  sh -c "npm install && node seed-catalog.js"
```

### 2B: Utility functions

The script needs these helpers:

```javascript
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function generateBatchId() {
  return `seed_${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}`;
}
```

### 2C: Step 1 — Seed breweries from Open Brewery DB

Source: `https://api.openbrewerydb.org/v1/breweries`

This API is paginated (200 per page max). Fetch all pages:

```
GET https://api.openbrewerydb.org/v1/breweries?page=1&per_page=200
GET https://api.openbrewerydb.org/v1/breweries?page=2&per_page=200
... continue until empty response
```

For each brewery, map fields:
```javascript
{
  name: b.name,
  slug: slugify(b.name),
  normalized_name: normalizeName(b.name),
  street: b.street || null,
  city: b.city || null,
  state: b.state || null,
  postal_code: b.postal_code || null,
  country: b.country || 'US',
  latitude: b.latitude ? parseFloat(b.latitude) : null,
  longitude: b.longitude ? parseFloat(b.longitude) : null,
  phone: b.phone || null,
  website_url: b.website_url || null,
  brewery_type: b.brewery_type || null,
  source: 'openbrewerydb',
  source_id: b.id,
  source_url: `https://api.openbrewerydb.org/v1/breweries/${b.id}`,
  import_batch_id: batchId,
  verified: true
}
```

**Dedup rule:** If a brewery with the same `normalized_name` AND `state` already exists, skip it. Log skips.

**Handle slug collisions:** If `slug` already exists, append city: `${slug}-${slugify(city)}`. If still collides, append source_id.

Use batch inserts (100-200 per INSERT) for performance. Log progress every 500 records.

**Expected result:** ~8,000–9,000 brewery rows.

### 2D: Step 2 — Seed beers from Open Beer DB

Source: Download the CSV dump from GitHub. The script should fetch it from:
`https://raw.githubusercontent.com/brewdega/open-beer-database-dumps/master/dumps/beers.csv`

Also fetch breweries CSV to map their brewery IDs to names:
`https://raw.githubusercontent.com/brewdega/open-beer-database-dumps/master/dumps/breweries.csv`

If those URLs are unavailable, fall back to the original source:
`https://raw.githubusercontent.com/BJClark/openbeerdatabase/master/data/beers.csv`

If neither GitHub URL works, fall back to a local file `scripts/data/beers.csv` and `scripts/data/breweries_openbeerdb.csv` (operator downloads from https://openbeerdb.com and places manually).

**Note:** This dataset is from ~2011 — it won't have modern craft beers. That's fine. User submissions and future imports will fill gaps over time.

For each beer:
1. Look up the brewery by matching `normalizeName(brewery_name)` against our `breweries.normalized_name`
2. If no match found, create a new brewery record with `source = 'openbeerdatabase'` and `verified = false`
3. Map the raw style string to a BJCP style name using `mapStyleToName()` (see 2F)
4. Derive the broad category from the `beer_styles` lookup table
5. Insert the beer:

```javascript
{
  name: beer.name,
  slug: slugify(beer.name),
  normalized_name: normalizeName(beer.name),
  brewery_id: matchedBreweryId,
  brewery_name: beer.brewery_name,       // denormalized
  style: beer.style || null,             // raw style string from source
  style_category: mapStyleToName(beer.style),  // BJCP-derived style name (matches beer_styles.name)
  style_source: 'vendor',
  abv: beer.abv ? parseFloat(beer.abv) : null,
  ibu: beer.ibu ? parseInt(beer.ibu) : null,
  description: beer.description || null,
  source: 'openbeerdatabase',
  source_id: beer.id,
  import_batch_id: batchId,
  verified: true
}
```

**Dedup rule:** Use the composite unique constraint `(brewery_id, normalized_name)`. Use `ON CONFLICT DO NOTHING` to skip exact dupes.

**Expected result:** ~5,000–6,000 beer rows.

### 2E: Step 3 — Seed beers from Punk API (BrewDog)

Source: The original Punk API (`api.punkapi.com`) shut down May 2024. Use the community fork:
`https://punkapi-alxiw.amvera.io/v3/beers`

Paginated: `?page=1&per_page=80`. Fetch all pages until empty.

**Note:** This fork has 415 beers (more than the original 300). If this fork is also unavailable, the `punkapi-db` npm package (`npm install punkapi-db`) contains the full `data.json` as a fallback. The seed should still succeed without Punk API data — it's a nice-to-have for rich ingredient/pairing data.

First, ensure a "BrewDog" brewery exists:
```javascript
// Find or create BrewDog brewery
let brewdogId = await findBreweryByNormalizedName('brewdog');
if (!brewdogId) {
  brewdogId = await insertBrewery({
    name: 'BrewDog',
    slug: 'brewdog',
    normalized_name: 'brewdog',
    city: 'Ellon',
    state: null,
    country: 'Scotland',
    brewery_type: 'large',
    website_url: 'https://www.brewdog.com',
    source: 'punkapi',
    verified: true,
    import_batch_id: batchId
  });
}
```

For each Punk API beer:
```javascript
{
  name: beer.name,
  slug: slugify(beer.name),
  normalized_name: normalizeName(beer.name),
  brewery_id: brewdogId,
  brewery_name: 'BrewDog',
  style: beer.tagline || null,
  abv: beer.abv,
  ibu: beer.ibu,
  srm: beer.srm,
  description: beer.description,
  flavor_notes: extractFlavorNotes(beer),   // see 2F
  ingredients: {
    malts: beer.ingredients?.malt?.map(m => m.name) || [],
    hops: beer.ingredients?.hops?.map(h => h.name) || [],
    yeast: beer.ingredients?.yeast || null
  },
  food_pairings: beer.food_pairing || [],
  source: 'punkapi',
  source_id: String(beer.id),
  import_batch_id: batchId,
  verified: true
}
```

**Expected result:** ~300 beer rows with rich ingredient/pairing data.

### 2F: Helper functions

```javascript
// Map raw style strings to the closest BJCP-derived style name
// Returns the specific style for beer_styles lookup matching
function mapStyleToName(styleStr) {
  if (!styleStr) return null;
  const s = styleStr.toLowerCase();

  // IPA family
  if (s.includes('hazy') || s.includes('new england') || s.includes('neipa') || s.includes('juicy')) return 'Hazy IPA';
  if (s.includes('double ipa') || s.includes('imperial ipa') || s.includes('dipa')) return 'Double IPA';
  if (s.includes('brut ipa')) return 'Brut IPA';
  if (s.includes('black ipa') || s.includes('cascadian')) return 'Black IPA';
  if (s.includes('rye ipa')) return 'Rye IPA';
  if (s.includes('belgian ipa')) return 'Belgian IPA';
  if (s.includes('english ipa')) return 'English IPA';
  if (s.includes('ipa') || s.includes('india pale')) return 'American IPA';

  // Stout family
  if (s.includes('imperial stout') || s.includes('russian imperial')) return 'Imperial Stout';
  if (s.includes('oatmeal stout')) return 'Oatmeal Stout';
  if (s.includes('sweet stout') || s.includes('milk stout') || s.includes('lactose stout')) return 'Sweet Stout';
  if (s.includes('tropical stout')) return 'Tropical Stout';
  if (s.includes('foreign extra stout') || s.includes('export stout')) return 'Foreign Extra Stout';
  if (s.includes('irish extra stout')) return 'Irish Extra Stout';
  if (s.includes('irish stout') || s.includes('dry stout')) return 'Irish Stout';
  if (s.includes('american stout')) return 'American Stout';
  if (s.includes('stout')) return 'Irish Stout';

  // Porter family
  if (s.includes('baltic porter')) return 'Baltic Porter';
  if (s.includes('english porter')) return 'English Porter';
  if (s.includes('american porter')) return 'American Porter';
  if (s.includes('porter')) return 'American Porter';

  // Sour / Wild
  if (s.includes('berliner')) return 'Berliner Weisse';
  if (s.includes('gose')) return 'Gose';
  if (s.includes('gueuze')) return 'Gueuze';
  if (s.includes('lambic')) return 'Lambic';
  if (s.includes('flanders red')) return 'Flanders Red Ale';
  if (s.includes('oud bruin')) return 'Oud Bruin';
  if (s.includes('brett')) return 'Brett Beer';
  if (s.includes('sour') || s.includes('wild')) return 'Mixed-Fermentation Sour Beer';

  // Belgian family
  if (s.includes('witbier') || s.includes('belgian wit') || s.includes('white ale')) return 'Witbier';
  if (s.includes('saison') || s.includes('farmhouse')) return 'Saison';
  if (s.includes('dubbel')) return 'Belgian Dubbel';
  if (s.includes('tripel')) return 'Belgian Tripel';
  if (s.includes('belgian dark strong')) return 'Belgian Dark Strong Ale';
  if (s.includes('belgian golden strong')) return 'Belgian Golden Strong Ale';
  if (s.includes('belgian blonde')) return 'Belgian Blonde Ale';
  if (s.includes('belgian pale')) return 'Belgian Pale Ale';
  if (s.includes('bière de garde') || s.includes('biere de garde')) return 'Bière de Garde';
  if (s.includes('belgian single')) return 'Belgian Single';
  if (s.includes('belgian')) return 'Belgian Pale Ale';

  // Wheat family
  if (s.includes('weizenbock')) return 'Weizenbock';
  if (s.includes('dunkles weiss') || s.includes('dunkelweizen')) return 'Dunkles Weissbier';
  if (s.includes('hefeweizen') || s.includes('weissbier') || s.includes('weizen')) return 'Weissbier';
  if (s.includes('wheatwine')) return 'Wheatwine';
  if (s.includes('american wheat')) return 'American Wheat Beer';
  if (s.includes('wheat')) return 'American Wheat Beer';

  // Lager family
  if (s.includes('czech') && s.includes('pale')) return 'Czech Premium Pale Lager';
  if (s.includes('czech') && s.includes('amber')) return 'Czech Amber Lager';
  if (s.includes('czech') && s.includes('dark')) return 'Czech Dark Lager';
  if (s.includes('pilsner') || s.includes('pilsener') || s.includes('pils')) return 'German Pils';
  if (s.includes('helles') && !s.includes('bock')) return 'Munich Helles';
  if (s.includes('festbier') || s.includes('oktoberfest')) return 'Festbier';
  if (s.includes('märzen') || s.includes('marzen')) return 'Märzen';
  if (s.includes('vienna lager')) return 'Vienna Lager';
  if (s.includes('dunkel') && !s.includes('weiss') && !s.includes('weizen')) return 'Munich Dunkel';
  if (s.includes('schwarzbier')) return 'Schwarzbier';
  if (s.includes('rauchbier') || s.includes('smoked lager')) return 'Rauchbier';
  if (s.includes('american light lager')) return 'American Light Lager';
  if (s.includes('american lager') || s.includes('adjunct lager')) return 'American Lager';
  if (s.includes('cream ale')) return 'Cream Ale';
  if (s.includes('lager')) return 'International Pale Lager';

  // Bock family
  if (s.includes('eisbock')) return 'Eisbock';
  if (s.includes('doppelbock')) return 'Doppelbock';
  if (s.includes('helles bock') || s.includes('maibock')) return 'Helles Bock';
  if (s.includes('dunkles bock')) return 'Dunkles Bock';
  if (s.includes('bock')) return 'Dunkles Bock';

  // Hybrid
  if (s.includes('kölsch') || s.includes('kolsch')) return 'Kölsch';
  if (s.includes('altbier') || s.includes('alt beer')) return 'Altbier';
  if (s.includes('california common') || s.includes('steam beer')) return 'California Common';

  // Pale Ale family
  if (s.includes('american pale')) return 'American Pale Ale';
  if (s.includes('british golden')) return 'British Golden Ale';
  if (s.includes('blonde ale') || s.includes('golden ale')) return 'Blonde Ale';
  if (s.includes('pale ale')) return 'American Pale Ale';

  // Amber / Red
  if (s.includes('irish red')) return 'Irish Red Ale';
  if (s.includes('american amber')) return 'American Amber Ale';
  if (s.includes('amber') || s.includes('red ale')) return 'American Amber Ale';

  // Brown Ale
  if (s.includes('american brown')) return 'American Brown Ale';
  if (s.includes('british brown') || s.includes('english brown')) return 'British Brown Ale';
  if (s.includes('dark mild') || s.includes('mild ale')) return 'Dark Mild';
  if (s.includes('brown ale')) return 'American Brown Ale';

  // Bitter
  if (s.includes('strong bitter') || s.includes('esb') || s.includes('extra special')) return 'Strong Bitter';
  if (s.includes('best bitter')) return 'Best Bitter';
  if (s.includes('ordinary bitter') || s.includes('session bitter')) return 'Ordinary Bitter';
  if (s.includes('bitter')) return 'Best Bitter';

  // Scottish
  if (s.includes('wee heavy') || s.includes('scotch ale')) return 'Wee Heavy';
  if (s.includes('scottish')) return 'Scottish Export';

  // Barleywine
  if (s.includes('american barleywine') || s.includes('american barley wine')) return 'American Barleywine';
  if (s.includes('english barleywine') || s.includes('english barley wine')) return 'English Barleywine';
  if (s.includes('barleywine') || s.includes('barley wine')) return 'American Barleywine';

  // Strong
  if (s.includes('american strong') || s.includes('imperial')) return 'American Strong Ale';
  if (s.includes('british strong') || s.includes('old ale')) return 'Old Ale';

  // Specialty
  if (s.includes('fruit')) return 'Fruit Beer';
  if (s.includes('smoked') || s.includes('smoke')) return 'Smoked Beer';
  if (s.includes('wood') || s.includes('barrel')) return 'Wood-Aged Beer';
  if (s.includes('spice') || s.includes('herb') || s.includes('pumpkin') || s.includes('chili') || s.includes('chile')) return 'Spice/Herb/Vegetable Beer';

  // Non-beer
  if (s.includes('cider')) return 'Cider';
  if (s.includes('mead')) return 'Mead';
  if (s.includes('seltzer')) return 'Hard Seltzer';

  return 'Other';
}

// Extract flavor notes from Punk API hop data
function extractFlavorNotes(beer) {
  const notes = new Set();
  if (beer.ingredients?.hops) {
    for (const hop of beer.ingredients.hops) {
      // Punk API sometimes includes flavor attribute
      if (hop.attribute === 'flavour' || hop.attribute === 'aroma') {
        notes.add(hop.name.toLowerCase());
      }
    }
  }
  return notes.size > 0 ? [...notes] : null;
}
```

### 2G: Seed beer_styles lookup

Seed with the full BJCP 2021-derived style list (~67 styles). Each style has a `category` for broad grouping in the UI. Stats (ABV, IBU) are typical ranges from BJCP guidelines.

```javascript
const STYLES = [
  // === Standard American Beer ===
  { name: 'American Light Lager', category: 'Lager', abv_min: 2.8, abv_max: 4.2, ibu_min: 8, ibu_max: 12 },
  { name: 'American Lager', category: 'Lager', abv_min: 4.2, abv_max: 5.3, ibu_min: 8, ibu_max: 18 },
  { name: 'Cream Ale', category: 'Hybrid', abv_min: 4.2, abv_max: 5.6, ibu_min: 8, ibu_max: 20 },
  { name: 'American Wheat Beer', category: 'Wheat', abv_min: 4.0, abv_max: 5.5, ibu_min: 15, ibu_max: 30 },

  // === International Lager ===
  { name: 'International Pale Lager', category: 'Lager', abv_min: 4.5, abv_max: 6.0, ibu_min: 18, ibu_max: 25 },
  { name: 'International Amber Lager', category: 'Lager', abv_min: 4.5, abv_max: 6.0, ibu_min: 8, ibu_max: 25 },
  { name: 'International Dark Lager', category: 'Lager', abv_min: 4.2, abv_max: 6.0, ibu_min: 8, ibu_max: 20 },

  // === Czech Lager ===
  { name: 'Czech Pale Lager', category: 'Lager', abv_min: 3.0, abv_max: 4.1, ibu_min: 20, ibu_max: 35 },
  { name: 'Czech Premium Pale Lager', category: 'Lager', abv_min: 4.2, abv_max: 5.8, ibu_min: 30, ibu_max: 45 },
  { name: 'Czech Amber Lager', category: 'Lager', abv_min: 4.4, abv_max: 5.8, ibu_min: 20, ibu_max: 35 },
  { name: 'Czech Dark Lager', category: 'Lager', abv_min: 4.4, abv_max: 5.8, ibu_min: 18, ibu_max: 34 },

  // === Pale Malty European Lager ===
  { name: 'Munich Helles', category: 'Lager', abv_min: 4.7, abv_max: 5.4, ibu_min: 16, ibu_max: 22 },
  { name: 'Festbier', category: 'Lager', abv_min: 5.8, abv_max: 6.3, ibu_min: 18, ibu_max: 25 },
  { name: 'Helles Bock', category: 'Bock', abv_min: 6.3, abv_max: 7.4, ibu_min: 23, ibu_max: 35 },

  // === Pale Bitter European Beer ===
  { name: 'German Leichtbier', category: 'Lager', abv_min: 2.4, abv_max: 3.6, ibu_min: 15, ibu_max: 28 },
  { name: 'Kölsch', category: 'Hybrid', abv_min: 4.4, abv_max: 5.2, ibu_min: 18, ibu_max: 30 },
  { name: 'German Helles Exportbier', category: 'Lager', abv_min: 5.0, abv_max: 6.0, ibu_min: 20, ibu_max: 30 },
  { name: 'German Pils', category: 'Lager', abv_min: 4.4, abv_max: 5.2, ibu_min: 22, ibu_max: 40 },

  // === Amber Malty European Lager ===
  { name: 'Märzen', category: 'Lager', abv_min: 5.6, abv_max: 6.3, ibu_min: 18, ibu_max: 24 },
  { name: 'Rauchbier', category: 'Lager', abv_min: 4.8, abv_max: 6.0, ibu_min: 20, ibu_max: 30 },
  { name: 'Dunkles Bock', category: 'Bock', abv_min: 6.3, abv_max: 7.2, ibu_min: 20, ibu_max: 27 },

  // === Amber Bitter European Beer ===
  { name: 'Vienna Lager', category: 'Lager', abv_min: 4.7, abv_max: 5.5, ibu_min: 18, ibu_max: 30 },
  { name: 'Altbier', category: 'Hybrid', abv_min: 4.3, abv_max: 5.5, ibu_min: 25, ibu_max: 50 },

  // === Dark European Lager ===
  { name: 'Munich Dunkel', category: 'Lager', abv_min: 4.5, abv_max: 5.6, ibu_min: 18, ibu_max: 28 },
  { name: 'Schwarzbier', category: 'Lager', abv_min: 4.4, abv_max: 5.4, ibu_min: 20, ibu_max: 35 },

  // === Strong European Beer ===
  { name: 'Doppelbock', category: 'Bock', abv_min: 7.0, abv_max: 10.0, ibu_min: 16, ibu_max: 26 },
  { name: 'Eisbock', category: 'Bock', abv_min: 9.0, abv_max: 14.0, ibu_min: 25, ibu_max: 35 },
  { name: 'Baltic Porter', category: 'Porter', abv_min: 6.5, abv_max: 9.5, ibu_min: 20, ibu_max: 40 },

  // === German Wheat Beer ===
  { name: 'Weissbier', category: 'Wheat', abv_min: 4.3, abv_max: 5.6, ibu_min: 8, ibu_max: 15 },
  { name: 'Dunkles Weissbier', category: 'Wheat', abv_min: 4.3, abv_max: 5.6, ibu_min: 10, ibu_max: 18 },
  { name: 'Weizenbock', category: 'Wheat', abv_min: 6.5, abv_max: 9.0, ibu_min: 15, ibu_max: 30 },

  // === British Bitter ===
  { name: 'Ordinary Bitter', category: 'Bitter', abv_min: 3.2, abv_max: 3.8, ibu_min: 25, ibu_max: 35 },
  { name: 'Best Bitter', category: 'Bitter', abv_min: 3.8, abv_max: 4.6, ibu_min: 25, ibu_max: 40 },
  { name: 'Strong Bitter', category: 'Bitter', abv_min: 4.6, abv_max: 6.2, ibu_min: 30, ibu_max: 50 },

  // === Pale Commonwealth Beer ===
  { name: 'British Golden Ale', category: 'Pale Ale', abv_min: 3.8, abv_max: 5.0, ibu_min: 20, ibu_max: 45 },
  { name: 'Australian Sparkling Ale', category: 'Pale Ale', abv_min: 4.5, abv_max: 6.0, ibu_min: 20, ibu_max: 35 },
  { name: 'English IPA', category: 'IPA', abv_min: 5.0, abv_max: 7.5, ibu_min: 40, ibu_max: 60 },

  // === Brown British Beer ===
  { name: 'Dark Mild', category: 'Brown Ale', abv_min: 3.0, abv_max: 3.8, ibu_min: 10, ibu_max: 25 },
  { name: 'British Brown Ale', category: 'Brown Ale', abv_min: 4.2, abv_max: 5.9, ibu_min: 20, ibu_max: 30 },
  { name: 'English Porter', category: 'Porter', abv_min: 4.0, abv_max: 5.4, ibu_min: 18, ibu_max: 35 },

  // === Scottish Ale ===
  { name: 'Scottish Light', category: 'Scottish Ale', abv_min: 2.5, abv_max: 3.3, ibu_min: 10, ibu_max: 20 },
  { name: 'Scottish Heavy', category: 'Scottish Ale', abv_min: 3.3, abv_max: 3.9, ibu_min: 10, ibu_max: 20 },
  { name: 'Scottish Export', category: 'Scottish Ale', abv_min: 3.9, abv_max: 6.0, ibu_min: 15, ibu_max: 30 },

  // === Irish Beer ===
  { name: 'Irish Red Ale', category: 'Amber/Red', abv_min: 3.8, abv_max: 5.0, ibu_min: 18, ibu_max: 28 },
  { name: 'Irish Stout', category: 'Stout', abv_min: 3.8, abv_max: 5.0, ibu_min: 25, ibu_max: 45 },
  { name: 'Irish Extra Stout', category: 'Stout', abv_min: 5.0, abv_max: 6.5, ibu_min: 35, ibu_max: 50 },

  // === Dark British Beer ===
  { name: 'Sweet Stout', category: 'Stout', abv_min: 4.0, abv_max: 6.0, ibu_min: 20, ibu_max: 40 },
  { name: 'Oatmeal Stout', category: 'Stout', abv_min: 4.2, abv_max: 5.9, ibu_min: 25, ibu_max: 40 },
  { name: 'Tropical Stout', category: 'Stout', abv_min: 5.5, abv_max: 8.0, ibu_min: 30, ibu_max: 50 },
  { name: 'Foreign Extra Stout', category: 'Stout', abv_min: 6.3, abv_max: 8.0, ibu_min: 50, ibu_max: 70 },

  // === Strong British Ale ===
  { name: 'British Strong Ale', category: 'Strong Ale', abv_min: 5.5, abv_max: 8.0, ibu_min: 30, ibu_max: 60 },
  { name: 'Old Ale', category: 'Strong Ale', abv_min: 5.5, abv_max: 9.0, ibu_min: 30, ibu_max: 60 },
  { name: 'Wee Heavy', category: 'Scottish Ale', abv_min: 6.5, abv_max: 10.0, ibu_min: 17, ibu_max: 35 },
  { name: 'English Barleywine', category: 'Barleywine', abv_min: 8.0, abv_max: 12.0, ibu_min: 35, ibu_max: 70 },

  // === Pale American Ale ===
  { name: 'Blonde Ale', category: 'Pale Ale', abv_min: 3.8, abv_max: 5.5, ibu_min: 15, ibu_max: 28 },
  { name: 'American Pale Ale', category: 'Pale Ale', abv_min: 4.5, abv_max: 6.2, ibu_min: 30, ibu_max: 50 },

  // === Amber and Brown American Beer ===
  { name: 'American Amber Ale', category: 'Amber/Red', abv_min: 4.5, abv_max: 6.2, ibu_min: 25, ibu_max: 40 },
  { name: 'California Common', category: 'Hybrid', abv_min: 4.5, abv_max: 5.5, ibu_min: 30, ibu_max: 45 },
  { name: 'American Brown Ale', category: 'Brown Ale', abv_min: 4.3, abv_max: 6.2, ibu_min: 20, ibu_max: 30 },

  // === American Porter and Stout ===
  { name: 'American Porter', category: 'Porter', abv_min: 4.8, abv_max: 6.5, ibu_min: 25, ibu_max: 50 },
  { name: 'American Stout', category: 'Stout', abv_min: 5.0, abv_max: 7.0, ibu_min: 35, ibu_max: 75 },
  { name: 'Imperial Stout', category: 'Stout', abv_min: 8.0, abv_max: 12.0, ibu_min: 50, ibu_max: 90 },

  // === IPA ===
  { name: 'American IPA', category: 'IPA', abv_min: 5.5, abv_max: 7.5, ibu_min: 40, ibu_max: 70 },
  { name: 'Hazy IPA', category: 'IPA', abv_min: 6.0, abv_max: 9.0, ibu_min: 25, ibu_max: 60 },
  { name: 'Double IPA', category: 'IPA', abv_min: 7.5, abv_max: 10.0, ibu_min: 60, ibu_max: 100 },

  // === Strong American Ale ===
  { name: 'American Strong Ale', category: 'Strong Ale', abv_min: 6.3, abv_max: 10.0, ibu_min: 50, ibu_max: 100 },
  { name: 'American Barleywine', category: 'Barleywine', abv_min: 8.0, abv_max: 12.0, ibu_min: 50, ibu_max: 100 },
  { name: 'Wheatwine', category: 'Wheat', abv_min: 8.0, abv_max: 12.0, ibu_min: 30, ibu_max: 60 },

  // === European Sour Ale ===
  { name: 'Berliner Weisse', category: 'Sour/Wild', abv_min: 2.8, abv_max: 3.8, ibu_min: 3, ibu_max: 8 },
  { name: 'Flanders Red Ale', category: 'Sour/Wild', abv_min: 4.6, abv_max: 6.5, ibu_min: 10, ibu_max: 25 },
  { name: 'Oud Bruin', category: 'Sour/Wild', abv_min: 4.0, abv_max: 8.0, ibu_min: 20, ibu_max: 25 },
  { name: 'Lambic', category: 'Sour/Wild', abv_min: 5.0, abv_max: 6.5, ibu_min: 0, ibu_max: 10 },
  { name: 'Gueuze', category: 'Sour/Wild', abv_min: 5.0, abv_max: 8.0, ibu_min: 0, ibu_max: 10 },
  { name: 'Gose', category: 'Sour/Wild', abv_min: 4.2, abv_max: 4.8, ibu_min: 5, ibu_max: 12 },

  // === Belgian Ale ===
  { name: 'Witbier', category: 'Wheat', abv_min: 4.5, abv_max: 5.5, ibu_min: 8, ibu_max: 20 },
  { name: 'Belgian Pale Ale', category: 'Belgian', abv_min: 4.8, abv_max: 5.5, ibu_min: 20, ibu_max: 30 },
  { name: 'Bière de Garde', category: 'Belgian', abv_min: 6.0, abv_max: 8.5, ibu_min: 18, ibu_max: 28 },
  { name: 'Saison', category: 'Belgian', abv_min: 5.0, abv_max: 9.5, ibu_min: 20, ibu_max: 35 },

  // === Strong Belgian Ale ===
  { name: 'Belgian Blonde Ale', category: 'Belgian', abv_min: 6.0, abv_max: 7.5, ibu_min: 15, ibu_max: 30 },
  { name: 'Belgian Golden Strong Ale', category: 'Belgian', abv_min: 7.5, abv_max: 10.5, ibu_min: 22, ibu_max: 35 },
  { name: 'Belgian Tripel', category: 'Belgian', abv_min: 7.5, abv_max: 9.5, ibu_min: 20, ibu_max: 40 },

  // === Monastic Ale ===
  { name: 'Belgian Single', category: 'Belgian', abv_min: 4.8, abv_max: 6.0, ibu_min: 25, ibu_max: 45 },
  { name: 'Belgian Dubbel', category: 'Belgian', abv_min: 6.0, abv_max: 7.6, ibu_min: 15, ibu_max: 25 },
  { name: 'Belgian Dark Strong Ale', category: 'Belgian', abv_min: 8.0, abv_max: 12.0, ibu_min: 20, ibu_max: 35 },

  // === Specialty IPA (popular substyles worth tracking) ===
  { name: 'Belgian IPA', category: 'IPA', abv_min: 6.2, abv_max: 9.5, ibu_min: 50, ibu_max: 100 },
  { name: 'Black IPA', category: 'IPA', abv_min: 5.0, abv_max: 9.0, ibu_min: 50, ibu_max: 90 },
  { name: 'Brut IPA', category: 'IPA', abv_min: 6.0, abv_max: 7.5, ibu_min: 20, ibu_max: 30 },
  { name: 'Rye IPA', category: 'IPA', abv_min: 5.5, abv_max: 8.0, ibu_min: 50, ibu_max: 75 },

  // === American Wild Ale ===
  { name: 'Brett Beer', category: 'Sour/Wild', abv_min: null, abv_max: null, ibu_min: null, ibu_max: null },
  { name: 'Mixed-Fermentation Sour Beer', category: 'Sour/Wild', abv_min: null, abv_max: null, ibu_min: null, ibu_max: null },

  // === Specialty / Catch-all ===
  { name: 'Fruit Beer', category: 'Specialty', abv_min: null, abv_max: null, ibu_min: null, ibu_max: null },
  { name: 'Spice/Herb/Vegetable Beer', category: 'Specialty', abv_min: null, abv_max: null, ibu_min: null, ibu_max: null },
  { name: 'Smoked Beer', category: 'Specialty', abv_min: null, abv_max: null, ibu_min: null, ibu_max: null },
  { name: 'Wood-Aged Beer', category: 'Specialty', abv_min: null, abv_max: null, ibu_min: null, ibu_max: null },

  // === Non-beer (for completeness) ===
  { name: 'Cider', category: 'Cider', abv_min: 3.0, abv_max: 10.0, ibu_min: null, ibu_max: null },
  { name: 'Mead', category: 'Mead', abv_min: 5.0, abv_max: 20.0, ibu_min: null, ibu_max: null },
  { name: 'Hard Seltzer', category: 'Other', abv_min: 3.0, abv_max: 7.0, ibu_min: null, ibu_max: null },
  { name: 'Other', category: 'Other', abv_min: null, abv_max: null, ibu_min: null, ibu_max: null }
];
```

That's ~87 styles derived from BJCP 2021 categories. Use `ON CONFLICT (name) DO NOTHING`.

### 2H: Script output

The script should print a summary at the end:

```
=== Seed Complete ===
Batch ID: seed_20260218143022
Breweries inserted: 8,412
Breweries skipped (dupe): 203
Beers inserted: 5,847
Beers skipped (dupe): 312
Beer styles inserted: 18
Punk API beers: 325 (or "Punk API unavailable — skipped")
Duration: 2m 34s
```

### 2I: Rollback support

If the seed goes wrong, the `import_batch_id` makes cleanup easy:

```sql
DELETE FROM beers WHERE import_batch_id = 'seed_20260218143022';
DELETE FROM breweries WHERE import_batch_id = 'seed_20260218143022';
```

Document this in a comment at the top of the seed script.

**Success criteria for Workstream 2:**
- [ ] `cd scripts && npm install` succeeds
- [ ] Seed script runs to completion without errors
- [ ] `SELECT count(*) FROM breweries;` returns 7,000+ rows
- [ ] `SELECT count(*) FROM beers;` returns 4,000+ rows
- [ ] `SELECT count(*) FROM beer_styles;` returns 80+ rows
- [ ] `SELECT * FROM breweries WHERE source = 'openbrewerydb' LIMIT 3;` shows populated fields
- [ ] `SELECT * FROM beers WHERE source = 'punkapi' LIMIT 3;` shows `ingredients` JSONB and `food_pairings` array
- [ ] No duplicate breweries: `SELECT normalized_name, state, count(*) FROM breweries GROUP BY normalized_name, state HAVING count(*) > 1;` returns 0 rows (or only intentional multi-location entries)
- [ ] Slug uniqueness: `SELECT slug, count(*) FROM breweries GROUP BY slug HAVING count(*) > 1;` returns 0 rows
- [ ] Existing tables unaffected: `SELECT count(*) FROM ratings` unchanged, `SELECT count(*) FROM venues` unchanged
- [ ] Rollback tested: delete one batch, re-run seed, counts match

**STOP. Commit. Deploy to VPS. Run migration, then seed. Verify all counts.**

---

## Workstream 3: Documentation

### 3A: Update canonical schema

Update `apps/beerbook/docs/database-schema.sql` to include all new tables (breweries, beers, beer_styles, brewery_aliases, beer_aliases) merged with existing schema.

### 3B: Create seed runbook

Create `runbooks/seed-catalog.md`:

```markdown
# Beer Catalog Seed

## Prerequisites
- Phase 3.1 migration applied (breweries, beers tables exist)
- Docker stack running
- Know your SUPABASE_DB_PASSWORD (from .env)

## Run seed
From repo root on VPS:
\`\`\`bash
cd scripts
docker run --rm -it \
  --network daw-platform_default \
  -v $(pwd):/app \
  -w /app \
  -e DATABASE_URL=postgresql://postgres:$SUPABASE_DB_PASSWORD@supabase-db:5432/postgres \
  node:20-alpine \
  sh -c "npm install && node seed-catalog.js"
\`\`\`

## Verify
\`\`\`bash
docker exec supabase-db psql -U postgres -d postgres -c "SELECT source, count(*) FROM breweries GROUP BY source;"
docker exec supabase-db psql -U postgres -d postgres -c "SELECT source, count(*) FROM beers GROUP BY source;"
\`\`\`

## Rollback
If seed data is bad:
\`\`\`bash
docker exec supabase-db psql -U postgres -d postgres -c "DELETE FROM beers WHERE import_batch_id = 'BATCH_ID_HERE';"
docker exec supabase-db psql -U postgres -d postgres -c "DELETE FROM breweries WHERE import_batch_id = 'BATCH_ID_HERE';"
\`\`\`
```

### 3C: Create migration runbook

Create `runbooks/migration-phase-3.1.md` (same pattern as `runbooks/migration-phase-2.1.md`):

```markdown
# Phase 3.1 — Database Migration

## Run migration (one-time)
\`\`\`bash
docker exec -i supabase-db psql -U postgres -d postgres < apps/beerbook/docs/migration-3.1.sql
\`\`\`

## Verify
\`\`\`bash
docker exec supabase-db psql -U postgres -d postgres -c '\dt'
docker exec supabase-db psql -U postgres -d postgres -c '\d breweries'
docker exec supabase-db psql -U postgres -d postgres -c '\d beers'
docker exec supabase-db psql -U postgres -d postgres -c "SELECT * FROM pg_extension WHERE extname = 'pg_trgm';"
\`\`\`
```

**Success criteria for Workstream 3:**
- [ ] `apps/beerbook/docs/database-schema.sql` reflects full current state including catalog tables
- [ ] `runbooks/seed-catalog.md` exists with run + verify + rollback instructions
- [ ] `runbooks/migration-phase-3.1.md` exists with run + verify instructions

---

## Files Created / Modified

| Action | File | Description |
|--------|------|-------------|
| CREATE | `apps/beerbook/docs/migration-3.1.sql` | Idempotent migration — catalog tables, aliases, trigram indexes |
| CREATE | `scripts/package.json` | Dependencies for seed script |
| CREATE | `scripts/seed-catalog.js` | ETL script — Open Brewery DB + Open Beer DB + Punk API |
| MODIFY | `apps/beerbook/docs/database-schema.sql` | Canonical schema updated with catalog tables |
| CREATE | `runbooks/seed-catalog.md` | Seed execution + verify + rollback |
| CREATE | `runbooks/migration-phase-3.1.md` | Migration execution + verify |

## Constraints

- **Do NOT modify** `apps/beerbook-api/server.js` — API changes happen in Phase 3.2
- **Do NOT modify** any frontend files — UI changes happen in Phase 3.2
- **Do NOT modify** existing tables (ratings, venues, etc.) beyond adding `beer_id` column
- **Do NOT drop** any columns, tables, or views
- Existing data must remain intact after migration
- All DDL is idempotent (`IF NOT EXISTS`, `IF EXISTS`)
- Seed script must be re-runnable (use `ON CONFLICT DO NOTHING`)
- No new npm packages in `apps/beerbook-api/` — seed script has its own `scripts/package.json`

## What Comes Next (Phase 3.2 — not this phase)

- Catalog search API endpoints (trigram-powered autocomplete)
- User beer submission endpoint
- Wire `beer_id` into rating flow
- Update rating form with autocomplete against catalog
- Backfill existing ratings with `beer_id` where possible

## Agent Assumption Log

| Date | Task | Assumption | Rationale |
|------|------|------------|-----------|
| | 1B | Open Brewery DB API is available at documented URL; no API key needed | Verified: actively maintained, free, no auth |
| | 2C | Pagination uses page/per_page params with max 200 per page | Per Open Brewery DB v1 API docs |
| | 2D | Open Beer DB CSV is accessible via brewdega GitHub fork | Original repo (BJClark) may be stale; brewdega fork has cleaned data. Fallback to local file if both fail. Data is from ~2011. |
| | 2E | Original Punk API is dead (shut down May 2024); using community fork at punkapi-alxiw.amvera.io | Verified via search. Fork has 415 beers. Script handles gracefully if unavailable. |
| | 2E | punkapi-db npm package available as secondary fallback | Contains full data.json with all recipes |
| | 2B | Seed script connects to Postgres via Docker network, not exposed port | Security: don't expose DB port to host |
| | 1F | Adding nullable beer_id to ratings is safe; no backfill in this phase | Phase 3.2 handles backfill |