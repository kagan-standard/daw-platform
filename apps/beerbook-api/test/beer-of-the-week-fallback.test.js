/**
 * Beer of the Week fallback chain tests.
 * Validates that GET /api/highlights/beer-of-the-week returns a beer object
 * through the full fallback chain: admin-curated → 7d → 30d → historical → null.
 *
 * Uses a mock `rest` function to simulate PostgREST responses without a database.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');

function createApp(restMock) {
  const highlightsRoute = require('../routes/highlights');
  const app = express();
  app.use('/api/highlights', highlightsRoute({ rest: restMock }));
  return app;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function fetch(port, path) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    }).on('error', reject);
  });
}

// Helper: build a rating row
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

// ── 1. Admin-curated pick takes priority ──

test('returns admin-curated beer when featured_beers row exists', async () => {
  const restMock = async (method, path) => {
    if (path.startsWith('/featured_beers')) {
      return {
        status: 200,
        body: [{
          beer_name: 'Admin Pick', brewery: 'Admin Brewery', style: 'Stout',
          headline: 'Top pick', body: 'Great beer', photo_url: 'http://img/1.jpg',
          beer_id: null,
        }],
      };
    }
    // first-rating lookup and profile lookup return empty
    return { status: 200, body: [] };
  };

  const app = createApp(restMock);
  const { server, port } = await listen(app);
  try {
    const res = await fetch(port, '/api/highlights/beer-of-the-week');
    assert.equal(res.status, 200);
    assert.equal(res.body.beer.beer_name, 'Admin Pick');
    assert.equal(res.body.beer.source, 'admin');
    assert.equal(res.body.beer.headline, 'Top pick');
  } finally {
    server.close();
  }
});

// ── 2. Falls back to 7-day trending with a single rating ──

test('returns 7d trending beer with only 1 rating', async () => {
  const restMock = async (method, path) => {
    if (path.startsWith('/featured_beers')) return { status: 200, body: [] };
    if (path.startsWith('/ratings?created_at=gte.') && !path.includes('beer_name=eq.')) {
      // Determine which window by checking the date in the path
      const sinceMatch = path.match(/created_at=gte\.([^&]+)/);
      if (sinceMatch) {
        const since = new Date(decodeURIComponent(sinceMatch[1]));
        const daysAgo = (Date.now() - since.getTime()) / (24 * 60 * 60 * 1000);
        if (daysAgo <= 8) {
          // 7-day window: return one rating
          return { status: 200, body: [rating('Solo Beer', 4.5)] };
        }
      }
      return { status: 200, body: [] };
    }
    if (path.startsWith('/profiles')) return { status: 200, body: [] };
    if (path.startsWith('/beers?name=eq.')) return { status: 200, body: [] };
    if (path.startsWith('/beer_elo_ratings')) return { status: 200, body: [] };
    return { status: 200, body: [] };
  };

  const app = createApp(restMock);
  const { server, port } = await listen(app);
  try {
    const res = await fetch(port, '/api/highlights/beer-of-the-week');
    assert.equal(res.status, 200);
    assert.equal(res.body.beer.beer_name, 'Solo Beer');
    assert.equal(res.body.beer.source, 'recent_7d');
    assert.equal(res.body.beer.review_count, 1);
    assert.equal(res.body.beer.avg_rating, 4.5);
  } finally {
    server.close();
  }
});

// ── 3. Falls back to 30-day window when 7-day is empty ──

test('returns 30d fallback when 7d has no ratings', async () => {
  const restMock = async (method, path) => {
    if (path.startsWith('/featured_beers')) return { status: 200, body: [] };
    if (path.startsWith('/ratings?created_at=gte.') && !path.includes('beer_name=eq.')) {
      const sinceMatch = path.match(/created_at=gte\.([^&]+)/);
      if (sinceMatch) {
        const since = new Date(decodeURIComponent(sinceMatch[1]));
        const daysAgo = (Date.now() - since.getTime()) / (24 * 60 * 60 * 1000);
        if (daysAgo <= 8) return { status: 200, body: [] }; // 7d empty
        if (daysAgo <= 31) return { status: 200, body: [rating('Month Old Fave', 4.8)] }; // 30d has data
      }
      return { status: 200, body: [] };
    }
    if (path.startsWith('/profiles')) return { status: 200, body: [] };
    if (path.startsWith('/beers?name=eq.')) return { status: 200, body: [] };
    if (path.startsWith('/beer_elo_ratings')) return { status: 200, body: [] };
    return { status: 200, body: [] };
  };

  const app = createApp(restMock);
  const { server, port } = await listen(app);
  try {
    const res = await fetch(port, '/api/highlights/beer-of-the-week');
    assert.equal(res.status, 200);
    assert.equal(res.body.beer.beer_name, 'Month Old Fave');
    assert.equal(res.body.beer.source, 'recent_30d');
  } finally {
    server.close();
  }
});

// ── 4. Falls back to historical catalog when no recent ratings exist ──

test('returns historical fallback from catalog when no recent ratings', async () => {
  const restMock = async (method, path) => {
    if (path.startsWith('/featured_beers')) return { status: 200, body: [] };
    if (path.startsWith('/ratings?created_at=gte.')) return { status: 200, body: [] };
    if (path.startsWith('/beers?review_count=gte.5')) {
      return {
        status: 200,
        body: [{ name: 'All-Time Great', brewery_name: 'Classic Brew Co', style: 'Lager', review_overall: 4.9, review_count: 200 }],
      };
    }
    if (path.startsWith('/beers?name=eq.')) return { status: 200, body: [] };
    if (path.startsWith('/beer_elo_ratings')) return { status: 200, body: [] };
    return { status: 200, body: [] };
  };

  const app = createApp(restMock);
  const { server, port } = await listen(app);
  try {
    const res = await fetch(port, '/api/highlights/beer-of-the-week');
    assert.equal(res.status, 200);
    assert.equal(res.body.beer.beer_name, 'All-Time Great');
    assert.equal(res.body.beer.brewery, 'Classic Brew Co');
    assert.equal(res.body.beer.source, 'historical_fallback');
    assert.equal(res.body.beer.review_count, 200);
    assert.equal(res.body.beer.avg_rating, 4.9);
  } finally {
    server.close();
  }
});

// ── 5. Returns beer: null only when nothing exists at all ──

test('returns beer: null when no data exists anywhere', async () => {
  const restMock = async () => ({ status: 200, body: [] });

  const app = createApp(restMock);
  const { server, port } = await listen(app);
  try {
    const res = await fetch(port, '/api/highlights/beer-of-the-week');
    assert.equal(res.status, 200);
    assert.equal(res.body.beer, null);
    assert.ok(res.body.message);
  } finally {
    server.close();
  }
});

// ── 6. Tie-break: higher avg wins, then more ratings, then alphabetical ──

test('tie-break: picks highest avg, then most ratings, then alphabetical', async () => {
  const restMock = async (method, path) => {
    if (path.startsWith('/featured_beers')) return { status: 200, body: [] };
    if (path.startsWith('/ratings?created_at=gte.') && !path.includes('beer_name=eq.')) {
      const sinceMatch = path.match(/created_at=gte\.([^&]+)/);
      if (sinceMatch) {
        const since = new Date(decodeURIComponent(sinceMatch[1]));
        const daysAgo = (Date.now() - since.getTime()) / (24 * 60 * 60 * 1000);
        if (daysAgo <= 8) {
          return {
            status: 200,
            body: [
              // Beer A: avg 4.0, 2 ratings
              rating('Beer A', 4.0, { brewery: 'B1' }),
              rating('Beer A', 4.0, { brewery: 'B1' }),
              // Beer B: avg 4.0, 2 ratings — same avg, same count, alphabetical loses
              rating('Beer B', 4.0, { brewery: 'B2' }),
              rating('Beer B', 4.0, { brewery: 'B2' }),
              // Beer C: avg 4.5, 1 rating — highest avg wins
              rating('Beer C', 4.5, { brewery: 'B3' }),
            ],
          };
        }
      }
      return { status: 200, body: [] };
    }
    return { status: 200, body: [] };
  };

  const app = createApp(restMock);
  const { server, port } = await listen(app);
  try {
    const res = await fetch(port, '/api/highlights/beer-of-the-week');
    assert.equal(res.body.beer.beer_name, 'Beer C'); // highest avg wins
    assert.equal(res.body.beer.avg_rating, 4.5);
  } finally {
    server.close();
  }
});

test('tie-break: same avg, more ratings wins', async () => {
  const restMock = async (method, path) => {
    if (path.startsWith('/featured_beers')) return { status: 200, body: [] };
    if (path.startsWith('/ratings?created_at=gte.') && !path.includes('beer_name=eq.')) {
      const sinceMatch = path.match(/created_at=gte\.([^&]+)/);
      if (sinceMatch) {
        const since = new Date(decodeURIComponent(sinceMatch[1]));
        const daysAgo = (Date.now() - since.getTime()) / (24 * 60 * 60 * 1000);
        if (daysAgo <= 8) {
          return {
            status: 200,
            body: [
              rating('Fewer', 4.0),
              rating('More', 4.0),
              rating('More', 4.0),
            ],
          };
        }
      }
      return { status: 200, body: [] };
    }
    return { status: 200, body: [] };
  };

  const app = createApp(restMock);
  const { server, port } = await listen(app);
  try {
    const res = await fetch(port, '/api/highlights/beer-of-the-week');
    assert.equal(res.body.beer.beer_name, 'More');
  } finally {
    server.close();
  }
});
