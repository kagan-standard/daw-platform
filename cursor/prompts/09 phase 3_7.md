# Phase 3.1 — Beer Catalog: Schema, Pipeline & Seed Data

Apply `cursor/prompts/00_system.md` rules.

## Context Files (read before writing code)
- `ARCHITECTURE.md`
- `DECISIONS.md`
- `apps/beerbook/docs/database-schema.sql` (current canonical schema)
- `apps/beerbook-api/server.js` (current API — **read-only, do NOT modify**)
- `apps/beerbook-api/routes/beers.js` (current beer endpoints — **read-only**)
- `infra/compose/docker-compose.yml` (current compose)

## Goal

Add a global beer and brewery catalog to BeerBook — normalized, deduplicated, and seeded from **local data files** (no external API calls). The catalog becomes the backbone for autocomplete, beer discovery, beer detail pages, and future monetization (brewery referral links). **No API or frontend changes in this phase.** Schema + seed data only.

### Why no external APIs?

The old approach called Open Brewery DB, Open Beer DB, and Punk API at seed time. Problems:
- APIs go down (Punk API died May 2024)
- Rate limits slow seeding
- Network dependency on VPS
- Our local datasets are **far richer**: 1M+ reviews across 42K beers with ratings, ABV, styles

Instead, we have **5 local data files** that produce a bigger, richer catalog than any free API combo.

## Background

Currently, beer identity in BeerBook is free-text strings (`beer_name`, `brewery`) on the `ratings` table. This causes duplicates ("Sierra Nevada Pale Ale" vs "SN Pale Ale" vs "sierra nevada pale"), makes aggregation unreliable, and blocks features like autocomplete, brewery pages, and beer detail views.

This phase introduces proper `breweries` and `beers` catalog tables with identity/dedup strategy, alias tables for name drift, trigram indexes for fuzzy search, and a Python pipeline to deduplicate and load ~60-80K beers from local data. Existing ratings are **not migrated** to use `beer_id` yet — that happens in Phase 3.2.

---

## Data Sources (local files)

These files must be placed in `data/` before running the pipeline. **Add `data/*.xlsx` and `data/*.csv` to `.gitignore`** — these are large and shouldn't be committed. Document their location in the seed runbook.

| File | Rows | What it provides | Priority |
|------|------|------------------|----------|
| `full_beer_reviews.xlsx` | **1,048,575 reviews → 42,719 unique beers** | brewery_name, beer_name, beer_style, beer_abv, review_overall (1-5), beer_beerid, brewery_id. Must be aggregated per beer. **Primary source.** | 1 |
| `beer_profile_and_ratings.csv` | 3,197 beers | Name, Style, Brewery, Description, ABV, IBU range, 10 flavor descriptors (Astringency–Malty), 5 review dimension scores. **Only source with flavor profiles, descriptions, and IBU.** Enriches beers from source 1. | 2 (enrichment) |
| `beermanufacturersmicrobrewersbrands.csv` | 1,654 rows | Brewery → Beer Name mapping. Fills gaps. | 3 |
| `beer_list_simple.txt` | 45,253 names | One beer name per line (brewery+name combined, no metadata). Lowest priority. | 4 |
| `Beer_Name_Fuzzy_Match_List.csv` | 1,088 mappings | `Beer Name (Full)` → canonical match. For dedup. | — |
| `Brewery_Name_Fuzzy_Match_List.csv` | 87 mappings | `Brewery` → canonical match. For dedup. | — |
| `Beer_Descriptors_Simplified.xlsx` | 210 keywords | Flavor/aroma keyword → category (Fruity/Hoppy/Spices/Malty) with impact scores. | — |

### Known data issues to handle

1. **`full_beer_reviews.xlsx` is capped at 1,048,575 rows** — that's Excel's row limit minus header. The actual dataset is likely larger and got truncated. Note this as a known limitation in output stats.
2. **Encoding mojibake** — styles like `BiÃ¨re de Champagne` are UTF-8 bytes decoded as Latin-1. The pipeline must fix common patterns: `Ã©`→`é`, `Ã¨`→`è`, `Ã¶`→`ö`, `Ã¼`→`ü`, `Ã±`→`ñ`, `Ã¤`→`ä`.
3. **CSV escaping in profiles** — `beer_profile_and_ratings.csv` has descriptions with embedded double-quotes (`""alt""` style), commas inside quoted fields, and trailing `\t` characters. The CSV reader must handle RFC 4180 quoting properly.
4. **Empty vs None in CSV output** — When writing output CSVs, `None` values must be written as empty string (not the literal string `"None"`), because Postgres `COPY ... NULL ''` expects empty for NULL.

---

## Workstream 1: Database Migration

Create `apps/beerbook/docs/migration-3.1.sql` — a single, idempotent migration file.

**CRITICAL: Back up the database before running this migration.**
```bash
docker exec supabase-db pg_dump -U postgres -d postgres > /opt/backups/pre-phase-3.1-$(date +%Y%m%d%H%M%S).sql
```

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
    website_url TEXT,
    referral_url TEXT,                   -- tracked/affiliate link (future monetization)

    -- Classification
    brewery_type TEXT,                   -- micro, regional, brewpub, taproom, contract, large, closed

    -- Media
    logo_url TEXT,
    description TEXT,

    -- Data provenance
    source TEXT NOT NULL DEFAULT 'user_submitted',  -- full_reviews, profile, manufacturer, simple_list, user_submitted
    source_id TEXT,                                  -- original ID in source system
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
    style TEXT,                                      -- raw style string from source
    style_category TEXT,                             -- BJCP-derived (matches beer_styles.name)
    style_source TEXT DEFAULT 'inferred',            -- mapped, user, inferred

    -- Specs
    abv DECIMAL(4,2),
    ibu_min INTEGER,
    ibu_max INTEGER,
    srm INTEGER,                                     -- color scale (if available)

    -- Flavor profile (from beer_profile_and_ratings.csv — raw 0-200 scores)
    -- Only ~3,000 beers have these; NULL for the rest
    flavor_astringency INTEGER,
    flavor_body INTEGER,
    flavor_alcohol INTEGER,
    flavor_bitter INTEGER,
    flavor_sweet INTEGER,
    flavor_sour INTEGER,
    flavor_salty INTEGER,
    flavor_fruity INTEGER,
    flavor_hoppy INTEGER,
    flavor_spicy INTEGER,
    flavor_malty INTEGER,

    -- Aggregate community reviews (from datasets, NOT BeerBook user ratings)
    review_aroma DECIMAL(4,2),
    review_appearance DECIMAL(4,2),
    review_palate DECIMAL(4,2),
    review_taste DECIMAL(4,2),
    review_overall DECIMAL(4,2),
    review_count INTEGER DEFAULT 0,

    -- Details
    description TEXT,
    flavor_notes TEXT[],                             -- array: ['citrus', 'pine', 'mango']
    ingredients JSONB,                               -- { malts: [], hops: [], yeast: '' }
    food_pairings TEXT[],

    -- Media
    image_url TEXT,
    label_url TEXT,

    -- Data provenance
    source TEXT NOT NULL DEFAULT 'user_submitted',   -- full_reviews, profile, manufacturer, simple_list, user_submitted
    source_id TEXT,                                   -- external beer ID from dataset
    source_brewery_id TEXT,                           -- external brewery ID from dataset
    import_batch_id TEXT,
    verified BOOLEAN DEFAULT FALSE,
    submitted_by TEXT,                               -- user_id if user-submitted

    -- Multi-tenant
    crew_id TEXT,

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
CREATE INDEX IF NOT EXISTS idx_beers_review_overall ON beers(review_overall DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_beers_review_count ON beers(review_count DESC NULLS LAST);

GRANT SELECT ON beers TO anon;
```

### 1D: Create `beer_styles` lookup table

```sql
CREATE TABLE IF NOT EXISTS beer_styles (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    name TEXT NOT NULL UNIQUE,
    category TEXT,                       -- Ale, Lager, Sour/Wild, Hybrid, etc.
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
    normalized_alias TEXT NOT NULL,
    source TEXT DEFAULT 'import',
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

### 1F: Create `flavor_descriptors` table

```sql
CREATE TABLE IF NOT EXISTS flavor_descriptors (
    id SERIAL PRIMARY KEY,
    category TEXT NOT NULL,    -- 'fruity', 'hoppy', 'spices', 'malty'
    keyword TEXT NOT NULL,
    impact INTEGER DEFAULT 1,
    UNIQUE(category, keyword)
);

CREATE INDEX IF NOT EXISTS idx_descriptors_category ON flavor_descriptors(category);
GRANT SELECT ON flavor_descriptors TO anon;
```

### 1G: Add `beer_id` column to `ratings` (nullable, no enforcement yet)

```sql
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS beer_id TEXT REFERENCES beers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ratings_beer_id ON ratings(beer_id);
```

This column will be used in Phase 3.2 to link ratings to catalog beers. Existing ratings continue to work via `beer_name` strings.

### 1H: Catalog search function

```sql
-- Fast prefix + fuzzy search across beers catalog
-- GRANT EXECUTE is required for PostgREST /rpc/ exposure
CREATE OR REPLACE FUNCTION search_beer_catalog(
    search_term TEXT,
    max_results INTEGER DEFAULT 10
) RETURNS TABLE (
    id TEXT,
    name TEXT,
    brewery_name TEXT,
    style TEXT,
    abv DECIMAL(4,2),
    review_overall DECIMAL(4,2),
    review_count INTEGER,
    source TEXT,
    similarity_score REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        b.id, b.name, b.brewery_name, b.style,
        b.abv, b.review_overall, b.review_count, b.source,
        greatest(
            similarity(b.name, search_term),
            similarity(b.brewery_name || ' ' || b.name, search_term)
        ) AS similarity_score
    FROM beers b
    WHERE
        b.name ILIKE search_term || '%'
        OR (b.brewery_name || ' ' || b.name) ILIKE '%' || search_term || '%'
        OR b.brewery_name ILIKE search_term || '%'
        OR similarity(b.name, search_term) > 0.3
    ORDER BY
        CASE WHEN b.name ILIKE search_term || '%' THEN 0 ELSE 1 END,
        greatest(similarity(b.name, search_term), similarity(b.brewery_name || ' ' || b.name, search_term)) DESC,
        b.review_count DESC NULLS LAST
    LIMIT max_results;
END;
$$ LANGUAGE plpgsql STABLE;

-- CRITICAL: PostgREST needs EXECUTE grant to expose via /rpc/
GRANT EXECUTE ON FUNCTION search_beer_catalog(TEXT, INTEGER) TO anon;
```

### 1I: Triggers

```sql
DROP TRIGGER IF EXISTS breweries_updated_at ON breweries;
CREATE TRIGGER breweries_updated_at BEFORE UPDATE ON breweries FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS beers_updated_at ON beers;
CREATE TRIGGER beers_updated_at BEFORE UPDATE ON beers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 1J: Update canonical schema

After migration runs, update `apps/beerbook/docs/database-schema.sql` to reflect the full merged schema.

**Success criteria for Workstream 1:**
- [ ] Backup taken before migration
- [ ] Migration runs without error
- [ ] `\dt` shows new tables: `breweries`, `beers`, `beer_styles`, `brewery_aliases`, `beer_aliases`, `flavor_descriptors`
- [ ] `\d beers` shows all columns including flavor fields, composite unique constraint
- [ ] `\d ratings` shows new `beer_id` column
- [ ] `SELECT * FROM pg_extension WHERE extname = 'pg_trgm';` returns a row
- [ ] Existing data intact: `SELECT count(*) FROM ratings` unchanged
- [ ] Existing views still work: `SELECT * FROM beer_averages LIMIT 1;`

**STOP. Verify all criteria. Do not proceed to Workstream 2 until migration is confirmed.**

---

## Workstream 2: Python Data Pipeline

Create `scripts/build_beer_catalog.py` — a Python script that reads local data files, deduplicates, and outputs clean CSVs for loading into the catalog tables.

### 2A: Dependencies

Create `scripts/requirements.txt`:
```
openpyxl>=3.1.0
```

No pandas. No external API calls. Only `openpyxl` for reading xlsx files. Everything else is stdlib (`csv`, `re`, `collections`, `pathlib`).

### 2B: Utility functions

```python
import csv, re, sys
from pathlib import Path
from collections import defaultdict, Counter
import openpyxl

DATA_DIR = Path(__file__).parent.parent / "data"
OUT_DIR = Path(__file__).parent.parent / "data" / "output"
OUT_DIR.mkdir(exist_ok=True)

def slugify(name: str) -> str:
    """URL-safe slug: 'Sierra Nevada Brewing Co.' -> 'sierra-nevada-brewing-co'"""
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', name.lower())).strip('-')

def normalize_name(name: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace. For dedup matching."""
    if not name: return ""
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9\s]', '', name.lower())).strip()

def normalize_brewery(name: str) -> str:
    """Like normalize_name but also strips common suffixes."""
    if not name: return ""
    name = re.sub(r'\s+', ' ', name.strip().lower())
    for suffix in ['brewing company', 'brewing co.', 'brewing co', 'brewery',
                   'beer company', 'beer co.', 'beer co', 'brew co',
                   'breweries', 'brauerei', 'brasserie', 'brouwerij',
                   'llc', 'inc.', 'inc', 'ltd.', 'ltd', 'co.', 'gmbh',
                   'obergärige hausbrauerei gmbh']:
        name = re.sub(rf'\s*{re.escape(suffix)}\s*$', '', name, flags=re.IGNORECASE)
    return re.sub(r'[^a-z0-9\s]', '', name).strip()

def fix_mojibake(text: str) -> str:
    """Fix common UTF-8-as-Latin-1 encoding artifacts."""
    if not text: return text
    replacements = {
        'Ã©': 'é', 'Ã¨': 'è', 'Ã¶': 'ö', 'Ã¼': 'ü', 'Ã±': 'ñ',
        'Ã¤': 'ä', 'Ã³': 'ó', 'Ã¡': 'á', 'Ã­': 'í', 'Ã§': 'ç',
        'Ã¢': 'â', 'Ãª': 'ê', 'Ã®': 'î', 'Ã´': 'ô', 'Ã»': 'û',
        'Ã¨re': 'ère', 'BiÃ¨re': 'Bière',
    }
    for bad, good in replacements.items():
        text = text.replace(bad, good)
    return text

def safe_float(v):
    try: return round(float(v), 2) if v is not None and str(v).strip() != '' else None
    except: return None

def safe_int(v):
    try: return int(float(v)) if v is not None and str(v).strip() != '' else None
    except: return None

def csv_val(v):
    """Convert Python value to CSV-safe string. None -> empty string (not 'None')."""
    if v is None: return ''
    if isinstance(v, float): return str(v)
    return str(v)
```

### 2C: Load fuzzy match mappings

```python
def load_beer_fuzzy_map() -> dict:
    mapping = {}
    with open(DATA_DIR / "Beer_Name_Fuzzy_Match_List.csv", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            key = normalize_name(row["Beer Name (Full)"])
            mapping[key] = row["matches"].strip()
    return mapping

def load_brewery_fuzzy_map() -> dict:
    mapping = {}
    with open(DATA_DIR / "Brewery_Name_Fuzzy_Match_List.csv", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            key = normalize_brewery(row["Brewery"])
            mapping[key] = row["matches"].strip()
    return mapping
```

### 2D: Load descriptor keywords

```python
def load_descriptors() -> dict:
    wb = openpyxl.load_workbook(DATA_DIR / "Beer_Descriptors_Simplified.xlsx", read_only=True)
    ws = wb.active
    descriptors = {"fruity": {}, "hoppy": {}, "spices": {}, "malty": {}}
    cats = ["fruity", "hoppy", "spices", "malty"]
    for row in ws.iter_rows(min_row=2, values_only=True):
        for i, cat in enumerate(cats):
            keyword = row[i * 2]
            impact = row[i * 2 + 1]
            if keyword:
                descriptors[cat][keyword.strip().lower()] = int(impact or 1)
    wb.close()
    return descriptors
```

### 2E: PRIMARY — Ingest full_beer_reviews.xlsx (42K beers from 1M+ reviews)

```python
def ingest_full_reviews(brewery_fuzzy: dict) -> tuple[dict, dict]:
    """
    Read full_beer_reviews.xlsx (1M+ rows), aggregate per beer_beerid.
    Returns (beers_dict, breweries_dict) keyed by dedup keys.
    
    Columns: brewery_id, brewery_name, review_overall, beer_style, beer_name, beer_abv, beer_beerid
    """
    print("  Reading full_beer_reviews.xlsx (expect 30-60 seconds)...")
    wb = openpyxl.load_workbook(DATA_DIR / "full_beer_reviews.xlsx", read_only=True)
    ws = wb.active

    # Aggregate reviews per beer_beerid
    agg = defaultdict(lambda: {
        'name': '', 'brewery': '', 'brewery_id': None,
        'style': '', 'abv': None, 'beer_id': None, 'ratings': []
    })

    row_count = 0
    for row in ws.iter_rows(min_row=2, values_only=True):
        row_count += 1
        beer_id = row[6]   # beer_beerid
        if not beer_id: continue

        b = agg[beer_id]
        b['beer_id'] = beer_id
        b['name'] = fix_mojibake(str(row[4] or b['name']))
        b['brewery'] = fix_mojibake(str(row[1] or b['brewery']))
        b['brewery_id'] = row[0] or b['brewery_id']
        b['style'] = fix_mojibake(str(row[3] or b['style']))
        if row[5] is not None: b['abv'] = row[5]
        if row[2] is not None: b['ratings'].append(float(row[2]))

    wb.close()
    print(f"  Processed {row_count} review rows -> {len(agg)} unique beers")
    if row_count >= 1048575:
        print(f"  WARNING: Hit Excel row limit (1,048,575). Dataset may be truncated.")

    # Build breweries dict and beers dict
    breweries = {}  # {normalized_brewery: brewery_record}
    beers = {}      # {dedup_key: beer_record}

    for beer_id, b in agg.items():
        beer_name = (b['name'] or '').strip()
        brewery_raw = (b['brewery'] or '').strip()
        if not beer_name: continue

        # Resolve brewery
        norm_brew = normalize_brewery(brewery_raw)
        canonical_brewery = brewery_fuzzy.get(norm_brew, brewery_raw)
        brew_key = normalize_brewery(canonical_brewery)

        if brew_key and brew_key not in breweries:
            breweries[brew_key] = {
                "name": canonical_brewery,
                "slug": slugify(canonical_brewery),
                "normalized_name": brew_key,
                "source": "full_reviews",
                "source_id": str(b['brewery_id']) if b['brewery_id'] else None,
            }

        # Aggregate stats
        ratings = b['ratings']
        avg_overall = round(sum(ratings) / len(ratings), 2) if ratings else None

        style_raw = fix_mojibake((b['style'] or '').strip()) or None
        beer_dedup = f"{brew_key} {normalize_name(beer_name)}"

        beers[beer_dedup] = {
            "name": beer_name,
            "slug": slugify(f"{canonical_brewery} {beer_name}"),
            "normalized_name": normalize_name(beer_name),
            "brewery_key": brew_key,
            "brewery_name": canonical_brewery,
            "style": style_raw,
            "style_category": map_style_to_bjcp(style_raw),
            "abv": safe_float(b['abv']),
            "description": None,
            "ibu_min": None, "ibu_max": None,
            # Flavor fields — not in this source
            "flavor_astringency": None, "flavor_body": None,
            "flavor_alcohol": None, "flavor_bitter": None,
            "flavor_sweet": None, "flavor_sour": None,
            "flavor_salty": None, "flavor_fruity": None,
            "flavor_hoppy": None, "flavor_spicy": None,
            "flavor_malty": None,
            # Review aggregates
            "review_aroma": None, "review_appearance": None,
            "review_palate": None, "review_taste": None,
            "review_overall": avg_overall,
            "review_count": len(ratings),
            "source": "full_reviews",
            "source_id": str(beer_id),
            "source_brewery_id": str(b['brewery_id']) if b['brewery_id'] else None,
        }

    return beers, breweries
```

### 2F: ENRICHMENT — Merge beer_profile_and_ratings.csv

Only ~3,197 beers but the **sole source of flavor profiles, descriptions, IBU, and review dimensions**.

```python
def merge_profiles(beers: dict, breweries: dict, beer_fuzzy: dict, brewery_fuzzy: dict):
    """
    Merge into existing beers dict. If match found, enrich with flavor/description/IBU.
    If no match, add as new beer.
    """
    enriched = 0
    added = 0

    with open(DATA_DIR / "beer_profile_and_ratings.csv", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            beer_name = row["Name"].strip()
            brewery_raw = row["Brewery"].strip()
            style = row["Style"].strip()

            norm_brew = normalize_brewery(brewery_raw)
            canonical_brewery = brewery_fuzzy.get(norm_brew, brewery_raw)
            brew_key = normalize_brewery(canonical_brewery)
            beer_dedup = f"{brew_key} {normalize_name(beer_name)}"

            # Ensure brewery exists
            if brew_key and brew_key not in breweries:
                breweries[brew_key] = {
                    "name": canonical_brewery,
                    "slug": slugify(canonical_brewery),
                    "normalized_name": brew_key,
                    "source": "profile",
                    "source_id": None,
                }

            # Fields only this source has
            description_raw = (row.get("Description") or "").strip()
            # Clean description: remove "Notes:" prefix and trailing \t
            description = re.sub(r'^Notes:\s*', '', description_raw).rstrip('\t').strip() or None

            enrichment = {
                "description": description,
                "ibu_min": safe_int(row.get("Min IBU")),
                "ibu_max": safe_int(row.get("Max IBU")),
                "flavor_astringency": safe_int(row.get("Astringency")),
                "flavor_body": safe_int(row.get("Body")),
                "flavor_alcohol": safe_int(row.get("Alcohol")),
                "flavor_bitter": safe_int(row.get("Bitter")),
                "flavor_sweet": safe_int(row.get("Sweet")),
                "flavor_sour": safe_int(row.get("Sour")),
                "flavor_salty": safe_int(row.get("Salty")),
                "flavor_fruity": safe_int(row.get("Fruits")),
                "flavor_hoppy": safe_int(row.get("Hoppy")),
                "flavor_spicy": safe_int(row.get("Spices")),
                "flavor_malty": safe_int(row.get("Malty")),
                "review_aroma": safe_float(row.get("review_aroma")),
                "review_appearance": safe_float(row.get("review_appearance")),
                "review_palate": safe_float(row.get("review_palate")),
                "review_taste": safe_float(row.get("review_taste")),
            }

            if beer_dedup in beers:
                existing = beers[beer_dedup]
                for key, val in enrichment.items():
                    if val is not None and existing.get(key) is None:
                        existing[key] = val
                if style and not existing.get("style"):
                    existing["style"] = style
                    existing["style_category"] = map_style_to_bjcp(style)
                if safe_float(row.get("ABV")) and not existing.get("abv"):
                    existing["abv"] = safe_float(row.get("ABV"))
                enriched += 1
            else:
                beers[beer_dedup] = {
                    "name": beer_name,
                    "slug": slugify(f"{canonical_brewery} {beer_name}"),
                    "normalized_name": normalize_name(beer_name),
                    "brewery_key": brew_key,
                    "brewery_name": canonical_brewery,
                    "style": style or None,
                    "style_category": map_style_to_bjcp(style),
                    "abv": safe_float(row.get("ABV")),
                    "source": "profile",
                    "source_id": None,
                    "source_brewery_id": None,
                    "review_overall": safe_float(row.get("review_overall")),
                    "review_count": safe_int(row.get("number_of_reviews")),
                    **enrichment,
                }
                added += 1

    print(f"  Profiles: enriched {enriched} existing beers, added {added} new")
```

### 2G: Tertiary — manufacturers + simple list

```python
def ingest_manufacturers(beers: dict, breweries: dict, brewery_fuzzy: dict):
    added = 0
    with open(DATA_DIR / "beermanufacturersmicrobrewersbrands.csv", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            brewery_raw = row["Brewery"].strip()
            beer_name = row["Beer Name"].strip()
            if not beer_name: continue
            norm_brew = normalize_brewery(brewery_raw)
            canonical_brewery = brewery_fuzzy.get(norm_brew, brewery_raw)
            brew_key = normalize_brewery(canonical_brewery)
            beer_dedup = f"{brew_key} {normalize_name(beer_name)}"

            if brew_key and brew_key not in breweries:
                breweries[brew_key] = {
                    "name": canonical_brewery, "slug": slugify(canonical_brewery),
                    "normalized_name": brew_key, "source": "manufacturer", "source_id": None,
                }
            if beer_dedup not in beers:
                beers[beer_dedup] = make_empty_beer(beer_name, brew_key, canonical_brewery, "manufacturer")
                added += 1
    print(f"  Manufacturers: +{added} new beers")

def ingest_simple_list(beers: dict, breweries: dict, brewery_fuzzy: dict):
    added = 0
    known = sorted(
        set(b["name"] for b in breweries.values()),
        key=len, reverse=True
    )
    with open(DATA_DIR / "beer_list_simple.txt", encoding="utf-8") as f:
        for line in f:
            name = line.strip()
            if not name: continue
            dedup_key = normalize_name(name)
            if dedup_key in beers: continue

            brewery, beer = try_extract_brewery(name, known)
            brew_key = normalize_brewery(brewery) if brewery else ""
            beers[dedup_key] = make_empty_beer(
                beer or name, brew_key, brewery or "", "simple_list",
                style=infer_style_from_name(name), full_name=name,
            )
            added += 1
    print(f"  Simple list: +{added} new beers")
```

### 2H: Style mapping (BJCP-derived)

Implement the full `map_style_to_bjcp()` function using the same mapping table from the old prompt (IPA family, Stout family, Porter family, Sour/Wild, Belgian, Wheat, Lager, Bock, Hybrid, Pale Ale, Amber/Red, Brown Ale, Strong Ale, Barleywine, non-beer). This is the same function from the uploaded `09_phase_3_7.md` — copy it exactly, including all the `if s.includes(...)` patterns, translated to Python `if ... in s:` patterns.

Also implement `infer_style_from_name()` for name-only beers (simple regex patterns like `\bIPA\b` → 'American IPA', `\bStout\b` → 'Irish Stout', etc.)

### 2I: BJCP styles seed data

The pipeline should also write `data/output/beer_styles.csv` with the full BJCP-derived style list (~87 styles). Use the complete list from the uploaded `09_phase_3_7.md` section 2G, converted to CSV rows with columns: `name, category, description, abv_min, abv_max, ibu_min, ibu_max`.

### 2J: Helper functions

```python
def make_empty_beer(beer_name, brew_key, brewery_name, source, style=None, full_name=None):
    return {
        "name": beer_name,
        "slug": slugify(f"{brewery_name} {beer_name}" if brewery_name else beer_name),
        "normalized_name": normalize_name(beer_name),
        "brewery_key": brew_key,
        "brewery_name": brewery_name,
        "style": style, "style_category": map_style_to_bjcp(style) if style else None,
        "abv": None, "description": None, "ibu_min": None, "ibu_max": None,
        "flavor_astringency": None, "flavor_body": None, "flavor_alcohol": None,
        "flavor_bitter": None, "flavor_sweet": None, "flavor_sour": None,
        "flavor_salty": None, "flavor_fruity": None, "flavor_hoppy": None,
        "flavor_spicy": None, "flavor_malty": None,
        "review_aroma": None, "review_appearance": None, "review_palate": None,
        "review_taste": None, "review_overall": None, "review_count": None,
        "source": source, "source_id": None, "source_brewery_id": None,
    }

def try_extract_brewery(full_name: str, known_breweries: list) -> tuple:
    lower = full_name.lower()
    for brewery in known_breweries:
        if lower.startswith(brewery.lower()) and len(brewery) > 3:
            remainder = full_name[len(brewery):].strip()
            if remainder: return brewery, remainder
    return None, full_name
```

### 2K: Output writers

Write 4 CSV files to `data/output/`:

1. **`breweries.csv`** — columns: `name, slug, normalized_name, source, source_id`
2. **`beers.csv`** — columns: `name, slug, normalized_name, brewery_normalized_name, brewery_name, style, style_category, abv, ibu_min, ibu_max, flavor_astringency, flavor_body, flavor_alcohol, flavor_bitter, flavor_sweet, flavor_sour, flavor_salty, flavor_fruity, flavor_hoppy, flavor_spicy, flavor_malty, review_aroma, review_appearance, review_palate, review_taste, review_overall, review_count, description, source, source_id, source_brewery_id`
3. **`beer_styles.csv`** — columns: `name, category, description, abv_min, abv_max, ibu_min, ibu_max`
4. **`flavor_descriptors.csv`** — columns: `category, keyword, impact`

**CRITICAL:** Use `csv_val()` helper so `None` → empty string, not the literal `"None"`. Verify by spot-checking:
```bash
grep -c "None" data/output/beers.csv  # Should be 0
```

### 2L: Main pipeline + stats

```python
def main():
    print("=" * 50)
    print("Beer Catalog Pipeline")
    print("=" * 50)

    # ... load maps, load descriptors, ingest each source in order ...
    # ... write all output CSVs ...

    # Final stats
    print(f"\n{'=' * 50}")
    print(f"FINAL STATS")
    print(f"{'=' * 50}")
    print(f"Breweries:         {len(breweries)}")
    print(f"Beers:             {len(beers)}")
    print(f"  with ABV:        {sum(1 for b in beers.values() if b['abv'])}")
    print(f"  with style:      {sum(1 for b in beers.values() if b['style'])}")
    print(f"  with reviews:    {sum(1 for b in beers.values() if b.get('review_count') and b['review_count'] > 0)}")
    print(f"  with flavors:    {sum(1 for b in beers.values() if b.get('flavor_hoppy') is not None)}")
    print(f"  with description:{sum(1 for b in beers.values() if b.get('description'))}")
    print(f"Styles:            {len(BJCP_STYLES)}")
    print(f"Descriptors:       {sum(len(v) for v in descriptors.values())}")
    print(f"\nBy source:")
    for src, cnt in Counter(b['source'] for b in beers.values()).most_common():
        print(f"  {src}: {cnt}")
```

### 2M: Run instructions

```bash
# From repo root
pip install -r scripts/requirements.txt
python scripts/build_beer_catalog.py

# Expect ~60s for xlsx read, rest is fast
# Outputs in data/output/:
#   breweries.csv          — unique breweries (~4-5K)
#   beers.csv              — all beers (~60-80K)
#   beer_styles.csv        — BJCP styles (~87)
#   flavor_descriptors.csv — keyword mappings
```

**Success criteria for Workstream 2:**
- [ ] Script runs without errors
- [ ] `grep -c "None" data/output/beers.csv` returns 0
- [ ] No duplicate normalized names in breweries: `cut -d',' -f3 data/output/breweries.csv | sort | uniq -d | wc -l` = 0 (header excluded)
- [ ] All ~42K beers from full_reviews present
- [ ] ~2,000-3,000 beers enriched with flavor profiles from profiles CSV
- [ ] beer_styles.csv has 80+ rows
- [ ] Spot check: Sierra Nevada Pale Ale has ABV, style, description, and flavor data

**STOP. Verify. Commit pipeline and output CSVs.**

---

## Workstream 3: Data Loading

Create `scripts/load_catalog_to_db.sh` — loads CSVs into Postgres.

**This script handles the brewery→beer FK relationship by:**
1. Loading breweries first
2. Then loading beers with a JOIN to resolve `brewery_id` from `brewery_normalized_name`

```bash
#!/bin/bash
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
DATA_DIR="data/output"
BATCH_ID="seed_$(date +%Y%m%d%H%M%S)"

echo "=== Loading Beer Catalog (batch: $BATCH_ID) ==="

# 0. Backup
echo "0. Backing up database..."
docker exec "$DB_CONTAINER" pg_dump -U postgres -d postgres > "/opt/backups/pre-catalog-load-$(date +%Y%m%d%H%M%S).sql"

# 1. Load beer_styles
echo "1. Loading beer_styles..."
docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -c "
    COPY beer_styles(name, category, description, abv_min, abv_max, ibu_min, ibu_max)
    FROM STDIN WITH (FORMAT csv, HEADER true, NULL '');
" < "$DATA_DIR/beer_styles.csv"

# 2. Load breweries into temp table, then insert with batch_id
echo "2. Loading breweries..."
docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres <<SQL
    CREATE TEMP TABLE tmp_breweries (
        name TEXT, slug TEXT, normalized_name TEXT, source TEXT, source_id TEXT
    );
    COPY tmp_breweries FROM STDIN WITH (FORMAT csv, HEADER true, NULL '');

    INSERT INTO breweries (name, slug, normalized_name, source, source_id, import_batch_id)
    SELECT name, slug, normalized_name, source, source_id, '$BATCH_ID'
    FROM tmp_breweries
    ON CONFLICT (slug) DO NOTHING;

    DROP TABLE tmp_breweries;
SQL
# (pipe the CSV via stdin between the heredoc COPY and the rest)

# 3. Load beers via temp table with brewery FK resolution
echo "3. Loading beers (this is the big one)..."
# Load beers CSV into temp, then INSERT with brewery_id JOIN
docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres <<'OUTER'
    CREATE TEMP TABLE tmp_beers (
        name TEXT, slug TEXT, normalized_name TEXT,
        brewery_normalized_name TEXT, brewery_name TEXT,
        style TEXT, style_category TEXT,
        abv DECIMAL, ibu_min INTEGER, ibu_max INTEGER,
        flavor_astringency INTEGER, flavor_body INTEGER, flavor_alcohol INTEGER,
        flavor_bitter INTEGER, flavor_sweet INTEGER, flavor_sour INTEGER,
        flavor_salty INTEGER, flavor_fruity INTEGER, flavor_hoppy INTEGER,
        flavor_spicy INTEGER, flavor_malty INTEGER,
        review_aroma DECIMAL, review_appearance DECIMAL,
        review_palate DECIMAL, review_taste DECIMAL,
        review_overall DECIMAL, review_count INTEGER,
        description TEXT, source TEXT, source_id TEXT, source_brewery_id TEXT
    );
OUTER

# Pipe the CSV
docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -c "
    COPY tmp_beers FROM STDIN WITH (FORMAT csv, HEADER true, NULL '');
" < "$DATA_DIR/beers.csv"

# Insert with FK resolution
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -c "
    INSERT INTO beers (
        name, slug, normalized_name, brewery_id, brewery_name,
        style, style_category, abv, ibu_min, ibu_max,
        flavor_astringency, flavor_body, flavor_alcohol,
        flavor_bitter, flavor_sweet, flavor_sour, flavor_salty,
        flavor_fruity, flavor_hoppy, flavor_spicy, flavor_malty,
        review_aroma, review_appearance, review_palate, review_taste,
        review_overall, review_count, description,
        source, source_id, source_brewery_id, import_batch_id
    )
    SELECT
        t.name, t.slug, t.normalized_name,
        br.id, t.brewery_name,
        t.style, t.style_category, t.abv, t.ibu_min, t.ibu_max,
        t.flavor_astringency, t.flavor_body, t.flavor_alcohol,
        t.flavor_bitter, t.flavor_sweet, t.flavor_sour, t.flavor_salty,
        t.flavor_fruity, t.flavor_hoppy, t.flavor_spicy, t.flavor_malty,
        t.review_aroma, t.review_appearance, t.review_palate, t.review_taste,
        t.review_overall, t.review_count, t.description,
        t.source, t.source_id, t.source_brewery_id, '$BATCH_ID'
    FROM tmp_beers t
    LEFT JOIN breweries br ON br.normalized_name = t.brewery_normalized_name
    ON CONFLICT (brewery_id, normalized_name) DO NOTHING;

    DROP TABLE tmp_beers;
"

# 4. Load flavor_descriptors
echo "4. Loading flavor_descriptors..."
docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -c "
    COPY flavor_descriptors(category, keyword, impact)
    FROM STDIN WITH (FORMAT csv, HEADER true, NULL '');
" < "$DATA_DIR/flavor_descriptors.csv"

# 5. Analyze
echo "5. Running ANALYZE..."
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -c "
    ANALYZE breweries; ANALYZE beers; ANALYZE beer_styles; ANALYZE flavor_descriptors;
"

# 6. Verify
echo ""
echo "=== Verification ==="
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -c "
    SELECT 'breweries' as tbl, count(*) FROM breweries
    UNION ALL SELECT 'beers', count(*) FROM beers
    UNION ALL SELECT 'beer_styles', count(*) FROM beer_styles
    UNION ALL SELECT 'flavor_descriptors', count(*) FROM flavor_descriptors
    UNION ALL SELECT 'beers_with_reviews', count(*) FROM beers WHERE review_count > 0
    UNION ALL SELECT 'beers_with_flavors', count(*) FROM beers WHERE flavor_hoppy IS NOT NULL
    UNION ALL SELECT 'beers_with_description', count(*) FROM beers WHERE description IS NOT NULL
    ORDER BY tbl;
"

echo ""
echo "=== Search function test ==="
docker exec "$DB_CONTAINER" psql -U postgres -d postgres -c "
    SELECT name, brewery_name, style, review_overall, review_count
    FROM search_beer_catalog('yuengling', 5);
"

echo ""
echo "Batch ID: $BATCH_ID"
echo "To rollback: DELETE FROM beers WHERE import_batch_id = '$BATCH_ID'; DELETE FROM breweries WHERE import_batch_id = '$BATCH_ID';"
echo "Done!"
```

**Note:** The heredoc + COPY piping is tricky. If the shell approach doesn't work cleanly, split into sequential `docker exec` calls — one for temp table creation, one for COPY from stdin, one for INSERT...SELECT. Prioritize correctness over elegance.

**Success criteria for Workstream 3:**
- [ ] `SELECT count(*) FROM breweries;` returns 3,000+ rows
- [ ] `SELECT count(*) FROM beers;` returns 40,000+ rows
- [ ] `SELECT count(*) FROM beer_styles;` returns 80+ rows
- [ ] `search_beer_catalog('yuengling', 5)` returns results
- [ ] `search_beer_catalog('sierra nevada pale', 5)` returns results with review data
- [ ] No duplicate beers: `SELECT brewery_id, normalized_name, count(*) FROM beers GROUP BY brewery_id, normalized_name HAVING count(*) > 1;` returns 0
- [ ] Existing tables unaffected: `SELECT count(*) FROM ratings` unchanged
- [ ] Rollback command printed and documented

---

## Workstream 4: Documentation

### 4A: Update canonical schema

Update `apps/beerbook/docs/database-schema.sql` to include all new tables merged with existing schema.

### 4B: Create seed runbook

Create `runbooks/seed-catalog.md` with run + verify + rollback instructions.

### 4C: Create migration runbook

Create `runbooks/migration-phase-3.1.md` following the pattern from `runbooks/migration-phase-2.1.md`.

### 4D: Update .gitignore

Add to repo root `.gitignore`:
```
# Large data files (not committed, placed manually)
data/*.xlsx
data/*.csv
data/*.txt
data/output/
```

**Success criteria for Workstream 4:**
- [ ] Canonical schema updated
- [ ] Runbooks exist with run + verify + rollback
- [ ] `.gitignore` updated
- [ ] Data file placement documented in seed runbook

---

## Files Created / Modified

| Action | File | Description |
|--------|------|-------------|
| CREATE | `apps/beerbook/docs/migration-3.1.sql` | Idempotent migration — catalog tables, aliases, trigram indexes, search function |
| CREATE | `scripts/requirements.txt` | Python dependencies (openpyxl) |
| CREATE | `scripts/build_beer_catalog.py` | Python pipeline — dedup + CSV generation |
| CREATE | `scripts/load_catalog_to_db.sh` | Shell script — load CSVs into Postgres |
| MODIFY | `apps/beerbook/docs/database-schema.sql` | Canonical schema updated |
| CREATE | `runbooks/seed-catalog.md` | Seed execution + verify + rollback |
| CREATE | `runbooks/migration-phase-3.1.md` | Migration execution + verify |
| MODIFY | `.gitignore` | Exclude data files |

## Constraints

- **Do NOT modify** `apps/beerbook-api/server.js` — API changes happen in Phase 3.2
- **Do NOT modify** any frontend files
- **Do NOT modify** existing tables (ratings, venues, etc.) beyond adding `beer_id` column
- **Do NOT drop** any columns, tables, or views
- **No external API calls** — all data from local files
- Python 3.10+ for pipeline, no pandas, only openpyxl
- All DDL is idempotent (`IF NOT EXISTS`, `IF EXISTS`)
- Pipeline must be idempotent (running twice produces identical output)
- Load script uses `ON CONFLICT DO NOTHING` for re-runnability
- `GRANT EXECUTE ON FUNCTION` required for PostgREST RPC exposure
- Backup before migration AND before data load

## What Comes Next (Phase 3.2 — not this phase)

- Catalog search API endpoints (expose `search_beer_catalog` via `/api/beers/search`)
- Style list, catalog browse, and beer detail API endpoints
- Wire `beer_id` into rating flow
- Update rating form with catalog-backed autocomplete
- Backfill existing ratings with `beer_id` where possible
- Beer detail view with flavor profiles and community reviews
- "Discover" browse page

## Agent Assumption Log

| Date | Task | Assumption | Rationale |
|------|------|------------|-----------|
| | 2E | full_beer_reviews.xlsx may be truncated at Excel row limit | 1,048,575 data rows = Excel max. Log warning. |
| | 2F | beer_profile_and_ratings.csv has RFC 4180 quoting | Python csv module handles this natively |
| | 2E | Encoding mojibake exists in style names | Observed: `BiÃ¨re de Champagne`. Fix with replacement table. |
| | 1H | PostgREST requires GRANT EXECUTE for RPC functions | Without it, /rpc/search_beer_catalog returns 404 |
| | 3 | Brewery→beer FK resolution via normalized_name JOIN | Temp table approach avoids needing brewery IDs in the CSV |
| | 1G | Adding nullable beer_id to ratings is safe | No backfill in this phase; Phase 3.2 handles it |