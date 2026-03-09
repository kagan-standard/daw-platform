/**
 * Contract test for GET /api/crews/:id/milestones (Phase 3 backend plan).
 * Locks response shape: data[], pagination, and milestone item fields.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const crewsRoutes = require('../routes/crews');

function createApi(restImpl) {
  const app = express();
  const router = crewsRoutes({
    rest: restImpl,
    authMiddleware: (req, _res, next) => {
      req.claims = { sub: 'user-123' };
      next();
    },
    totalFromContentRange: (value) => {
      const match = String(value || '').match(/\/(\d+|\*)$/);
      if (!match || match[1] === '*') return 0;
      return Number(match[1]) || 0;
    },
  });
  app.use('/api', router);
  return app;
}

function createRestMock(mapping) {
  return async function rest(method, path, opts = {}) {
    const key = `${method} ${path}`;
    let value = mapping[key];
    if (typeof value === 'function') return value(path, opts);
    if (value) return value;
    if (mapping[path]) return mapping[path];
    throw new Error(`Unhandled rest: ${key}`);
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

test('GET /api/crews/:id/milestones returns contract shape (data + pagination)', async () => {
  const crewId = 'crew-abc';
  const milestoneId = 'ms-uuid-1';
  const occurredAt = '2025-03-09T12:00:00.000Z';
  const app = createApi(createRestMock({
    [`GET /crew_members?crew_id=eq.${crewId}&user_id=eq.user-123&limit=1`]: {
      status: 200,
      body: [{ crew_id: crewId, user_id: 'user-123', role: 'member' }],
    },
    [`GET /crew_milestones?crew_id=eq.${crewId}&order=occurred_at.desc&limit=20&offset=0`]: {
      status: 200,
      body: [
        {
          id: milestoneId,
          crew_id: crewId,
          type: 'crew_total_ratings',
          occurred_at: occurredAt,
          user_id: null,
          data: { total_ratings: 75, threshold: 75 },
          message: 'The crew hit 75 total ratings!',
        },
        {
          id: 'ms-uuid-2',
          crew_id: crewId,
          type: 'first_venue_visit',
          occurred_at: occurredAt,
          user_id: 'user-456',
          data: { venue_id: 'v1', venue_name: 'Hardywood' },
          message: 'Tyler visited a new venue: Hardywood',
        },
      ],
    },
    [`GET /crew_milestones?crew_id=eq.${crewId}&select=id&limit=0`]: {
      status: 200,
      body: [],
      headers: { 'content-range': '0-1/2' },
    },
    'GET /profiles?id=in.("user-456")&select=id,display_name&limit=1000': {
      status: 200,
      body: [{ id: 'user-456', display_name: 'Tyler' }],
    },
  }));

  const server = app.listen(0);
  try {
    const { status, body } = await requestJson(server, `/api/crews/${crewId}/milestones`);
    assert.equal(status, 200, 'milestones should return 200');
    assert.ok(body && typeof body === 'object', 'body is object');
    assert.ok(Array.isArray(body.data), 'data is array');
    assert.ok(body.pagination && typeof body.pagination === 'object', 'pagination present');

    assert.equal(body.data.length, 2);
    const first = body.data[0];
    assert.equal(first.id, milestoneId);
    assert.equal(first.type, 'crew_total_ratings');
    assert.equal(first.occurred_at, occurredAt);
    assert.equal(first.user_id, undefined);
    assert.equal(first.message, 'The crew hit 75 total ratings!');
    assert.deepEqual(first.data, { total_ratings: 75, threshold: 75 });

    const second = body.data[1];
    assert.equal(second.type, 'first_venue_visit');
    assert.equal(second.user_id, 'user-456');
    assert.equal(second.user_display_name, 'Tyler');
    assert.equal(second.message, 'Tyler visited a new venue: Hardywood');
    assert.deepEqual(second.data, { venue_id: 'v1', venue_name: 'Hardywood' });

    assert.equal(body.pagination.limit, 20);
    assert.equal(body.pagination.offset, 0);
    assert.equal(body.pagination.total, 2);
  } finally {
    server.close();
  }
});

test('GET /api/crews/:id/milestones returns 403 when not a member', async () => {
  const crewId = 'crew-xyz';
  const app = createApi(createRestMock({
    [`GET /crew_members?crew_id=eq.${crewId}&user_id=eq.user-123&limit=1`]: {
      status: 200,
      body: [],
    },
  }));

  const server = app.listen(0);
  try {
    const { status } = await requestJson(server, `/api/crews/${crewId}/milestones`);
    assert.equal(status, 403);
  } finally {
    server.close();
  }
});

// --- Phase 4: Trending + style-counts contract tests ---

test('GET /api/crews/:id/trending returns contract shape (data + pagination)', async () => {
  const crewId = 'crew-trend';
  const restMock = async (method, path) => {
    if (method === 'GET' && path.includes('/crew_members?') && path.includes(`crew_id=eq.${crewId}`) && path.includes('user_id=eq.user-123') && path.includes('limit=1')) {
      return { status: 200, body: [{ crew_id: crewId, user_id: 'user-123', role: 'member' }] };
    }
    if (method === 'GET' && path.startsWith(`/crew_members?crew_id=eq.${crewId}`) && path.includes('select=user_id')) {
      return { status: 200, body: [{ user_id: 'user-123' }, { user_id: 'user-456' }] };
    }
    if (method === 'GET' && path.startsWith('/ratings?') && path.includes('created_at=gte') && path.includes('beer_id')) {
      return {
        status: 200,
        body: [
          { beer_id: 'b1', beer_name: 'IPA One', style: 'IPA', brewery: 'Brew Co', rating: 4 },
          { beer_id: 'b1', beer_name: 'IPA One', style: 'IPA', brewery: 'Brew Co', rating: 5 },
          { beer_id: 'b2', beer_name: 'Stout Two', style: 'Stout', brewery: null, rating: 3 },
        ],
      };
    }
    throw new Error(`Unhandled: ${method} ${path}`);
  };
  const app = createApi(restMock);
  const server = app.listen(0);
  try {
    const { status, body } = await requestJson(server, `/api/crews/${crewId}/trending?days=7&limit=10`);
    assert.equal(status, 200);
    assert.ok(body && typeof body === 'object');
    assert.ok(Array.isArray(body.data), 'data is array');
    assert.ok(body.pagination && typeof body.pagination === 'object');
    assert.equal(body.data.length, 2, 'two unique beers');
    assert.equal(body.data[0].beer_id, 'b1');
    assert.equal(body.data[0].beer_name, 'IPA One');
    assert.equal(body.data[0].rating_count, 2);
    assert.equal(body.data[0].avg_rating, 4.5);
    assert.equal(body.data[0].style, 'IPA');
    assert.equal(body.pagination.limit, 10);
    assert.equal(body.pagination.total, 2);
    assert.equal(body.pagination.days, 7);
  } finally {
    server.close();
  }
});

test('GET /api/crews/:id/trending returns 403 when not a member', async () => {
  const crewId = 'crew-no';
  const app = createApi(createRestMock({
    [`GET /crew_members?crew_id=eq.${crewId}&user_id=eq.user-123&limit=1`]: { status: 200, body: [] },
  }));
  const server = app.listen(0);
  try {
    const { status } = await requestJson(server, `/api/crews/${crewId}/trending`);
    assert.equal(status, 403);
  } finally {
    server.close();
  }
});

test('GET /api/crews/:id/style-counts returns contract shape (object of style -> count)', async () => {
  const crewId = 'crew-styles';
  const restMock = async (method, path) => {
    if (method === 'GET' && path.includes('/crew_members?') && path.includes(`crew_id=eq.${crewId}`) && path.includes('user_id=eq.user-123') && path.includes('limit=1')) {
      return { status: 200, body: [{ crew_id: crewId, user_id: 'user-123', role: 'member' }] };
    }
    if (method === 'GET' && path.startsWith(`/crew_members?crew_id=eq.${crewId}`) && path.includes('select=user_id')) {
      return { status: 200, body: [{ user_id: 'user-123' }] };
    }
    if (method === 'GET' && path.startsWith('/ratings?') && path.includes('user_id=in.') && path.includes('select=style')) {
      return {
        status: 200,
        body: [
          { style: 'IPA' },
          { style: 'IPA' },
          { style: 'Stout' },
          { style: null },
        ],
      };
    }
    throw new Error(`Unhandled: ${method} ${path}`);
  };
  const app = createApi(restMock);
  const server = app.listen(0);
  try {
    const { status, body } = await requestJson(server, `/api/crews/${crewId}/style-counts`);
    assert.equal(status, 200);
    assert.ok(body && typeof body === 'object' && !Array.isArray(body));
    assert.equal(body.IPA, 2);
    assert.equal(body.Stout, 1);
    assert.equal(body.Unknown, 1);
  } finally {
    server.close();
  }
});

test('GET /api/crews/:id/style-counts returns 403 when not a member', async () => {
  const crewId = 'crew-no';
  const app = createApi(createRestMock({
    [`GET /crew_members?crew_id=eq.${crewId}&user_id=eq.user-123&limit=1`]: { status: 200, body: [] },
  }));
  const server = app.listen(0);
  try {
    const { status } = await requestJson(server, `/api/crews/${crewId}/style-counts`);
    assert.equal(status, 403);
  } finally {
    server.close();
  }
});
