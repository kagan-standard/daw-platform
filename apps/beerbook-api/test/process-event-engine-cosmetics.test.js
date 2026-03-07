const test = require('node:test');
const assert = require('node:assert/strict');

const { processEvent } = require('../lib/processEventEngine');

test('rating_submitted auto-grants linked border cosmetic via idempotent insert', async () => {
  const calls = [];
  const rest = async (method, path, opts = {}) => {
    calls.push({ method, path, opts });

    if (
      method === 'GET' &&
      path === '/achievements?trigger_type=eq.rating_submitted&active=eq.true&select=id,key,name,reward_tabs,subtype,rules'
    ) {
      return {
        status: 200,
        body: [
          {
            id: 'ach-1',
            key: 'first_checkin',
            name: 'First Check-in',
            reward_tabs: 0,
            subtype: 'checkin_count',
            rules: { min_checkins: 1 },
          },
        ],
      };
    }

    if (method === 'GET' && path === '/ratings?user_id=eq.user-123&select=id') {
      return {
        status: 200,
        body: [],
        headers: { 'content-range': '0-0/1' },
      };
    }

    if (method === 'POST' && path === '/user_achievements') {
      return { status: 201, body: [{ id: 'ua-1' }] };
    }

    if (
      method === 'GET' &&
      path === '/cosmetics?achievement_key=eq.first_checkin&type=eq.border&select=id&limit=1'
    ) {
      return { status: 200, body: [{ id: 'cos-border-1' }] };
    }

    if (method === 'POST' && path === '/user_cosmetics?on_conflict=user_id,cosmetic_id') {
      return { status: 201, body: [{ id: 'uc-1' }] };
    }

    if (method === 'GET' && path === '/profiles?id=eq.user-123&select=tabs_balance&limit=1') {
      return { status: 200, body: [{ tabs_balance: 25 }] };
    }

    throw new Error(`Unhandled rest call: ${method} ${path}`);
  };

  const result = await processEvent(
    { rest, totalFromContentRange: (range) => Number(String(range).split('/')[1] || 0) },
    'rating_submitted',
    null,
    { rating_id: 'r-1' },
    'user-123'
  );

  assert.equal(result.tabs_delta, 0);
  assert.equal(result.tabs_balance, 25);
  assert.deepEqual(result.unlocked, [{ key: 'first_checkin', name: 'First Check-in', reward_tabs: 0 }]);

  const grantCall = calls.find((call) => call.path === '/user_cosmetics?on_conflict=user_id,cosmetic_id');
  assert.ok(grantCall, 'expected user_cosmetics grant call');
  assert.equal(grantCall.opts?.headers?.Prefer, 'resolution=ignore-duplicates');
  assert.deepEqual(JSON.parse(grantCall.opts?.body || '{}'), {
    user_id: 'user-123',
    cosmetic_id: 'cos-border-1',
    acquired_via: 'achievement',
  });
});
