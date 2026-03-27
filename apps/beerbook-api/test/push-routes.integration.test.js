const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const pushRoutes = require('../routes/push');

function createApi({ restImpl, userId = 'user-123' }) {
  const app = express();
  app.use(express.json());
  const router = pushRoutes({
    rest: restImpl,
    authMiddleware: (req, _res, next) => {
      req.claims = { sub: userId };
      next();
    },
  });
  app.use('/api', router);
  return app;
}

function parseFilterValue(raw) {
  if (typeof raw !== 'string') return null;
  if (raw.startsWith('eq.')) return { op: 'eq', value: decodeURIComponent(raw.slice(3)) };
  if (raw.startsWith('neq.')) return { op: 'neq', value: decodeURIComponent(raw.slice(4)) };
  return null;
}

function rowMatchesPushTokensGetFilters(row, params) {
  for (const [key, raw] of params.entries()) {
    if (key === 'select' || key === 'limit') continue;
    const fv = parseFilterValue(raw);
    if (!fv || fv.op !== 'eq') continue;
    if (key === 'user_id' && String(row.user_id) !== fv.value) return false;
    if (key === 'expo_push_token' && String(row.expo_push_token) !== fv.value) return false;
    if (key === 'device_id' && String(row.device_id || '') !== fv.value) return false;
    if (key === 'is_active') {
      const expected = fv.value === 'true';
      if (Boolean(row.is_active) !== expected) return false;
    }
  }
  return true;
}

function createPushTokensRestMock(seedRows = [], options = {}) {
  const rows = seedRows.map((row) => ({ ...row }));
  let upsertOnceResponse = options.upsertOnceResponse ?? null;
  const patchSameDeviceDeactivateNoop = options.patchSameDeviceDeactivateNoop === true;

  return {
    rest: async (method, path, opts = {}) => {
      if (!path.startsWith('/push_tokens')) {
        throw new Error(`Unhandled rest: ${method} ${path}`);
      }

      const [pathname, rawQuery = ''] = path.split('?');
      if (pathname !== '/push_tokens') {
        throw new Error(`Unhandled rest path: ${method} ${path}`);
      }
      const params = new URLSearchParams(rawQuery);

      if (method === 'GET') {
        let matches = rows.filter((r) => rowMatchesPushTokensGetFilters(r, params));
        const limitRaw = params.get('limit');
        if (limitRaw) {
          const n = parseInt(limitRaw, 10);
          if (Number.isFinite(n)) matches = matches.slice(0, n);
        }
        return { status: 200, body: matches };
      }

      if (method === 'POST') {
        if (upsertOnceResponse != null && params.get('on_conflict')) {
          const out = upsertOnceResponse;
          upsertOnceResponse = null;
          return out;
        }
        const body = JSON.parse(opts.body || '{}');
        const token = String(body.expo_push_token || '');
        const existingIdx = rows.findIndex((r) => r.expo_push_token === token);
        const merged = existingIdx >= 0
          ? { ...rows[existingIdx], ...body }
          : {
            id: `pt-${rows.length + 1}`,
            created_at: body.created_at || new Date().toISOString(),
            ...body,
          };
        if (existingIdx >= 0) rows[existingIdx] = merged;
        else rows.push(merged);
        return { status: 201, body: [merged] };
      }

      if (method === 'PATCH') {
        if (patchSameDeviceDeactivateNoop) {
          return { status: 200, body: [] };
        }
        const patch = JSON.parse(opts.body || '{}');
        const userIdFilter = parseFilterValue(params.get('user_id'));
        const tokenEqFilter = parseFilterValue(params.get('expo_push_token'));
        const tokenNeqFilter = parseFilterValue(params.get('expo_push_token'));
        const deviceIdFilter = parseFilterValue(params.get('device_id'));
        const isActiveFilter = parseFilterValue(params.get('is_active'));

        const updated = [];
        rows.forEach((row) => {
          if (userIdFilter && String(row.user_id) !== userIdFilter.value) return;
          if (deviceIdFilter && String(row.device_id || '') !== deviceIdFilter.value) return;
          if (tokenEqFilter && tokenEqFilter.op === 'eq' && String(row.expo_push_token) !== tokenEqFilter.value) return;
          if (tokenNeqFilter && tokenNeqFilter.op === 'neq' && String(row.expo_push_token) === tokenNeqFilter.value) return;
          if (isActiveFilter) {
            const expected = isActiveFilter.value === 'true';
            if (Boolean(row.is_active) !== expected) return;
          }
          Object.assign(row, patch);
          updated.push({ ...row });
        });

        return { status: 200, body: updated };
      }

      throw new Error(`Unhandled rest: ${method} ${path}`);
    },
    rows,
  };
}

async function requestJson(server, method, pathname, body) {
  const url = `http://127.0.0.1:${server.address().port}${pathname}`;
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed };
}

test('POST /api/push/register initial register creates active token', async () => {
  const mock = createPushTokensRestMock();
  const app = createApi({ restImpl: mock.rest });
  const server = app.listen(0);
  try {
    const out = await requestJson(server, 'POST', '/api/push/register', {
      expo_push_token: 'ExponentPushToken[token-1]',
      platform: 'ios',
      device_id: 'device-a',
      app_version: '1.0.0',
    });

    assert.equal(out.status, 200);
    assert.equal(out.body.registered, true);
    assert.notEqual(out.body.already_registered, true);
    assert.equal(out.body.token.user_id, 'user-123');
    assert.equal(out.body.token.is_active, true);
    assert.equal(mock.rows.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/push/register 23505 reconcile by expo_push_token same user returns 200 already_registered', async () => {
  const existing = {
    id: 'pt-existing',
    user_id: 'user-123',
    expo_push_token: 'ExponentPushToken[token-1]',
    platform: 'ios',
    device_id: 'device-a',
    is_active: true,
    created_at: '2026-03-01T00:00:00.000Z',
    updated_at: '2026-03-01T00:00:00.000Z',
    last_seen_at: '2026-03-01T00:00:00.000Z',
  };
  const mock = createPushTokensRestMock([{ ...existing }], {
    upsertOnceResponse: {
      status: 409,
      body: { code: '23505', message: 'duplicate key value violates unique constraint' },
    },
  });
  const app = createApi({ restImpl: mock.rest });
  const server = app.listen(0);
  try {
    const out = await requestJson(server, 'POST', '/api/push/register', {
      expo_push_token: 'ExponentPushToken[token-1]',
      platform: 'ios',
      device_id: 'device-a',
    });

    assert.equal(out.status, 200);
    assert.equal(out.body.registered, true);
    assert.equal(out.body.already_registered, true);
    assert.equal(out.body.token.expo_push_token, 'ExponentPushToken[token-1]');
    assert.equal(out.body.token.user_id, 'user-123');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/push/register 23505 token row owned by other user preserves conflict', async () => {
  const mock = createPushTokensRestMock(
    [
      {
        id: 'pt-other',
        user_id: 'user-999',
        expo_push_token: 'ExponentPushToken[token-1]',
        platform: 'ios',
        device_id: 'device-a',
        is_active: true,
        created_at: '2026-03-01T00:00:00.000Z',
        updated_at: '2026-03-01T00:00:00.000Z',
        last_seen_at: '2026-03-01T00:00:00.000Z',
      },
    ],
    {
      upsertOnceResponse: {
        status: 409,
        body: { code: '23505', message: 'duplicate key value violates unique constraint' },
      },
    }
  );
  const app = createApi({ restImpl: mock.rest, userId: 'user-123' });
  const server = app.listen(0);
  try {
    const out = await requestJson(server, 'POST', '/api/push/register', {
      expo_push_token: 'ExponentPushToken[token-1]',
      platform: 'ios',
      device_id: 'device-a',
    });

    assert.equal(out.status, 409);
    assert.equal(out.body.code, '23505');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/push/register 23505 active device row fallback returns 200 already_registered', async () => {
  const mock = createPushTokensRestMock(
    [
      {
        id: 'pt-old',
        user_id: 'user-123',
        expo_push_token: 'ExponentPushToken[old-on-device]',
        platform: 'ios',
        device_id: 'device-a',
        is_active: true,
        created_at: '2026-03-01T00:00:00.000Z',
        updated_at: '2026-03-01T00:00:00.000Z',
        last_seen_at: '2026-03-01T00:00:00.000Z',
      },
    ],
    {
      upsertOnceResponse: {
        status: 409,
        body: { code: '23505', message: 'duplicate key (user_id, device_id)' },
      },
      patchSameDeviceDeactivateNoop: true,
    }
  );
  const app = createApi({ restImpl: mock.rest });
  const server = app.listen(0);
  try {
    const out = await requestJson(server, 'POST', '/api/push/register', {
      expo_push_token: 'ExponentPushToken[brand-new]',
      platform: 'ios',
      device_id: 'device-a',
    });

    assert.equal(out.status, 200);
    assert.equal(out.body.already_registered, true);
    assert.equal(out.body.token.expo_push_token, 'ExponentPushToken[old-on-device]');
    assert.equal(out.body.token.user_id, 'user-123');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/push/register 23505 with no reconcile match preserves conflict', async () => {
  const mock = createPushTokensRestMock([], {
    upsertOnceResponse: {
      status: 409,
      body: { code: '23505', message: 'duplicate key' },
    },
  });
  const app = createApi({ restImpl: mock.rest });
  const server = app.listen(0);
  try {
    const out = await requestJson(server, 'POST', '/api/push/register', {
      expo_push_token: 'ExponentPushToken[token-1]',
      platform: 'ios',
      device_id: 'device-a',
    });

    assert.equal(out.status, 409);
    assert.equal(out.body.code, '23505');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/push/register repeated register with same token is idempotent and refreshes timestamps', async () => {
  const mock = createPushTokensRestMock([
    {
      id: 'pt-1',
      user_id: 'user-123',
      expo_push_token: 'ExponentPushToken[token-1]',
      platform: 'ios',
      device_id: 'device-a',
      app_version: '0.9.0',
      is_active: true,
      deactivated_at: null,
      deactivation_reason: null,
      created_at: '2026-03-01T00:00:00.000Z',
      updated_at: '2026-03-01T00:00:00.000Z',
      last_seen_at: '2026-03-01T00:00:00.000Z',
    },
  ]);
  const app = createApi({ restImpl: mock.rest });
  const server = app.listen(0);
  try {
    const out = await requestJson(server, 'POST', '/api/push/register', {
      expo_push_token: 'ExponentPushToken[token-1]',
      platform: 'ios',
      device_id: 'device-a',
      app_version: '1.1.0',
    });

    assert.equal(out.status, 200);
    assert.equal(mock.rows.length, 1);
    assert.equal(out.body.token.is_active, true);
    assert.equal(out.body.token.app_version, '1.1.0');
    assert.notEqual(out.body.token.updated_at, '2026-03-01T00:00:00.000Z');
    assert.notEqual(out.body.token.last_seen_at, '2026-03-01T00:00:00.000Z');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/push/unregister active token deactivates it', async () => {
  const mock = createPushTokensRestMock([
    {
      id: 'pt-1',
      user_id: 'user-123',
      expo_push_token: 'ExponentPushToken[token-1]',
      platform: 'ios',
      device_id: 'device-a',
      is_active: true,
      created_at: '2026-03-01T00:00:00.000Z',
      updated_at: '2026-03-01T00:00:00.000Z',
      last_seen_at: '2026-03-01T00:00:00.000Z',
    },
  ]);
  const app = createApi({ restImpl: mock.rest });
  const server = app.listen(0);
  try {
    const out = await requestJson(server, 'POST', '/api/push/unregister', {
      expo_push_token: 'ExponentPushToken[token-1]',
    });

    assert.equal(out.status, 200);
    assert.equal(out.body.unregistered, true);
    assert.equal(out.body.already_unregistered, false);
    assert.equal(mock.rows[0].is_active, false);
    assert.equal(mock.rows[0].deactivation_reason, 'user_unregistered');
    assert.ok(mock.rows[0].deactivated_at);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/push/unregister already inactive token is idempotent success', async () => {
  const mock = createPushTokensRestMock([
    {
      id: 'pt-1',
      user_id: 'user-123',
      expo_push_token: 'ExponentPushToken[token-1]',
      platform: 'ios',
      device_id: 'device-a',
      is_active: false,
      deactivation_reason: 'user_unregistered',
      deactivated_at: '2026-03-05T00:00:00.000Z',
      created_at: '2026-03-01T00:00:00.000Z',
      updated_at: '2026-03-05T00:00:00.000Z',
      last_seen_at: '2026-03-01T00:00:00.000Z',
    },
  ]);
  const app = createApi({ restImpl: mock.rest });
  const server = app.listen(0);
  try {
    const out = await requestJson(server, 'POST', '/api/push/unregister', {
      expo_push_token: 'ExponentPushToken[token-1]',
    });

    assert.equal(out.status, 200);
    assert.equal(out.body.unregistered, true);
    assert.equal(out.body.already_unregistered, true);
    assert.equal(mock.rows[0].is_active, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/push/register re-registers previously unregistered token and clears deactivation fields', async () => {
  const mock = createPushTokensRestMock([
    {
      id: 'pt-1',
      user_id: 'user-123',
      expo_push_token: 'ExponentPushToken[token-1]',
      platform: 'ios',
      device_id: 'device-a',
      app_version: '1.0.0',
      is_active: false,
      deactivation_reason: 'user_unregistered',
      deactivated_at: '2026-03-05T00:00:00.000Z',
      created_at: '2026-03-01T00:00:00.000Z',
      updated_at: '2026-03-05T00:00:00.000Z',
      last_seen_at: '2026-03-01T00:00:00.000Z',
    },
  ]);
  const app = createApi({ restImpl: mock.rest });
  const server = app.listen(0);
  try {
    const out = await requestJson(server, 'POST', '/api/push/register', {
      expo_push_token: 'ExponentPushToken[token-1]',
      platform: 'ios',
      device_id: 'device-a',
      app_version: '1.2.0',
    });

    assert.equal(out.status, 200);
    assert.equal(out.body.token.is_active, true);
    assert.equal(out.body.token.deactivated_at, null);
    assert.equal(out.body.token.deactivation_reason, null);
    assert.notEqual(out.body.token.updated_at, '2026-03-05T00:00:00.000Z');
    assert.notEqual(out.body.token.last_seen_at, '2026-03-01T00:00:00.000Z');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/push/register same device_id replaces existing active token for same user', async () => {
  const mock = createPushTokensRestMock([
    {
      id: 'pt-1',
      user_id: 'user-123',
      expo_push_token: 'ExponentPushToken[old-token]',
      platform: 'ios',
      device_id: 'device-a',
      is_active: true,
      created_at: '2026-03-01T00:00:00.000Z',
      updated_at: '2026-03-01T00:00:00.000Z',
      last_seen_at: '2026-03-01T00:00:00.000Z',
    },
  ]);
  const app = createApi({ restImpl: mock.rest });
  const server = app.listen(0);
  try {
    const out = await requestJson(server, 'POST', '/api/push/register', {
      expo_push_token: 'ExponentPushToken[new-token]',
      platform: 'ios',
      device_id: 'device-a',
    });

    assert.equal(out.status, 200);
    const oldToken = mock.rows.find((r) => r.expo_push_token === 'ExponentPushToken[old-token]');
    const newToken = mock.rows.find((r) => r.expo_push_token === 'ExponentPushToken[new-token]');
    assert.equal(oldToken.is_active, false);
    assert.equal(oldToken.deactivation_reason, 'replaced_by_new_registration');
    assert.equal(newToken.is_active, true);
    assert.equal(newToken.user_id, 'user-123');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/push/register same token after account switch reassigns ownership to authenticated user', async () => {
  const mock = createPushTokensRestMock([
    {
      id: 'pt-1',
      user_id: 'user-123',
      expo_push_token: 'ExponentPushToken[token-shared]',
      platform: 'ios',
      device_id: 'device-a',
      app_version: '1.0.0',
      is_active: false,
      deactivation_reason: 'user_unregistered',
      deactivated_at: '2026-03-05T00:00:00.000Z',
      created_at: '2026-03-01T00:00:00.000Z',
      updated_at: '2026-03-05T00:00:00.000Z',
      last_seen_at: '2026-03-01T00:00:00.000Z',
    },
  ]);
  const app = createApi({ restImpl: mock.rest, userId: 'user-999' });
  const server = app.listen(0);
  try {
    const out = await requestJson(server, 'POST', '/api/push/register', {
      expo_push_token: 'ExponentPushToken[token-shared]',
      platform: 'android',
      device_id: 'device-a',
      app_version: '2.0.0',
    });

    assert.equal(out.status, 200);
    assert.equal(out.body.token.user_id, 'user-999');
    assert.equal(out.body.token.platform, 'android');
    assert.equal(out.body.token.is_active, true);
    assert.equal(out.body.token.deactivated_at, null);
    assert.equal(out.body.token.deactivation_reason, null);
    assert.notEqual(out.body.token.updated_at, '2026-03-05T00:00:00.000Z');
    assert.notEqual(out.body.token.last_seen_at, '2026-03-01T00:00:00.000Z');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/push/register missing expo_push_token returns 400', async () => {
  const mock = createPushTokensRestMock();
  const app = createApi({ restImpl: mock.rest });
  const server = app.listen(0);
  try {
    const out = await requestJson(server, 'POST', '/api/push/register', {
      platform: 'ios',
      device_id: 'device-a',
    });
    assert.equal(out.status, 400);
    assert.deepEqual(out.body, { error: 'expo_push_token is required' });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/push/register trims expo_push_token and rejects invalid format with 400', async () => {
  const mock = createPushTokensRestMock();
  const app = createApi({ restImpl: mock.rest });
  const server = app.listen(0);
  try {
    const out = await requestJson(server, 'POST', '/api/push/register', {
      expo_push_token: '  not-an-expo-token  ',
      platform: 'ios',
    });
    assert.equal(out.status, 400);
    assert.deepEqual(out.body, { error: 'expo_push_token is invalid' });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/push/register missing platform returns 400', async () => {
  const mock = createPushTokensRestMock();
  const app = createApi({ restImpl: mock.rest });
  const server = app.listen(0);
  try {
    const out = await requestJson(server, 'POST', '/api/push/register', {
      expo_push_token: 'ExponentPushToken[token-1]',
    });
    assert.equal(out.status, 400);
    assert.deepEqual(out.body, { error: 'platform must be ios or android' });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/push/register trims+lowercases platform and rejects invalid value with 400', async () => {
  const mock = createPushTokensRestMock();
  const app = createApi({ restImpl: mock.rest });
  const server = app.listen(0);
  try {
    const out = await requestJson(server, 'POST', '/api/push/register', {
      expo_push_token: 'ExponentPushToken[token-1]',
      platform: '  WEB  ',
    });
    assert.equal(out.status, 400);
    assert.deepEqual(out.body, { error: 'platform must be ios or android' });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/push/unregister missing expo_push_token returns 400', async () => {
  const mock = createPushTokensRestMock();
  const app = createApi({ restImpl: mock.rest });
  const server = app.listen(0);
  try {
    const out = await requestJson(server, 'POST', '/api/push/unregister', {});
    assert.equal(out.status, 400);
    assert.deepEqual(out.body, { error: 'expo_push_token is required' });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
