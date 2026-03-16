/**
 * Maps a raw beer row (from PostgREST/Supabase) to the catalog browse/detail shape.
 * Used by GET /api/catalog/browse and GET /api/catalog/beer/:id.
 */
function toNumberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapCatalogBeer(row) {
  const reviews = {
    aroma: toNumberOrNull(row.review_aroma),
    appearance: toNumberOrNull(row.review_appearance),
    palate: toNumberOrNull(row.review_palate),
    taste: toNumberOrNull(row.review_taste),
    overall: toNumberOrNull(row.review_overall),
    count: toNumberOrNull(row.review_count) ?? 0,
  };
  return {
    id: row.id,
    name: row.name,
    brewery_name: row.brewery_name ?? null,
    style: row.style ?? null,
    style_category: row.style_category ?? null,
    abv: toNumberOrNull(row.abv),
    description: row.description ?? null,
    ibu_min: toNumberOrNull(row.ibu_min),
    ibu_max: toNumberOrNull(row.ibu_max),
    flavors: {
      astringency: toNumberOrNull(row.flavor_astringency),
      body: toNumberOrNull(row.flavor_body),
      alcohol: toNumberOrNull(row.flavor_alcohol),
      bitter: toNumberOrNull(row.flavor_bitter),
      sweet: toNumberOrNull(row.flavor_sweet),
      sour: toNumberOrNull(row.flavor_sour),
      salty: toNumberOrNull(row.flavor_salty),
      fruits: toNumberOrNull(row.flavor_fruity),
      hoppy: toNumberOrNull(row.flavor_hoppy),
      spices: toNumberOrNull(row.flavor_spicy),
      malty: toNumberOrNull(row.flavor_malty),
    },
    reviews,
    // Backward-compat fields still used by existing frontend code paths.
    review_aroma: reviews.aroma,
    review_appearance: reviews.appearance,
    review_palate: reviews.palate,
    review_taste: reviews.taste,
    review_overall: reviews.overall ?? toNumberOrNull(row.review_overall),
    review_count: reviews.count,
    // Phase 5 discovery: Power Score (Elo) when available
    power_score: row.global_elo != null ? toNumberOrNull(row.global_elo) : null,
    comparison_count: row.comparison_count != null ? toNumberOrNull(row.comparison_count) : null,
  };
}

module.exports = { mapCatalogBeer };
