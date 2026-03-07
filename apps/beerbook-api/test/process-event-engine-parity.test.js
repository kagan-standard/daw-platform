/**
 * Parity test suite — verifies that Node and Edge process-event engines
 * produce identical response shapes and side effects for identical inputs.
 *
 * These tests exercise the Node engine directly (via mock rest()) and assert
 * that its response shape matches the canonical contract that the Edge engine
 * also conforms to after the 2.1 parity fix.
 *
 * The canonical response shape for all event types:
 *   { unlocked: [], tabs_delta: number, tabs_balance: number,
 *     current_streak_weeks: number|null, longest_streak_weeks: number|null }
 *
 * For rating_award specifically, both runtimes must:
 *   1. Call refresh_rating_award_profile_cache RPC
 *   2. Return current_streak_weeks / longest_streak_weeks from that RPC
 *   3. Always call the RPC even when weekly cap blocks the award
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { processEvent } = require('../lib/processEventEngine');

const CANONICAL_KEYS = [
  'unlocked',
  'tabs_delta',
  'tabs_balance',
  'current_streak_weeks',
  'longest_streak_weeks',
];

function totalFromContentRange(range) {
  return Number(String(range).split('/')[1] || 0);
}

function assertCanonicalShape(result, label) {
  for (const key of CANONICAL_KEYS) {
    assert.ok(
      key in result,
      `${label}: missing key "${key}" in response`
    );
  }
  assert.ok(Array.isArray(result.unlocked), `${label}: unlocked must be array`);
  assert.equal(typeof result.tabs_delta, 'number', `${label}: tabs_delta must be number`);
  assert.equal(typeof result.tabs_balance, 'number', `${label}: tabs_balance must be number`);
  assert.ok(
    result.current_streak_weeks === null || typeof result.current_streak_weeks === 'number',
    `${label}: current_streak_weeks must be number or null`
  );
  assert.ok(
    result.longest_streak_weeks === null || typeof result.longest_streak_weeks === 'number',
    `${label}: longest_streak_weeks must be number or null`
  );
}

// ---------- rating_award: normal award under cap ----------

test('parity: rating_award under cap returns streak fields and canonical shape', async () => {
  const calls = [];
  const rest = async (method, path, opts = {}) => {
    calls.push({ method, path, opts });

    if (method === 'GET' && path.includes('/tabs_ledger?') && path.includes('event_type=eq.rating_award')) {
      return { status: 200, body: [], headers: { 'content-range': '0-0/3' } };
    }
    if (method === 'POST' && path === '/tabs_ledger') {
      return { status: 201, body: [{ id: 'ledger-1' }] };
    }
    if (method === 'POST' && path === '/rpc/refresh_rating_award_profile_cache') {
      return { status: 200, body: [{ current_streak_weeks: 4, longest_streak_weeks: 8 }] };
    }
    if (method === 'GET' && path.startsWith('/profiles?')) {
      return { status: 200, body: [{ tabs_balance: 100 }] };
    }
    throw new Error(`Unhandled: ${method} ${path}`);
  };

  const result = await processEvent(
    { rest, totalFromContentRange },
    'rating_award',
    'aaaaaaaa-bbbb-1ccc-8ddd-eeeeeeeeeeee',
    { amount: 9, breakdown: { rating_base: 9 }, context: { rating_id: 'r-1' } },
    'user-42'
  );

  assertCanonicalShape(result, 'rating_award under cap');
  assert.equal(result.tabs_delta, 9);
  assert.equal(result.tabs_balance, 100);
  assert.equal(result.current_streak_weeks, 4);
  assert.equal(result.longest_streak_weeks, 8);

  const rpcCall = calls.find((c) => c.path === '/rpc/refresh_rating_award_profile_cache');
  assert.ok(rpcCall, 'must call refresh_rating_award_profile_cache');
  const rpcBody = JSON.parse(rpcCall.opts.body);
  assert.equal(rpcBody.p_user_id, 'user-42');
  assert.equal(rpcBody.p_tabs_delta, 9);
});

// ---------- rating_award: cap reached, zero award, still calls RPC ----------

test('parity: rating_award at weekly cap still calls RPC and returns streak fields', async () => {
  const calls = [];
  const rest = async (method, path, opts = {}) => {
    calls.push({ method, path, opts });

    if (method === 'GET' && path.includes('/tabs_ledger?') && path.includes('event_type=eq.rating_award')) {
      return { status: 200, body: [], headers: { 'content-range': '0-0/10' } };
    }
    if (method === 'POST' && path === '/rpc/refresh_rating_award_profile_cache') {
      return { status: 200, body: [{ current_streak_weeks: 2, longest_streak_weeks: 5 }] };
    }
    if (method === 'GET' && path.startsWith('/profiles?')) {
      return { status: 200, body: [{ tabs_balance: 50 }] };
    }
    throw new Error(`Unhandled: ${method} ${path}`);
  };

  const result = await processEvent(
    { rest, totalFromContentRange },
    'rating_award',
    'aaaaaaaa-bbbb-1ccc-8ddd-eeeeeeeeeeee',
    { amount: 9, breakdown: {}, context: {} },
    'user-42'
  );

  assertCanonicalShape(result, 'rating_award at cap');
  assert.equal(result.tabs_delta, 0);
  assert.equal(result.current_streak_weeks, 2);
  assert.equal(result.longest_streak_weeks, 5);

  const rpcCall = calls.find((c) => c.path === '/rpc/refresh_rating_award_profile_cache');
  assert.ok(rpcCall, 'must call refresh_rating_award_profile_cache even at cap');
  assert.equal(JSON.parse(rpcCall.opts.body).p_tabs_delta, 0);

  const ledgerInsert = calls.find((c) => c.method === 'POST' && c.path === '/tabs_ledger');
  assert.equal(ledgerInsert, undefined, 'no tabs_ledger insert when at cap');
});

// ---------- rating_award: idempotent (conflict) still calls RPC ----------

test('parity: rating_award idempotent replay (conflict) still calls RPC', async () => {
  const calls = [];
  const rest = async (method, path, opts = {}) => {
    calls.push({ method, path, opts });

    if (method === 'GET' && path.includes('/tabs_ledger?') && path.includes('event_type=eq.rating_award')) {
      return { status: 200, body: [], headers: { 'content-range': '0-0/5' } };
    }
    if (method === 'POST' && path === '/tabs_ledger') {
      return { status: 409, body: { code: '23505', message: 'duplicate' } };
    }
    if (method === 'POST' && path === '/rpc/refresh_rating_award_profile_cache') {
      return { status: 200, body: [{ current_streak_weeks: 3, longest_streak_weeks: 3 }] };
    }
    if (method === 'GET' && path.startsWith('/profiles?')) {
      return { status: 200, body: [{ tabs_balance: 75 }] };
    }
    throw new Error(`Unhandled: ${method} ${path}`);
  };

  const result = await processEvent(
    { rest, totalFromContentRange },
    'rating_award',
    'aaaaaaaa-bbbb-1ccc-8ddd-eeeeeeeeeeee',
    { amount: 9, breakdown: {}, context: {} },
    'user-42'
  );

  assertCanonicalShape(result, 'rating_award conflict');
  assert.equal(result.tabs_delta, 0, 'conflict means zero delta');
  assert.equal(result.current_streak_weeks, 3);
  assert.equal(result.longest_streak_weeks, 3);
});

// ---------- rating_submitted: canonical shape (streaks null) ----------

test('parity: rating_submitted returns canonical shape with null streak fields', async () => {
  const rest = async (method, path) => {
    if (method === 'GET' && path.includes('/achievements?')) {
      return { status: 200, body: [] };
    }
    if (method === 'GET' && path.startsWith('/profiles?')) {
      return { status: 200, body: [{ tabs_balance: 10 }] };
    }
    throw new Error(`Unhandled: ${method} ${path}`);
  };

  const result = await processEvent(
    { rest, totalFromContentRange },
    'rating_submitted',
    null,
    { rating_id: 'r-1' },
    'user-42'
  );

  assertCanonicalShape(result, 'rating_submitted');
  assert.equal(result.current_streak_weeks, null, 'streak null for non-rating_award');
  assert.equal(result.longest_streak_weeks, null, 'streak null for non-rating_award');
});

// ---------- cheers_given: canonical shape (streaks null) ----------

test('parity: cheers_given returns canonical shape with null streak fields', async () => {
  const rest = async (method, path) => {
    if (method === 'POST' && path === '/tabs_ledger') {
      return { status: 201, body: [{ id: 'ledger-c' }] };
    }
    if (method === 'GET' && path.startsWith('/profiles?')) {
      return { status: 200, body: [{ tabs_balance: 20 }] };
    }
    throw new Error(`Unhandled: ${method} ${path}`);
  };

  const result = await processEvent(
    { rest, totalFromContentRange },
    'cheers_given',
    'aaaaaaaa-bbbb-1ccc-8ddd-eeeeeeeeeeee',
    { amount: 1, context: {} },
    'user-42'
  );

  assertCanonicalShape(result, 'cheers_given');
  assert.equal(result.current_streak_weeks, null);
  assert.equal(result.longest_streak_weeks, null);
});

// ---------- cheers_received: canonical shape (streaks null) ----------

test('parity: cheers_received returns canonical shape with null streak fields', async () => {
  const rest = async (method, path) => {
    if (method === 'POST' && path === '/tabs_ledger') {
      return { status: 201, body: [{ id: 'ledger-cr' }] };
    }
    if (method === 'GET' && path.startsWith('/profiles?')) {
      return { status: 200, body: [{ tabs_balance: 30 }] };
    }
    throw new Error(`Unhandled: ${method} ${path}`);
  };

  const result = await processEvent(
    { rest, totalFromContentRange },
    'cheers_received',
    'aaaaaaaa-bbbb-1ccc-8ddd-eeeeeeeeeeee',
    { amount: 1, target_user_id: 'receiver-1', context: {} },
    'user-42'
  );

  assertCanonicalShape(result, 'cheers_received');
  assert.equal(result.current_streak_weeks, null);
  assert.equal(result.longest_streak_weeks, null);
});

// ---------- rating_submitted with achievement unlock: canonical shape ----------

test('parity: rating_submitted with achievement unlock has canonical shape', async () => {
  const rest = async (method, path, opts = {}) => {
    if (method === 'GET' && path.includes('/achievements?')) {
      return {
        status: 200,
        body: [{
          id: 'ach-1', key: 'first_checkin', name: 'First Check-in',
          reward_tabs: 10, subtype: 'checkin_count', rules: { min_checkins: 1 },
        }],
      };
    }
    if (method === 'GET' && path.includes('/ratings?')) {
      return { status: 200, body: [], headers: { 'content-range': '0-0/1' } };
    }
    if (method === 'POST' && path === '/user_achievements') {
      return { status: 201, body: [{ id: 'ua-1' }] };
    }
    if (method === 'GET' && path.includes('/cosmetics?')) {
      return { status: 200, body: [{ id: 'cos-1' }] };
    }
    if (method === 'POST' && path.includes('/user_cosmetics')) {
      return { status: 201, body: [{ id: 'uc-1' }] };
    }
    if (method === 'POST' && path === '/tabs_ledger') {
      return { status: 201, body: [{ id: 'ledger-ach' }] };
    }
    if (method === 'GET' && path.startsWith('/profiles?')) {
      return { status: 200, body: [{ tabs_balance: 35 }] };
    }
    throw new Error(`Unhandled: ${method} ${path}`);
  };

  const result = await processEvent(
    { rest, totalFromContentRange },
    'rating_submitted',
    null,
    { rating_id: 'r-2' },
    'user-42'
  );

  assertCanonicalShape(result, 'rating_submitted with unlock');
  assert.equal(result.unlocked.length, 1);
  assert.equal(result.unlocked[0].key, 'first_checkin');
  assert.equal(result.tabs_delta, 10);
  assert.equal(result.current_streak_weeks, null);
  assert.equal(result.longest_streak_weeks, null);
});
