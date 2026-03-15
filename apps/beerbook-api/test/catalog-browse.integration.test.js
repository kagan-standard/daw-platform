/**
 * Catalog browse: per-beer review count and response shape.
 * Ensures GET /api/catalog/browse response items always have numeric review_count and reviews.count.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { mapCatalogBeer } = require('../lib/catalogMap');

function minimalRow(overrides = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Test Beer',
    brewery_name: 'Test Brewery',
    style: 'IPA',
    style_category: 'IPA',
    abv: 5.5,
    description: null,
    ibu_min: null,
    ibu_max: null,
    flavor_astringency: null,
    flavor_body: null,
    flavor_alcohol: null,
    flavor_bitter: null,
    flavor_sweet: null,
    flavor_sour: null,
    flavor_salty: null,
    flavor_fruity: null,
    flavor_hoppy: null,
    flavor_spicy: null,
    flavor_malty: null,
    review_aroma: null,
    review_appearance: null,
    review_palate: null,
    review_taste: null,
    review_overall: 4.2,
    review_count: 10,
    ...overrides,
  };
}

test('mapCatalogBeer: review_count and reviews.count are always numbers', () => {
  const mapped = mapCatalogBeer(minimalRow());
  assert.equal(typeof mapped.review_count, 'number');
  assert.equal(typeof mapped.reviews.count, 'number');
  assert.equal(mapped.review_count, mapped.reviews.count);
});

test('mapCatalogBeer: missing review_count becomes 0', () => {
  const row = minimalRow();
  delete row.review_count;
  const mapped = mapCatalogBeer(row);
  assert.equal(mapped.review_count, 0);
  assert.equal(mapped.reviews.count, 0);
});

test('mapCatalogBeer: null review_count becomes 0', () => {
  const mapped = mapCatalogBeer(minimalRow({ review_count: null }));
  assert.equal(mapped.review_count, 0);
  assert.equal(mapped.reviews.count, 0);
});

test('mapCatalogBeer: numeric review_count is preserved', () => {
  const mapped = mapCatalogBeer(minimalRow({ review_count: 42 }));
  assert.equal(mapped.review_count, 42);
  assert.equal(mapped.reviews.count, 42);
});

test('mapCatalogBeer: every item has both review_count and reviews.count for browse response shape', () => {
  const rows = [
    minimalRow({ review_count: 0 }),
    minimalRow({ review_count: 1 }),
    minimalRow({ review_count: 100 }),
    minimalRow(),
  ];
  rows.forEach((row) => {
    const item = mapCatalogBeer(row);
    assert.equal(typeof item.review_count, 'number', 'review_count must be number');
    assert.equal(typeof item.reviews.count, 'number', 'reviews.count must be number');
    assert.equal(item.review_count, item.reviews.count);
  });
});
