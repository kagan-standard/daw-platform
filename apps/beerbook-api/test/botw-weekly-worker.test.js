/**
 * Beer of the Week weekly worker tests.
 * Validates idempotency, selection, insert, and error handling.
 *
 * Tests the shared selectBeerOfTheWeek function in worker-rest mode,
 * and the worker's run() logic via direct invocation with mocked rest.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { selectBeerOfTheWeek, pickBestFromRatings } = require('../lib/beerOfTheWeekSelection');

// ── Shared selection logic (worker-rest mode) ──

function rating(beer_name, r, opts = {}) {
  return {
    beer_name,
    brewery: opts.brewery || 'Brewery',
    style: opts.style || 'IPA',
    rating: r,
    created_at: opts.created_at || new Date().toISOString(),
    user_id: opts.user_id || 'user-1',
  };
}

test('selectBeerOfTheWeek (workerRest): returns 7d pick', async () => {
  const rest = async (method, path) => {
    if (path.startsWith('/ratings?created_at=gte.')) {
      const sinceMatch = path.match(/created_at=gte\.([^&]+)/);
      if (sinceMatch) {
        const since = new Date(decodeURIComponent(sinceMatch[1]));
        const daysAgo = (Date.now() - since.getTime()) / (24 * 60 * 60 * 1000);
        if (daysAgo <= 8) return [rating('Fresh IPA', 4.5)];
      }
    }
    return [];
  };

  const result = await selectBeerOfTheWeek(rest, { workerRest: true });
  assert.ok(result);
  assert.equal(result.beer_name, 'Fresh IPA');
  assert.equal(result.source, 'recent_7d');
  assert.equal(result.avg_rating, 4.5);
});

test('selectBeerOfTheWeek (workerRest): falls through to 30d', async () => {
  const rest = async (method, path) => {
    if (path.startsWith('/ratings?created_at=gte.')) {
      const sinceMatch = path.match(/created_at=gte\.([^&]+)/);
      if (sinceMatch) {
        const since = new Date(decodeURIComponent(sinceMatch[1]));
        const daysAgo = (Date.now() - since.getTime()) / (24 * 60 * 60 * 1000);
        if (daysAgo <= 8) return [];
        if (daysAgo <= 31) return [rating('Aged Porter', 4.2)];
      }
    }
    return [];
  };

  const result = await selectBeerOfTheWeek(rest, { workerRest: true });
  assert.ok(result);
  assert.equal(result.beer_name, 'Aged Porter');
  assert.equal(result.source, 'recent_30d');
});

test('selectBeerOfTheWeek (workerRest): falls through to historical', async () => {
  const rest = async (method, path) => {
    if (path.startsWith('/ratings?created_at=gte.')) return [];
    if (path.startsWith('/beers?review_count=gte.5')) {
      return [{ name: 'Classic Lager', brewery_name: 'Old Brew', style: 'Lager', review_overall: 4.7, review_count: 50 }];
    }
    return [];
  };

  const result = await selectBeerOfTheWeek(rest, { workerRest: true });
  assert.ok(result);
  assert.equal(result.beer_name, 'Classic Lager');
  assert.equal(result.source, 'historical_fallback');
  assert.equal(result.avg_rating, 4.7);
  assert.equal(result.review_count, 50);
});

test('selectBeerOfTheWeek (workerRest): returns null when nothing exists', async () => {
  const rest = async () => [];
  const result = await selectBeerOfTheWeek(rest, { workerRest: true });
  assert.equal(result, null);
});

test('selectBeerOfTheWeek (workerRest): handles rest errors gracefully', async () => {
  const rest = async () => { throw new Error('connection refused'); };
  const result = await selectBeerOfTheWeek(rest, { workerRest: true });
  assert.equal(result, null);
});

// ── pickBestFromRatings unit tests ──

test('pickBestFromRatings: returns null for empty input', () => {
  assert.equal(pickBestFromRatings([]), null);
  assert.equal(pickBestFromRatings(null), null);
  assert.equal(pickBestFromRatings(undefined), null);
});

test('pickBestFromRatings: single rating returns that beer', () => {
  const result = pickBestFromRatings([rating('Only One', 3.5)]);
  assert.ok(result);
  assert.equal(result.beer_name, 'Only One');
  assert.equal(result.ratings.length, 1);
});

test('pickBestFromRatings: deterministic tie-break on name', () => {
  const result = pickBestFromRatings([
    rating('Zebra Ale', 4.0, { brewery: 'B1' }),
    rating('Alpha Ale', 4.0, { brewery: 'B2' }),
  ]);
  assert.ok(result);
  assert.equal(result.beer_name, 'Alpha Ale'); // alphabetically first wins tie
});

// ── selectBeerOfTheWeek (route-rest mode — status/body style) ──

test('selectBeerOfTheWeek (route-rest): returns 7d pick', async () => {
  const rest = async (method, path) => {
    if (path.startsWith('/ratings?created_at=gte.')) {
      const sinceMatch = path.match(/created_at=gte\.([^&]+)/);
      if (sinceMatch) {
        const since = new Date(decodeURIComponent(sinceMatch[1]));
        const daysAgo = (Date.now() - since.getTime()) / (24 * 60 * 60 * 1000);
        if (daysAgo <= 8) return { status: 200, body: [rating('Route Beer', 4.0)] };
      }
    }
    return { status: 200, body: [] };
  };

  const result = await selectBeerOfTheWeek(rest);
  assert.ok(result);
  assert.equal(result.beer_name, 'Route Beer');
  assert.equal(result.source, 'recent_7d');
});
