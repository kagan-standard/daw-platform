# Schema — Phase 3.1 Beer Catalog

Reference for Phase 3.1 catalog tables, search function, and ratings linkage.

**Catalog / reference (seed-loaded):** `breweries`, `beers`, `beer_styles`, `flavor_descriptors`  
**Aliases (dedup / name drift):** `brewery_aliases`, `beer_aliases`  
**User-generated / app:** `ratings` (existing; Phase 3.1 adds nullable `beer_id`)

---

## breweries

Global brewery catalog. Rows come from the seed pipeline and/or user submission.

| Column           | Type         | Purpose |
|------------------|--------------|---------|
| id               | TEXT PK      | UUID, default `uuid_generate_v4()::text` |
| name             | TEXT NOT NULL| Display name |
| slug             | TEXT UNIQUE  | URL-safe identifier |
| normalized_name  | TEXT         | For matching/dedup |
| street, city, state, postal_code, country | TEXT | Location |
| latitude, longitude | DECIMAL  | Geo |
| phone, website_url, referral_url | TEXT | Contact / web |
| brewery_type     | TEXT         | Classification |
| logo_url, description | TEXT   | Media / details |
| source           | TEXT NOT NULL| e.g. `user_submitted`, import source |
| source_id        | TEXT         | External ID |
| import_batch_id  | TEXT         | Batch from seed runbook (for rollback) |
| verified, claimed| BOOLEAN      | Trust / ownership |
| crew_id          | TEXT         | Multi-tenant |
| created_at, updated_at | TIMESTAMPTZ | Audit |

---

## beers

Global beer catalog. Linked to `breweries` when matched; many rows have only `brewery_name` (no `brewery_id`).

| Column       | Type    | Purpose |
|-------------|---------|---------|
| id          | TEXT PK | UUID |
| name        | TEXT NOT NULL | Display name |
| slug        | TEXT    | URL-safe |
| normalized_name | TEXT | Dedup / matching |
| brewery_id  | TEXT FK → breweries(id) ON DELETE SET NULL | Resolved brewery; nullable |
| brewery_name| TEXT    | Denormalized name (always set when known) |
| style, style_category, style_source | TEXT | Style; style_source e.g. `inferred` |
| abv         | DECIMAL(4,2) | ABV |
| ibu_min, ibu_max, srm | INTEGER / DECIMAL | Specs |
| flavor_*    | INTEGER | 0–200 flavor scores (astringency, body, alcohol, bitter, sweet, sour, salty, fruity, hoppy, spicy, malty) |
| review_aroma, review_appearance, review_palate, review_taste, review_overall | DECIMAL(4,2) | Aggregate community scores |
| review_count| INTEGER | Number of reviews |
| description | TEXT   | Long text |
| flavor_notes, food_pairings | TEXT[] | Notes / pairings |
| ingredients | JSONB  | Optional |
| image_url, label_url | TEXT | Media |
| source, source_id, source_brewery_id | TEXT | Provenance |
| import_batch_id | TEXT | Seed batch (rollback) |
| verified, submitted_by | BOOLEAN / TEXT | Trust / submitter |
| crew_id     | TEXT    | Multi-tenant |
| created_at, updated_at | TIMESTAMPTZ | Audit |

**Unique:** `(brewery_id, normalized_name)`.

---

## beer_styles

Lookup table for style metadata (BJCP-derived). **Populated by seed script, not migration.**

| Column     | Type    | Purpose |
|------------|---------|---------|
| id         | TEXT PK | UUID |
| name       | TEXT NOT NULL UNIQUE | Style name |
| category   | TEXT    | e.g. Lager, IPA |
| description| TEXT    | Optional |
| abv_min, abv_max | DECIMAL(4,2) | ABV range |
| ibu_min, ibu_max | INTEGER | IBU range |

---

## brewery_aliases

Alternative names for a brewery (dedup / name drift). **Reference/catalog.**

| Column         | Type    | Purpose |
|----------------|---------|---------|
| id             | TEXT PK | UUID |
| brewery_id     | TEXT NOT NULL FK → breweries(id) ON DELETE CASCADE |
| alias_name     | TEXT NOT NULL | Alternate name |
| normalized_alias | TEXT NOT NULL | For matching |
| source         | TEXT    | e.g. `import` |
| created_at     | TIMESTAMPTZ | Audit |

**Unique:** `(brewery_id, normalized_alias)`.

---

## beer_aliases

Alternative names for a beer. **Reference/catalog.**

| Column         | Type    | Purpose |
|----------------|---------|---------|
| id             | TEXT PK | UUID |
| beer_id        | TEXT NOT NULL FK → beers(id) ON DELETE CASCADE |
| alias_name     | TEXT NOT NULL | Alternate name |
| normalized_alias | TEXT NOT NULL | For matching |
| source         | TEXT    | e.g. `import` |
| created_at     | TIMESTAMPTZ | Audit |

**Unique:** `(beer_id, normalized_alias)`.

---

## flavor_descriptors

Category/keyword flavor tags with impact. **Populated by seed script, not migration.**

| Column   | Type    | Purpose |
|----------|---------|---------|
| id       | SERIAL PK | Surrogate key |
| category | TEXT NOT NULL | Descriptor category |
| keyword  | TEXT NOT NULL | Descriptor term |
| impact   | INTEGER | Default 1 |

**Unique:** `(category, keyword)`.

---

## ratings.beer_id (Phase 3.1)

`ratings` is an existing **user-generated** table. Phase 3.1 adds:

- **beer_id** — `TEXT`, nullable, FK to `beers(id) ON DELETE SET NULL`.

Used to link a rating to a catalog beer. Backfill (e.g. by name/brewery matching) is done in Phase 3.2; until then many rows will have `beer_id` NULL.

---

## search_beer_catalog

Fuzzy + prefix search over the beer catalog (uses `pg_trgm`).

**Signature:**

```sql
search_beer_catalog(search_term TEXT, max_results INTEGER DEFAULT 10)
```

**Returns:**

| Column          | Type   | Purpose |
|-----------------|--------|---------|
| id              | TEXT   | beers.id |
| name            | TEXT   | Beer name |
| brewery_name    | TEXT   | Denormalized brewery name |
| style           | TEXT   | Style |
| abv             | DECIMAL(4,2) | ABV |
| review_overall  | DECIMAL(4,2) | Aggregate overall score |
| review_count    | INTEGER | Number of reviews |
| source          | TEXT   | beers.source |
| similarity_score| REAL   | Trigram similarity (for ranking) |

**Usage example:**

```sql
SELECT id, name, brewery_name, style, review_overall, review_count
FROM search_beer_catalog('yuengling', 5);
```

Search matches on beer name (prefix and fuzzy), brewery name, and "brewery + name" combined. Results are ordered by prefix match first, then similarity, then review_count.
