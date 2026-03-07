const test = require('node:test');
const assert = require('node:assert/strict');

const { processEvent } = require('../lib/processEventEngine');

test('rating_submitted auto-grants linked border cosmetic via atomic RPC', async () => {
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

    if (method === 'POST' && path === '/rpc/unlock_achievement_with_rewards') {
      const body = JSON.parse(opts.body || '{}');
      assert.equal(body.p_user_id, 'user-123');
      assert.equal(body.p_achievement_id, 'ach-1');
      assert.equal(body.p_achievement_key, 'first_checkin');
      assert.equal(body.p_reward_tabs, 0);
      return {
        status: 200,
        body: { already_unlocked: false, reward_tabs_granted: 0, cosmetic_ids_granted: ['cos-border-1'] },
      };
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

  const rpcCalls = calls.filter((call) => call.path === '/rpc/unlock_achievement_with_rewards');
  assert.equal(rpcCalls.length, 1, 'expected exactly one atomic RPC call');
});

test('rating_award refreshes streak cache even when weekly cap blocks tabs award', async () => {
  const calls = [];
  const rest = async (method, path, opts = {}) => {
    calls.push({ method, path, opts });

    if (
      method === 'GET' &&
      path.startsWith('/tabs_ledger?user_id=eq.user-123&event_type=eq.rating_award&created_at=gte.') &&
      path.endsWith('&select=id')
    ) {
      return {
        status: 200,
        body: [],
        headers: { 'content-range': '0-0/10' },
      };
    }

    if (method === 'POST' && path === '/rpc/refresh_rating_award_profile_cache') {
      return {
        status: 200,
        body: [{
          current_streak_weeks: 5,
          longest_streak_weeks: 7,
        }],
      };
    }

    if (method === 'GET' && path === '/profiles?id=eq.user-123&select=tabs_balance&limit=1') {
      return { status: 200, body: [{ tabs_balance: 25 }] };
    }

    throw new Error(`Unhandled rest call: ${method} ${path}`);
  };

  const result = await processEvent(
    { rest, totalFromContentRange: (range) => Number(String(range).split('/')[1] || 0) },
    'rating_award',
    '3001f17b-e3ce-4d4c-b6e4-a6f89030588f',
    { amount: 9, breakdown: { rating_base: 9 }, context: { rating_id: 'r-1' } },
    'user-123'
  );

  assert.equal(result.tabs_delta, 0);
  assert.equal(result.tabs_balance, 25);
  assert.equal(result.current_streak_weeks, 5);
  assert.equal(result.longest_streak_weeks, 7);

  assert.equal(calls.some((call) => call.path === '/tabs_ledger'), false);
  const rpcCall = calls.find((call) => call.path === '/rpc/refresh_rating_award_profile_cache');
  assert.ok(rpcCall, 'expected profile cache refresh RPC');
  assert.deepEqual(JSON.parse(rpcCall.opts?.body || '{}'), {
    p_user_id: 'user-123',
    p_tabs_delta: 0,
  });
});

test('achievement with border AND title cosmetics grants both types via atomic RPC', async () => {
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
            id: 'ach-multi',
            key: 'beer_explorer',
            name: 'Beer Explorer',
            reward_tabs: 5,
            subtype: 'checkin_count',
            rules: { min_checkins: 1 },
          },
        ],
      };
    }

    if (method === 'GET' && path === '/ratings?user_id=eq.user-456&select=id') {
      return { status: 200, body: [], headers: { 'content-range': '0-0/3' } };
    }

    if (method === 'POST' && path === '/rpc/unlock_achievement_with_rewards') {
      const body = JSON.parse(opts.body || '{}');
      assert.equal(body.p_user_id, 'user-456');
      assert.equal(body.p_achievement_id, 'ach-multi');
      assert.equal(body.p_achievement_key, 'beer_explorer');
      assert.equal(body.p_reward_tabs, 5);
      return {
        status: 200,
        body: { already_unlocked: false, reward_tabs_granted: 5, cosmetic_ids_granted: ['cos-border-10', 'cos-title-10'] },
      };
    }

    if (method === 'GET' && path === '/profiles?id=eq.user-456&select=tabs_balance&limit=1') {
      return { status: 200, body: [{ tabs_balance: 30 }] };
    }

    throw new Error(`Unhandled rest call: ${method} ${path}`);
  };

  const result = await processEvent(
    { rest, totalFromContentRange: (range) => Number(String(range).split('/')[1] || 0) },
    'rating_submitted',
    null,
    { rating_id: 'r-multi' },
    'user-456'
  );

  assert.equal(result.tabs_delta, 5);
  assert.equal(result.tabs_balance, 30);
  assert.deepEqual(result.unlocked, [{ key: 'beer_explorer', name: 'Beer Explorer', reward_tabs: 5 }]);

  const rpcCalls = calls.filter((c) => c.path === '/rpc/unlock_achievement_with_rewards');
  assert.equal(rpcCalls.length, 1, 'expected exactly one atomic RPC call');
});

test('achievement with no linked cosmetics still unlocks without error', async () => {
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
            id: 'ach-none',
            key: 'no_cosmetics',
            name: 'No Cosmetics',
            reward_tabs: 0,
            subtype: 'checkin_count',
            rules: { min_checkins: 1 },
          },
        ],
      };
    }

    if (method === 'GET' && path === '/ratings?user_id=eq.user-789&select=id') {
      return { status: 200, body: [], headers: { 'content-range': '0-0/1' } };
    }

    if (method === 'POST' && path === '/rpc/unlock_achievement_with_rewards') {
      return {
        status: 200,
        body: { already_unlocked: false, reward_tabs_granted: 0, cosmetic_ids_granted: [] },
      };
    }

    if (method === 'GET' && path === '/profiles?id=eq.user-789&select=tabs_balance&limit=1') {
      return { status: 200, body: [{ tabs_balance: 0 }] };
    }

    throw new Error(`Unhandled rest call: ${method} ${path}`);
  };

  const result = await processEvent(
    { rest, totalFromContentRange: (range) => Number(String(range).split('/')[1] || 0) },
    'rating_submitted',
    null,
    { rating_id: 'r-none' },
    'user-789'
  );

  assert.deepEqual(result.unlocked, [{ key: 'no_cosmetics', name: 'No Cosmetics', reward_tabs: 0 }]);
  const rpcCalls = calls.filter((c) => c.path === '/rpc/unlock_achievement_with_rewards');
  assert.equal(rpcCalls.length, 1, 'atomic RPC called even with no cosmetics');
});

test('already-unlocked achievement is skipped (idempotent re-evaluation)', async () => {
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
            id: 'ach-dup',
            key: 'dup_check',
            name: 'Duplicate Check',
            reward_tabs: 10,
            subtype: 'checkin_count',
            rules: { min_checkins: 1 },
          },
        ],
      };
    }

    if (method === 'GET' && path === '/ratings?user_id=eq.user-dup&select=id') {
      return { status: 200, body: [], headers: { 'content-range': '0-0/5' } };
    }

    if (method === 'POST' && path === '/rpc/unlock_achievement_with_rewards') {
      return {
        status: 200,
        body: { already_unlocked: true, reward_tabs_granted: 0, cosmetic_ids_granted: [] },
      };
    }

    if (method === 'GET' && path === '/profiles?id=eq.user-dup&select=tabs_balance&limit=1') {
      return { status: 200, body: [{ tabs_balance: 50 }] };
    }

    throw new Error(`Unhandled rest call: ${method} ${path}`);
  };

  const result = await processEvent(
    { rest, totalFromContentRange: (range) => Number(String(range).split('/')[1] || 0) },
    'rating_submitted',
    null,
    { rating_id: 'r-dup' },
    'user-dup'
  );

  assert.deepEqual(result.unlocked, [], 'already-unlocked achievement not in unlocked list');
  assert.equal(result.tabs_delta, 0, 'no tabs awarded for already-unlocked');
});

test('atomic RPC failure propagates as hard error (tabs_ledger failure)', async () => {
  const rest = async (method, path, opts = {}) => {
    if (
      method === 'GET' &&
      path === '/achievements?trigger_type=eq.rating_submitted&active=eq.true&select=id,key,name,reward_tabs,subtype,rules'
    ) {
      return {
        status: 200,
        body: [
          {
            id: 'ach-fail',
            key: 'fail_test',
            name: 'Fail Test',
            reward_tabs: 5,
            subtype: 'checkin_count',
            rules: { min_checkins: 1 },
          },
        ],
      };
    }

    if (method === 'GET' && path === '/ratings?user_id=eq.user-fail&select=id') {
      return { status: 200, body: [], headers: { 'content-range': '0-0/2' } };
    }

    if (method === 'POST' && path === '/rpc/unlock_achievement_with_rewards') {
      return { status: 500, body: { message: 'tabs_ledger constraint violation' } };
    }

    throw new Error(`Unhandled rest call: ${method} ${path}`);
  };

  await assert.rejects(
    () =>
      processEvent(
        { rest, totalFromContentRange: (range) => Number(String(range).split('/')[1] || 0) },
        'rating_submitted',
        null,
        { rating_id: 'r-fail' },
        'user-fail'
      ),
    (err) => {
      assert.ok(err.message.includes('unlock_achievement_with_rewards'), `expected RPC error, got: ${err.message}`);
      return true;
    }
  );
});
