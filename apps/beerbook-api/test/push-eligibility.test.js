const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluatePushEligibility, createNoOpPushHooks } = require('../lib/pushEligibility');

const sampleAllowlist = new Set(['streak_at_risk', 'beer_approved']);

test('allows allowlisted type with active token', () => {
  const out = evaluatePushEligibility({
    notification: { notification_type: 'streak_at_risk' },
    hasActiveToken: true,
    deliveryStatus: 'queued',
    allowlist: sampleAllowlist,
  });
  assert.equal(out.eligible, true);
});

test('blocks unknown type fail-closed', () => {
  const out = evaluatePushEligibility({
    notification: { notification_type: 'brand_new_type' },
    hasActiveToken: true,
    deliveryStatus: 'queued',
    allowlist: sampleAllowlist,
  });
  assert.equal(out.eligible, false);
  assert.equal(out.reason, 'notification_type_not_allowlisted');
});

test('blocks terminal states', () => {
  const out = evaluatePushEligibility({
    notification: { notification_type: 'streak_at_risk' },
    hasActiveToken: true,
    deliveryStatus: 'receipt_ok',
    allowlist: sampleAllowlist,
  });
  assert.equal(out.eligible, false);
  assert.equal(out.reason, 'terminal_delivery_state');
});

test('default empty allowlist is fail-closed', () => {
  const out = evaluatePushEligibility({
    notification: { notification_type: 'streak_at_risk' },
    hasActiveToken: true,
    deliveryStatus: 'queued',
  });
  assert.equal(out.eligible, false);
  assert.equal(out.reason, 'notification_type_not_allowlisted');
});

test('createNoOpPushHooks always passes', () => {
  const hooks = createNoOpPushHooks();
  const out = evaluatePushEligibility({
    notification: { notification_type: 'streak_at_risk' },
    hasActiveToken: true,
    deliveryStatus: 'queued',
    allowlist: sampleAllowlist,
    hooks,
  });
  assert.equal(out.eligible, true);
});
