const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const tabsRoutes = require('../routes/tabs');

function createApi(restImpl) {
  const app = express();
  const router = tabsRoutes({
    rest: restImpl,
    authMiddleware: (req, _res, next) => {
      req.claims = { sub: 'viewer-123' };
      next();
    },
    adminMiddleware: (_req, _res, next) => next(),
    totalFromContentRange: () => 0,
  });
  app.use('/api', router);
  return app;
}

async function requestJson(server, pathname) {
  const url = `http://127.0.0.1:${server.address().port}${pathname}`;
  const response = await fetch(url);
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

test('GET /api/achievements uses current user scope by default', async () => {
  const calls = [];
  const app = createApi(async (method, path) => {
    calls.push({ method, path });
    if (path === '/user_achievements?user_id=eq.viewer-123&select=achievement_id,unlocked_at&order=unlocked_at.desc') {
      return {
        status: 200,
        body: [{ achievement_id: 'ach-1', unlocked_at: '2026-03-07T10:00:00.000Z' }],
      };
    }
    if (path === '/achievements?id=in.(ach-1)&select=id,key,name,description,reward_tabs,category_key,difficulty') {
      return {
        status: 200,
        body: [{
          id: 'ach-1',
          key: 'first_rating',
          name: 'First Sip',
          description: 'Log your first rating.',
          reward_tabs: 5,
          category_key: 'starter',
          difficulty: 'easy',
        }],
      };
    }
    if (path === '/achievement_categories?key=in.(starter)&select=key,icon') {
      return {
        status: 200,
        body: [{ key: 'starter', icon: '/uploads/achievements/starter.png' }],
      };
    }
    throw new Error(`Unhandled rest call: ${method} ${path}`);
  });

  const server = app.listen(0);
  try {
    const out = await requestJson(server, '/api/achievements');
    assert.equal(out.status, 200);
    assert.equal(out.body.data.length, 1);
    assert.equal(out.body.data[0].tier, 'easy');
    assert.equal(out.body.data[0].earned_at, '2026-03-07T10:00:00.000Z');
    assert.equal(
      calls.some((c) => c.path.includes('/user_achievements?user_id=eq.viewer-123')),
      true
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('GET /api/achievements supports user_id for foreign profile and masks earned_at', async () => {
  const app = createApi(async (method, path) => {
    if (path === '/user_achievements?user_id=eq.profile-456&select=achievement_id,unlocked_at&order=unlocked_at.desc') {
      return {
        status: 200,
        body: [{ achievement_id: 'ach-2', unlocked_at: '2026-03-06T12:30:00.000Z' }],
      };
    }
    if (path === '/achievements?id=in.(ach-2)&select=id,key,name,description,reward_tabs,category_key,difficulty') {
      return {
        status: 200,
        body: [{
          id: 'ach-2',
          key: 'ten_ratings',
          name: 'Regular',
          description: 'Log 10 ratings.',
          reward_tabs: 10,
          category_key: 'starter',
          difficulty: 'medium',
        }],
      };
    }
    if (path === '/achievement_categories?key=in.(starter)&select=key,icon') {
      return {
        status: 200,
        body: [{ key: 'starter', icon: '/uploads/achievements/starter.png' }],
      };
    }
    throw new Error(`Unhandled rest call: ${method} ${path}`);
  });

  const server = app.listen(0);
  try {
    const out = await requestJson(server, '/api/achievements?user_id=profile-456');
    assert.equal(out.status, 200);
    assert.equal(out.body.data.length, 1);
    assert.equal(out.body.data[0].key, 'ten_ratings');
    assert.equal(out.body.data[0].tier, 'medium');
    assert.equal(out.body.data[0].earned_at, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
