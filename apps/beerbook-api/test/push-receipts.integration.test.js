const test = require('node:test');
const assert = require('node:assert/strict');

const { runOnce } = require('../scripts/push-receipts');

function createReceiptHarness(seed = {}) {
  const attempts = [];
  const pending = [];
  const ineligible = [];
  const deactivations = [];

  async function rest(method, path, body) {
    if (method === 'POST' && path === '/rpc/claim_push_receipt_batch') {
      const rows = seed.claimRows || [];
      return rows.map((r) => ({ ...r }));
    }

    if (method === 'POST' && path === '/rpc/record_push_send_attempt') {
      attempts.push({ ...body });
      return [{ attempt_no: 1, delivery_status: body.p_status }];
    }

    if (method === 'POST' && path === '/rpc/mark_push_receipt_pending') {
      pending.push({ ...body });
      return null;
    }

    if (method === 'POST' && path === '/rpc/mark_push_pair_ineligible') {
      ineligible.push({ ...body });
      return null;
    }

    if (method === 'PATCH' && path.startsWith('/push_tokens?')) {
      const idMatch = path.match(/id=eq\.([^&]+)/);
      deactivations.push({ token_id: idMatch ? decodeURIComponent(idMatch[1]) : null, body });
      return [];
    }

    throw new Error(`Unhandled rest call: ${method} ${path}`);
  }

  return { rest, attempts, pending, ineligible, deactivations };
}

test('push receipts: ok finalizes receipt_ok', async () => {
  const h = createReceiptHarness({
    claimRows: [{
      notification_id: 'n1',
      token_id: 'tok-1',
      provider_ticket_id: 'tick-1',
      attempt_count: 1,
      notification_type: 'streak_at_risk',
    }],
  });

  const out = await runOnce({
    restFn: h.rest,
    receiptsFn: async () => ({ 'tick-1': { status: 'ok' } }),
  });

  assert.equal(out.receipt_ok, 1);
  assert.equal(h.attempts.length, 1);
  assert.equal(h.attempts[0].p_status, 'receipt_ok');
});

test('push receipts: missing receipt id schedules pending', async () => {
  const h = createReceiptHarness({
    claimRows: [{
      notification_id: 'n2',
      token_id: 'tok-2',
      provider_ticket_id: 'tick-2',
      attempt_count: 1,
      notification_type: 'beer_approved',
    }],
  });

  const out = await runOnce({
    restFn: h.rest,
    receiptsFn: async () => ({}),
  });

  assert.equal(out.pending, 1);
  assert.equal(h.pending.length, 1);
});

test('push receipts: DeviceNotRegistered deactivates token', async () => {
  const h = createReceiptHarness({
    claimRows: [{
      notification_id: 'n3',
      token_id: 'tok-3',
      provider_ticket_id: 'tick-3',
      attempt_count: 1,
      notification_type: 'tier_promotion',
    }],
  });

  const out = await runOnce({
    restFn: h.rest,
    receiptsFn: async () => ({
      'tick-3': {
        status: 'error',
        message: 'not registered',
        details: { error: 'DeviceNotRegistered' },
      },
    }),
  });

  assert.equal(out.permanent_failure, 1);
  assert.equal(h.attempts[0].p_status, 'permanent_failure');
  assert.equal(h.deactivations.length, 1);
});

test('push receipts: non-allowlisted type marks ineligible', async () => {
  const h = createReceiptHarness({
    claimRows: [{
      notification_id: 'n4',
      token_id: 'tok-4',
      provider_ticket_id: 'tick-4',
      attempt_count: 1,
      notification_type: 'beer_rejected',
    }],
  });

  const out = await runOnce({
    restFn: h.rest,
    receiptsFn: async () => ({ 'tick-4': { status: 'ok' } }),
  });

  assert.equal(out.ineligible, 1);
  assert.equal(h.ineligible[0].p_reason, 'notification_type_not_allowlisted');
});
