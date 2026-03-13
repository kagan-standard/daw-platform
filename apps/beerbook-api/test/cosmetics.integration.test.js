const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');

const tabsRoutes = require('../routes/tabs');
const { validateCosmeticPatch } = require('../lib/adminValidation');

function createApi(restImpl, options = {}) {
  const withSoftAuth = options.withSoftAuth !== false;
  const app = express();
  app.use(express.json());
  const router = tabsRoutes({
    rest: restImpl,
    authMiddleware: (req, _res, next) => {
      req.claims = { sub: 'user-123' };
      next();
    },
    softAuthMiddleware: (req, _res, next) => {
      if (withSoftAuth) req.claims = { sub: 'user-123' };
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

test('GET /api/cosmetics enriches achievement visibility and progress fields', async () => {
  const app = createApi(async (method, path) => {
    if (method === 'GET' && path === '/cosmetics?active=eq.true&select=id,key,type,name,description,rarity,asset_url,preview_asset_url,title_text,unlock_type,achievement_key,tab_price,active,sort_order,border_fit,created_at&order=sort_order.asc,created_at.asc') {
      return {
        status: 200,
        body: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            key: 'mystery_border',
            type: 'border',
            name: 'Mystery Border',
            description: 'Locked border',
            rarity: 'epic',
            asset_url: '/uploads/cosmetics/mystery.png',
            preview_asset_url: '/uploads/cosmetics/mystery_preview.png',
            title_text: null,
            unlock_type: 'achievement',
            achievement_key: 'hidden_ach',
            tab_price: 0,
            active: true,
            sort_order: 1,
            created_at: '2026-03-06T00:00:00.000Z',
          },
          {
            id: '00000000-0000-4000-8000-000000000002',
            key: 'shop_border',
            type: 'border',
            name: 'Shop Border',
            description: 'Buyable border',
            rarity: 'common',
            asset_url: '/uploads/cosmetics/shop.png',
            preview_asset_url: '/uploads/cosmetics/shop_preview.png',
            title_text: null,
            unlock_type: 'purchase',
            achievement_key: null,
            tab_price: 25,
            active: true,
            sort_order: 2,
            created_at: '2026-03-06T00:00:00.000Z',
          },
        ],
      };
    }
    if (method === 'GET' && path === '/user_cosmetics?user_id=eq.user-123&select=cosmetic_id&limit=5000') {
      return { status: 200, body: [] };
    }
    if (method === 'GET' && path === '/profiles?id=eq.user-123&select=equipped_border_id,equipped_title_id,equipped_avatar_id&limit=1') {
      return { status: 200, body: [{ equipped_border_id: null, equipped_title_id: null, equipped_avatar_id: null }] };
    }
    if (method === 'GET' && path === '/achievements?key=in.(hidden_ach)&select=id,key,is_hidden,rules') {
      return {
        status: 200,
        body: [
          { id: 'a1', key: 'hidden_ach', is_hidden: true, rules: { gte: 10 } },
        ],
      };
    }
    if (method === 'GET' && path === '/user_achievements?user_id=eq.user-123&achievement_id=in.(a1)&select=achievement_id,progress') {
      return {
        status: 200,
        body: [{ achievement_id: 'a1', progress: 3 }],
      };
    }
    throw new Error(`Unhandled rest path: ${path}`);
  });

  const server = app.listen(0);
  try {
    const out = await requestJson(server, 'GET', '/api/cosmetics');
    assert.equal(out.status, 200);
    assert.equal(Array.isArray(out.body?.data), true);
    assert.equal(out.body.data.length, 2);
    assert.equal(out.body.data[0].achievement_hidden, true);
    assert.equal(out.body.data[0].achievement_progress_current, 3);
    assert.equal(out.body.data[0].achievement_progress_target, 10);
    assert.equal(out.body.data[1].achievement_hidden, false);
    assert.equal(out.body.data[1].achievement_progress_current, null);
    assert.equal(out.body.data[1].achievement_progress_target, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('GET /api/cosmetics skips user progress lookup when unauthenticated', async () => {
  const app = createApi(async (method, path) => {
    if (method === 'GET' && path === '/cosmetics?active=eq.true&select=id,key,type,name,description,rarity,asset_url,preview_asset_url,title_text,unlock_type,achievement_key,tab_price,active,sort_order,border_fit,created_at&order=sort_order.asc,created_at.asc') {
      return {
        status: 200,
        body: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            key: 'mystery_border',
            type: 'border',
            name: 'Mystery Border',
            description: 'Locked border',
            rarity: 'epic',
            asset_url: '/uploads/cosmetics/mystery.png',
            preview_asset_url: '/uploads/cosmetics/mystery_preview.png',
            title_text: null,
            unlock_type: 'achievement',
            achievement_key: 'hidden_ach',
            tab_price: 0,
            active: true,
            sort_order: 1,
            created_at: '2026-03-06T00:00:00.000Z',
          },
        ],
      };
    }
    if (method === 'GET' && path === '/achievements?key=in.(hidden_ach)&select=id,key,is_hidden,rules') {
      return {
        status: 200,
        body: [{ id: 'a1', key: 'hidden_ach', is_hidden: true, rules: { count: 5 } }],
      };
    }
    if (path.startsWith('/user_achievements?')) {
      throw new Error('Should not query user progress for unauthenticated request');
    }
    throw new Error(`Unhandled rest path: ${path}`);
  }, { withSoftAuth: false });

  const server = app.listen(0);
  try {
    const out = await requestJson(server, 'GET', '/api/cosmetics');
    assert.equal(out.status, 200);
    assert.equal(out.body.data[0].achievement_hidden, true);
    assert.equal(out.body.data[0].achievement_progress_current, null);
    assert.equal(out.body.data[0].achievement_progress_target, 5);
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
        body: [{ equipped_border_id: null, equipped_title_id: '00000000-0000-4000-8000-000000000099', equipped_avatar_id: null }],
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
        body: [{ equipped_border_id: null, equipped_title_id: '00000000-0000-4000-8000-000000000001', equipped_avatar_id: null }],
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

test('POST /api/cosmetics/equip unequip avatar slot with cosmetic_id null', async () => {
  const app = createApi(async (method, path, opts = {}) => {
    if (method === 'PATCH' && path === '/profiles?id=eq.user-123') {
      const body = JSON.parse(opts.body || '{}');
      assert.equal(body.equipped_avatar_id, null);
      return {
        status: 200,
        body: [{ equipped_border_id: null, equipped_title_id: null, equipped_avatar_id: null }],
      };
    }
    throw new Error(`Unhandled rest call: ${method} ${path}`);
  });

  const server = app.listen(0);
  try {
    const out = await requestJson(server, 'POST', '/api/cosmetics/equip', {
      slot: 'avatar',
      cosmetic_id: null,
    });
    assert.equal(out.status, 200);
    assert.equal(out.body?.data?.slot, 'avatar');
    assert.equal(out.body?.data?.cosmetic_id, null);
    assert.equal(out.body?.data?.equipped_avatar_id, null);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /api/cosmetics/equip infers slot avatar from cosmetic type', async () => {
  const avatarCosmeticId = '00000000-0000-4000-8000-0000000000a1';
  const app = createApi(async (method, path, opts = {}) => {
    if (method === 'GET' && path === `/cosmetics?id=eq.${encodeURIComponent(avatarCosmeticId)}&select=id,type,active&limit=1`) {
      return {
        status: 200,
        body: [{ id: avatarCosmeticId, type: 'avatar', active: true }],
      };
    }
    if (method === 'GET' && path === `/user_cosmetics?user_id=eq.user-123&cosmetic_id=eq.${encodeURIComponent(avatarCosmeticId)}&select=id&limit=1`) {
      return { status: 200, body: [{ id: 'owned-av' }] };
    }
    if (method === 'PATCH' && path === '/profiles?id=eq.user-123') {
      const body = JSON.parse(opts.body || '{}');
      assert.equal(body.equipped_avatar_id, avatarCosmeticId);
      return {
        status: 200,
        body: [{ equipped_border_id: null, equipped_title_id: null, equipped_avatar_id: avatarCosmeticId }],
      };
    }
    throw new Error(`Unhandled rest call: ${method} ${path}`);
  });

  const server = app.listen(0);
  try {
    const out = await requestJson(server, 'POST', '/api/cosmetics/equip', {
      cosmetic_id: avatarCosmeticId,
    });
    assert.equal(out.status, 200);
    assert.equal(out.body?.data?.slot, 'avatar');
    assert.equal(out.body?.data?.cosmetic_id, avatarCosmeticId);
    assert.equal(out.body?.data?.equipped_avatar_id, avatarCosmeticId);
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
    if (path === '/profiles?id=eq.user-123&select=equipped_border_id,equipped_title_id,equipped_avatar_id&limit=1') {
      return {
        status: 200,
        body: [{ equipped_border_id: '00000000-0000-4000-8000-000000000001', equipped_title_id: null, equipped_avatar_id: null }],
      };
    }
    if (path === '/cosmetics?id=in.(00000000-0000-4000-8000-000000000001)&select=id,key,type,name,description,rarity,asset_url,preview_asset_url,title_text,unlock_type,achievement_key,tab_price,active,sort_order,border_fit,created_at') {
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

test('validateCosmeticPatch accepts border_fit (object and null)', async () => {
  const vNull = await validateCosmeticPatch({ border_fit: null });
  assert.equal(vNull.valid, true);
  assert.equal(vNull.data.border_fit, null);

  const vObj = await validateCosmeticPatch({
    border_fit: { scale: 1.15, rotationDeg: -5, offsetX: 0.02, offsetY: -0.01, avatarScale: 0.65 },
  });
  assert.equal(vObj.valid, true);
  assert.equal(vObj.data.border_fit.scale, 1.15);
  assert.equal(vObj.data.border_fit.rotationDeg, -5);
  assert.equal(vObj.data.border_fit.offsetX, 0.02);
  assert.equal(vObj.data.border_fit.offsetY, -0.01);
  assert.equal(vObj.data.border_fit.avatarScale, 0.65);

  const vObjNoAvatar = await validateCosmeticPatch({
    border_fit: { scale: 1, rotationDeg: 0, offsetX: 0, offsetY: 0 },
  });
  assert.equal(vObjNoAvatar.valid, true);
  assert.equal(vObjNoAvatar.data.border_fit.avatarScale, undefined);

  const vBad = await validateCosmeticPatch({ border_fit: { scale: 1 } });
  assert.equal(vBad.valid, false);
  assert.match(vBad.error, /rotationDeg|offsetX|offsetY/);

  const vRange = await validateCosmeticPatch({ border_fit: { scale: 10, rotationDeg: 0, offsetX: 0, offsetY: 0 } });
  assert.equal(vRange.valid, false);
  assert.match(vRange.error, /scale/);
});
