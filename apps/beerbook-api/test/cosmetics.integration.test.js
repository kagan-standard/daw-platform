const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const tabsRoutes = require('../routes/tabs');

function createApi(restImpl) {
  const app = express();
  app.use(express.json());
  const router = tabsRoutes({
    rest: restImpl,
    authMiddleware: (req, _res, next) => {
      req.claims = { sub: 'user-123' };
      next();
    },
    softAuthMiddleware: (req, _res, next) => {
      req.claims = { sub: 'user-123' };
      next();
    },
    adminMiddleware: (_req, _res, next) => next(),
    totalFromContentRange: () => 0,
  });
  app.use('/api', router);
  return app;
}

async function requestJson(server, method, pathname, payload) {
  const url = `http://127.0.0.1:${server.address().port}${pathname}`;
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: payload == null ? undefined : JSON.stringify(payload),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

test('POST /api/cosmetics/purchase accepts cosmetic_id and forwards cosmetic_key to RPC', async () => {
  const calls = [];
  const app = createApi(async (method, path, opts = {}) => {
    calls.push({ method, path, opts });
    if (path === '/cosmetics?id=eq.cos-123&select=key&limit=1') {
      return { status: 200, body: [{ key: 'gold_border' }] };
    }
    if (path === '/rpc/purchase_cosmetic') {
      const body = opts?.body ? JSON.parse(opts.body) : {};
      assert.equal(body.p_user_id, 'user-123');
      assert.equal(body.p_cosmetic_key, 'gold_border');
      return {
        status: 200,
        body: {
          ok: true,
          cosmetic_id: '00000000-0000-4000-8000-000000000001',
          cosmetic_key: 'gold_border',
          acquired_via: 'purchase',
          tabs_spent: 50,
          tabs_balance: 150,
        },
      };
    }
    throw new Error(`Unhandled rest call: ${method} ${path}`);
  });

  const server = app.listen(0);
  try {
    const out = await requestJson(server, 'POST', '/api/cosmetics/purchase', { cosmetic_id: 'cos-123' });
    assert.equal(out.status, 200);
    assert.equal(out.body?.data?.cosmetic_key, 'gold_border');
    assert.equal(calls.some((c) => c.path === '/rpc/purchase_cosmetic'), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/cosmetics/equip supports per-slot unequip with null cosmetic_id', async () => {
  const app = createApi(async (method, path, opts = {}) => {
    if (method === 'PATCH' && path === '/profiles?id=eq.user-123') {
      const body = JSON.parse(opts.body || '{}');
      assert.equal(body.equipped_border_id, null);
      return {
        status: 200,
        body: [{ equipped_border_id: null, equipped_title_id: '00000000-0000-4000-8000-000000000099' }],
      };
    }
    throw new Error(`Unhandled rest call: ${method} ${path}`);
  });

  const server = app.listen(0);
  try {
    const out = await requestJson(server, 'POST', '/api/cosmetics/equip', {
      slot: 'border',
      cosmetic_id: null,
    });
    assert.equal(out.status, 200);
    assert.equal(out.body?.data?.slot, 'border');
    assert.equal(out.body?.data?.cosmetic_id, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/cosmetics/equip infers slot from cosmetic type', async () => {
  const app = createApi(async (method, path, opts = {}) => {
    if (method === 'GET' && path === '/cosmetics?id=eq.00000000-0000-4000-8000-000000000001&select=id,type,active&limit=1') {
      return {
        status: 200,
        body: [{ id: '00000000-0000-4000-8000-000000000001', type: 'title', active: true }],
      };
    }
    if (method === 'GET' && path === '/user_cosmetics?user_id=eq.user-123&cosmetic_id=eq.00000000-0000-4000-8000-000000000001&select=id&limit=1') {
      return { status: 200, body: [{ id: 'owned-1' }] };
    }
    if (method === 'PATCH' && path === '/profiles?id=eq.user-123') {
      const body = JSON.parse(opts.body || '{}');
      assert.equal(body.equipped_title_id, '00000000-0000-4000-8000-000000000001');
      return {
        status: 200,
        body: [{ equipped_border_id: null, equipped_title_id: '00000000-0000-4000-8000-000000000001' }],
      };
    }
    throw new Error(`Unhandled rest call: ${method} ${path}`);
  });

  const server = app.listen(0);
  try {
    const out = await requestJson(server, 'POST', '/api/cosmetics/equip', {
      cosmetic_id: '00000000-0000-4000-8000-000000000001',
    });
    assert.equal(out.status, 200);
    assert.equal(out.body?.data?.slot, 'title');
    assert.equal(out.body?.data?.cosmetic_id, '00000000-0000-4000-8000-000000000001');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('GET /api/users/:id/cosmetics returns owned cosmetics with is_equipped', async () => {
  const app = createApi(async (_method, path) => {
    if (path === '/user_cosmetics?user_id=eq.user-123&select=id,cosmetic_id,acquired_via,acquired_at&order=acquired_at.desc&limit=5000') {
      return {
        status: 200,
        body: [
          {
            id: 'u1',
            cosmetic_id: '00000000-0000-4000-8000-000000000001',
            acquired_via: 'achievement',
            acquired_at: '2026-03-05T00:00:00.000Z',
          },
        ],
      };
    }
    if (path === '/profiles?id=eq.user-123&select=equipped_border_id,equipped_title_id&limit=1') {
      return {
        status: 200,
        body: [{ equipped_border_id: '00000000-0000-4000-8000-000000000001', equipped_title_id: null }],
      };
    }
    if (path === '/cosmetics?id=in.(00000000-0000-4000-8000-000000000001)&select=id,key,type,name,description,rarity,asset_url,preview_asset_url,title_text,unlock_type,achievement_key,tab_price,active,sort_order,created_at') {
      return {
        status: 200,
        body: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            key: 'starter_border',
            type: 'border',
            name: 'Starter Border',
            description: 'First border',
            rarity: 'common',
            asset_url: '/uploads/cosmetics/border.png',
            preview_asset_url: '/uploads/cosmetics/border_preview.png',
            title_text: null,
          },
        ],
      };
    }
    throw new Error(`Unhandled rest path: ${path}`);
  });

  const server = app.listen(0);
  try {
    const out = await requestJson(server, 'GET', '/api/users/user-123/cosmetics');
    assert.equal(out.status, 200);
    assert.equal(Array.isArray(out.body?.data), true);
    assert.equal(out.body.data[0].is_equipped, true);
    assert.equal(out.body.data[0].preview_asset_url, '/uploads/cosmetics/border_preview.png');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
