const test = require('node:test');
const assert = require('node:assert/strict');

const { runOnce } = require('../scripts/push-dispatch');

const PUSH_CATALOG_FIXTURE_TYPES = [
  'streak_at_risk',
  'approaching_demotion',
  'tier_promotion',
  'tabs_earned',
  'beer_approved',
  'weekly_summary',
];

function createDispatcherHarness(seed = {}) {
  const now = Date.now();
  const tokens = new Map((seed.tokens || []).map((t) => [t.id, { ...t }]));
  const states = (seed.states || []).map((s) => ({ ...s }));
  const attempts = [];
  const ineligible = [];
  const deactivations = [];

  async function rest(method, path, body) {
    if (method === 'GET' && path.startsWith('/push_notification_catalog')) {
      return PUSH_CATALOG_FIXTURE_TYPES.map((notification_type) => ({ notification_type }));
    }
    if (method === 'GET' && path.startsWith('/push_notification_push_toggle')) {
      return PUSH_CATALOG_FIXTURE_TYPES.map((notification_type) => ({ notification_type, push_enabled: true }));
    }
    if (method === 'POST' && path === '/rpc/claim_push_dispatch_batch') {
      const batchSize = Number(body?.p_batch_size || 50);
      const claimable = states
        .filter((s) => (
          (s.delivery_status === 'queued' || s.delivery_status === 'retryable_failure')
          && s.claim_status !== 'claimed'
          && (!s.next_attempt_at || new Date(s.next_attempt_at).getTime() <= now)
          && tokens.get(s.token_id)?.is_active
        ))
        .slice(0, batchSize);
      for (const row of claimable) {
        row.claim_status = 'claimed';
        row.delivery_status = 'claimed';
      }
      return claimable.map((row) => ({
        ...row,
        expo_push_token: tokens.get(row.token_id)?.expo_push_token || null,
      }));
    }

    if (method === 'POST' && path === '/rpc/mark_push_pair_ineligible') {
      ineligible.push({ ...body });
      const state = states.find((s) => s.notification_id === body.p_notification_id && s.token_id === body.p_token_id);
      if (state) {
        state.delivery_status = 'permanent_failure';
        state.claim_status = 'claimed';
        state.last_error_code = 'ineligible';
        state.last_error_message = body.p_reason;
      }
      return null;
    }

    if (method === 'POST' && path === '/rpc/record_push_send_attempt') {
      attempts.push({ ...body });
      const state = states.find((s) => s.notification_id === body.p_notification_id && s.token_id === body.p_token_id);
      if (state) {
        state.attempt_count = Number(state.attempt_count || 0) + 1;
        state.delivery_status = body.p_status;
        state.claim_status = body.p_status === 'retryable_failure' ? 'queued' : 'claimed';
        state.next_attempt_at = body.p_next_attempt_at || state.next_attempt_at;
      }
      return [{ attempt_no: state?.attempt_count || 1, delivery_status: body.p_status }];
    }

    if (method === 'PATCH' && path.startsWith('/push_tokens?')) {
      const idMatch = path.match(/id=eq\.([^&]+)/);
      const tokenId = idMatch ? decodeURIComponent(idMatch[1]) : null;
      const token = tokenId ? tokens.get(tokenId) : null;
      if (token && token.is_active) {
        token.is_active = false;
        token.deactivation_reason = body.deactivation_reason;
        deactivations.push({ token_id: tokenId, reason: body.deactivation_reason });
      }
      return [];
    }

    throw new Error(`Unhandled rest call: ${method} ${path}`);
  }

  return { rest, tokens, states, attempts, ineligible, deactivations };
}

test('push dispatch integration: allowlisted notification is sent_to_expo', async () => {
  const h = createDispatcherHarness({
    tokens: [{ id: 'tok-1', expo_push_token: 'ExponentPushToken[token-1]', is_active: true }],
    states: [{
      notification_id: 'notif-1',
      token_id: 'tok-1',
      notification_type: 'streak_at_risk',
      title: 'Streak at risk',
      message: '2 ratings needed',
      target_type: 'tabs_profile',
      target_id: 'user-1',
      user_id: 'user-1',
      claim_status: 'queued',
      delivery_status: 'queued',
      attempt_count: 0,
      next_attempt_at: new Date(Date.now() - 1000).toISOString(),
    }],
  });

  const out = await runOnce({
    restFn: h.rest,
    sendFn: async () => [{ status: 'ok', id: 'ticket-1' }],
  });

  assert.equal(out.sent_to_expo, 1);
  assert.equal(h.attempts.length, 1);
  assert.equal(h.attempts[0].p_status, 'sent_to_expo');
});

test('push dispatch integration: non-allowlisted notification is fail-closed ineligible', async () => {
  const h = createDispatcherHarness({
    tokens: [{ id: 'tok-2', expo_push_token: 'ExponentPushToken[token-2]', is_active: true }],
    states: [{
      notification_id: 'notif-2',
      token_id: 'tok-2',
      notification_type: 'beer_rejected',
      title: 'Rejected',
      message: 'In-app only type',
      target_type: 'beer',
      target_id: 'beer-1',
      user_id: 'user-2',
      claim_status: 'queued',
      delivery_status: 'queued',
      attempt_count: 0,
      next_attempt_at: new Date(Date.now() - 1000).toISOString(),
    }],
  });

  const out = await runOnce({
    restFn: h.rest,
    sendFn: async () => {
      throw new Error('sendFn should not be called for ineligible rows');
    },
  });

  assert.equal(out.sent_to_expo, 0);
  assert.equal(h.ineligible.length, 1);
  assert.equal(h.ineligible[0].p_reason, 'notification_type_not_allowlisted');
});

test('push dispatch integration: DeviceNotRegistered deactivates token and marks permanent_failure', async () => {
  const h = createDispatcherHarness({
    tokens: [{ id: 'tok-3', expo_push_token: 'ExponentPushToken[token-3]', is_active: true }],
    states: [{
      notification_id: 'notif-3',
      token_id: 'tok-3',
      notification_type: 'tier_promotion',
      title: 'Promotion',
      message: 'Congrats',
      target_type: 'tabs_profile',
      target_id: 'user-3',
      user_id: 'user-3',
      claim_status: 'queued',
      delivery_status: 'queued',
      attempt_count: 0,
      next_attempt_at: new Date(Date.now() - 1000).toISOString(),
    }],
  });

  const out = await runOnce({
    restFn: h.rest,
    sendFn: async () => [{
      status: 'error',
      message: 'The device is no longer registered',
      details: { error: 'DeviceNotRegistered' },
    }],
  });

  assert.equal(out.permanent_failure, 1);
  assert.equal(h.attempts[0].p_status, 'permanent_failure');
  assert.equal(h.deactivations.length, 1);
  assert.equal(h.tokens.get('tok-3').is_active, false);
});

test('push dispatch integration: retryable provider failure records retryable_failure with next_attempt_at', async () => {
  const h = createDispatcherHarness({
    tokens: [{ id: 'tok-4', expo_push_token: 'ExponentPushToken[token-4]', is_active: true }],
    states: [{
      notification_id: 'notif-4',
      token_id: 'tok-4',
      notification_type: 'streak_at_risk',
      title: 'Risk',
      message: 'Soon',
      target_type: 'tabs_profile',
      target_id: 'user-4',
      user_id: 'user-4',
      claim_status: 'queued',
      delivery_status: 'queued',
      attempt_count: 0,
      next_attempt_at: new Date(Date.now() - 1000).toISOString(),
    }],
  });

  const out = await runOnce({
    restFn: h.rest,
    sendFn: async () => [{ status: 'error', message: 'Expo temporary outage' }],
  });

  assert.equal(out.retryable_failure, 1);
  assert.equal(h.attempts[0].p_status, 'retryable_failure');
  assert.ok(h.attempts[0].p_next_attempt_at);
});

test('push dispatch integration: already-claimed and finalized rows are not resent', async () => {
  const h = createDispatcherHarness({
    tokens: [
      { id: 'tok-5', expo_push_token: 'ExponentPushToken[token-5]', is_active: true },
      { id: 'tok-6', expo_push_token: 'ExponentPushToken[token-6]', is_active: true },
      { id: 'tok-7', expo_push_token: 'ExponentPushToken[token-7]', is_active: true },
    ],
    states: [
      {
        notification_id: 'notif-5',
        token_id: 'tok-5',
        notification_type: 'streak_at_risk',
        title: 'Queued',
        message: 'Only this should send',
        target_type: 'tabs_profile',
        target_id: 'user-5',
        user_id: 'user-5',
        claim_status: 'queued',
        delivery_status: 'queued',
        attempt_count: 0,
        next_attempt_at: new Date(Date.now() - 1000).toISOString(),
      },
      {
        notification_id: 'notif-6',
        token_id: 'tok-6',
        notification_type: 'streak_at_risk',
        title: 'Claimed',
        message: 'Should not be claimed again',
        target_type: 'tabs_profile',
        target_id: 'user-6',
        user_id: 'user-6',
        claim_status: 'claimed',
        delivery_status: 'claimed',
        attempt_count: 1,
        next_attempt_at: new Date(Date.now() - 1000).toISOString(),
      },
      {
        notification_id: 'notif-7',
        token_id: 'tok-7',
        notification_type: 'streak_at_risk',
        title: 'Finalized',
        message: 'Already done',
        target_type: 'tabs_profile',
        target_id: 'user-7',
        user_id: 'user-7',
        claim_status: 'claimed',
        delivery_status: 'receipt_ok',
        attempt_count: 1,
        next_attempt_at: new Date(Date.now() - 1000).toISOString(),
      },
    ],
  });

  let sentCount = 0;
  const out = await runOnce({
    restFn: h.rest,
    sendFn: async (messages) => {
      sentCount = messages.length;
      return [{ status: 'ok', id: 'ticket-5' }];
    },
  });

  assert.equal(out.claimed, 1);
  assert.equal(sentCount, 1);
  assert.equal(h.attempts.length, 1);
  assert.equal(h.attempts[0].p_notification_id, 'notif-5');
});
