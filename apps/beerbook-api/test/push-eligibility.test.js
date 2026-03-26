const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluatePushEligibility } = require('../lib/pushEligibility');

test('allows allowlisted type with active token', () => {
  const out = evaluatePushEligibility({
    notification: { notification_type: 'streak_at_risk' },
    hasActiveToken: true,
    deliveryStatus: 'queued',
  });
  assert.equal(out.eligible, true);
});

test('blocks unknown type fail-closed', () => {
  const out = evaluatePushEligibility({
    notification: { notification_type: 'brand_new_type' },
    hasActiveToken: true,
    deliveryStatus: 'queued',
  });
  assert.equal(out.eligible, false);
  assert.equal(out.reason, 'notification_type_not_allowlisted');
});

test('blocks terminal states', () => {
  const out = evaluatePushEligibility({
    notification: { notification_type: 'streak_at_risk' },
    hasActiveToken: true,
    deliveryStatus: 'receipt_ok',
  });
  assert.equal(out.eligible, false);
  assert.equal(out.reason, 'terminal_delivery_state');
});
