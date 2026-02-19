-- ============================================
-- Phase 3.1 — Beer Catalog: Schema (idempotent)
-- Run after backup. Enables pg_trgm, adds breweries, beers, aliases, flavor_descriptors, beer_id on ratings.
-- ============================================

-- 1A: Enable pg_trgm extension (for similarity + GIN trigram indexes)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1B: Create breweries table (global catalog)
CREATE TABLE IF NOT EXISTS breweries (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,

    -- Core identity
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    normalized_name TEXT,

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
    referral_url TEXT,

    -- Classification
    brewery_type TEXT,

    -- Media
    logo_url TEXT,
    description TEXT,

    -- Data provenance
    source TEXT NOT NULL DEFAULT 'user_submitted',
    source_id TEXT,
    import_batch_id TEXT,
    verified BOOLEAN DEFAULT FALSE,
    claimed BOOLEAN DEFAULT FALSE,

    -- Multi-tenant
    crew_id TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_breweries_slug ON breweries(slug);
CREATE INDEX IF NOT EXISTS idx_breweries_normalized_name ON breweries(normalized_name);
CREATE INDEX IF NOT EXISTS idx_breweries_name_trgm ON breweries USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_breweries_city_state ON breweries(state, city);
CREATE INDEX IF NOT EXISTS idx_breweries_geo ON breweries(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_breweries_source ON breweries(source);

GRANT SELECT ON breweries TO anon;

-- 1C: Create beers table (global catalog)
CREATE TABLE IF NOT EXISTS beers (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,

    -- Core identity
    name TEXT NOT NULL,
    slug TEXT,
    normalized_name TEXT,
    brewery_id TEXT REFERENCES breweries(id) ON DELETE SET NULL,
    brewery_name TEXT,

    -- Classification
    style TEXT,
    style_category TEXT,
    style_source TEXT DEFAULT 'inferred',

    -- Specs
    abv DECIMAL(4,2),
    ibu_min INTEGER,
    ibu_max INTEGER,
    srm INTEGER,

    -- Flavor profile (0-200 scores)
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

    -- Aggregate community reviews
    review_aroma DECIMAL(4,2),
    review_appearance DECIMAL(4,2),
    review_palate DECIMAL(4,2),
    review_taste DECIMAL(4,2),
    review_overall DECIMAL(4,2),
    review_count INTEGER DEFAULT 0,

    -- Details
    description TEXT,
    flavor_notes TEXT[],
    ingredients JSONB,
    food_pairings TEXT[],

    -- Media
    image_url TEXT,
    label_url TEXT,

    -- Data provenance
    source TEXT NOT NULL DEFAULT 'user_submitted',
    source_id TEXT,
    source_brewery_id TEXT,
    import_batch_id TEXT,
    verified BOOLEAN DEFAULT FALSE,
    submitted_by TEXT,

    -- Multi-tenant
    crew_id TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(brewery_id, normalized_name)
);

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

-- 1D: Create beer_styles lookup table
CREATE TABLE IF NOT EXISTS beer_styles (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    name TEXT NOT NULL UNIQUE,
    category TEXT,
    description TEXT,
    abv_min DECIMAL(4,2),
    abv_max DECIMAL(4,2),
    ibu_min INTEGER,
    ibu_max INTEGER
);

GRANT SELECT ON beer_styles TO anon;

-- 1E: Alias tables (dedup / name drift)
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

-- 1F: Flavor descriptors
CREATE TABLE IF NOT EXISTS flavor_descriptors (
    id SERIAL PRIMARY KEY,
    category TEXT NOT NULL,
    keyword TEXT NOT NULL,
    impact INTEGER DEFAULT 1,
    UNIQUE(category, keyword)
);

CREATE INDEX IF NOT EXISTS idx_descriptors_category ON flavor_descriptors(category);
GRANT SELECT ON flavor_descriptors TO anon;

-- 1G: Add beer_id to ratings (nullable; Phase 3.2 will backfill)
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS beer_id TEXT REFERENCES beers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ratings_beer_id ON ratings(beer_id);

-- 1H: Catalog search function (prefix + fuzzy)
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
        b.id::TEXT, b.name, b.brewery_name, b.style,
        b.abv, b.review_overall, b.review_count, b.source,
        greatest(
            similarity(b.name, search_term),
            similarity(b.brewery_name || ' ' || b.name, search_term)
        )::REAL AS similarity_score
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

GRANT EXECUTE ON FUNCTION search_beer_catalog(TEXT, INTEGER) TO anon;

-- 1I: Triggers
DROP TRIGGER IF EXISTS breweries_updated_at ON breweries;
CREATE TRIGGER breweries_updated_at BEFORE UPDATE ON breweries FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS beers_updated_at ON beers;
CREATE TRIGGER beers_updated_at BEFORE UPDATE ON beers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
