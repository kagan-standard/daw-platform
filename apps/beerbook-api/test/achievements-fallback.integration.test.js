const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const tabsRoutes = require('../routes/tabs');

function createApi(restImpl) {
  const app = express();
  const router = tabsRoutes({
    rest: restImpl,
    authMiddleware: (req, _res, next) => {
      req.claims = { sub: 'user-123' };
      next();
    },
    adminMiddleware: (_req, _res, next) => next(),
    totalFromContentRange: () => 0,
  });
  app.use('/api', router);
  return app;
}

function createRestMock(mapping) {
  return async function rest(_method, path) {
    const value = mapping[path];
    if (typeof value === 'function') return value(path);
    if (value) return value;
    throw new Error(`Unhandled rest path: ${path}`);
  };
}

async function requestJson(server, pathname) {
  const url = `http://127.0.0.1:${server.address().port}${pathname}`;
  const response = await fetch(url);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

test('GET /api/achievements/fallback returns a deterministic fallback object', async () => {
  const app = createApi(createRestMock({
    '/user_achievements?user_id=eq.user-123&select=achievement_id': {
      status: 200,
      body: [],
    },
    '/achievements?active=eq.true&trigger_type=eq.rating_submitted&select=id,key,name,description,rules,category_key,is_hidden': {
      status: 200,
      body: [
        {
          id: 'a1',
          key: 'ten_ratings',
          name: 'Regular',
          description: 'Log 10 ratings.',
          category_key: 'starter',
          is_hidden: false,
          rules: { type: 'count', entity: 'ratings', gte: 10 },
        },
      ],
    },
    '/ratings?user_id=eq.user-123&select=style,photo_url,notes,price_cents,venue_id,rating,location_name,created_at&limit=5000': {
      status: 200,
      body: [
        { style: 'IPA', stars: 4, created_at: '2026-03-01T00:00:00.000Z' },
        { style: 'Stout', stars: 5, created_at: '2026-03-02T00:00:00.000Z' },
      ],
    },
    '/achievement_categories?key=eq.starter&select=icon&limit=1': {
      status: 200,
      body: [{ icon: '/uploads/achievements/starter.png' }],
    },
  }));

  const server = app.listen(0);
  try {
    const out = await requestJson(server, '/api/achievements/fallback');
    assert.equal(out.status, 200);
    assert.deepEqual(out.body, {
      id: 'a1',
      key: 'ten_ratings',
      name: 'Regular',
      description: 'Log 10 ratings.',
      progress_current: 2,
      progress_target: 10,
      remaining: 8,
      icon_url: '/uploads/achievements/starter.png',
      is_fallback: true,
      reason: 'fallback_random',
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('GET /api/achievements/fallback returns 204 when no safe fallback exists', async () => {
  const app = createApi(createRestMock({
    '/user_achievements?user_id=eq.user-123&select=achievement_id': {
      status: 200,
      body: [{ achievement_id: 'a1' }],
    },
    '/achievements?active=eq.true&trigger_type=eq.rating_submitted&select=id,key,name,description,rules,category_key,is_hidden': {
      status: 200,
      body: [
        {
          id: 'a1',
          key: 'ten_ratings',
          name: 'Regular',
          description: 'Log 10 ratings.',
          category_key: 'starter',
          is_hidden: false,
          rules: { type: 'count', entity: 'ratings', gte: 10 },
        },
        {
          id: 'a2',
          key: 'unsupported_rule',
          name: 'Unsupported',
          description: 'Not computable for fallback.',
          category_key: 'starter',
          is_hidden: false,
          rules: { type: 'weekly_streak', weeks: 4 },
        },
      ],
    },
    '/ratings?user_id=eq.user-123&select=style,photo_url,notes,price_cents,venue_id,rating,location_name,created_at&limit=5000': {
      status: 200,
      body: [],
    },
  }));

  const server = app.listen(0);
  try {
    const out = await requestJson(server, '/api/achievements/fallback');
    assert.equal(out.status, 204);
    assert.equal(out.body, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
