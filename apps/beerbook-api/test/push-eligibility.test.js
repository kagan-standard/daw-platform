const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluatePushEligibility, resolvePushAllowlist, createNoOpPushHooks } = require('../lib/pushEligibility');

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

test('resolvePushAllowlist merges PUSH_ALLOWLIST_EXTRA', () => {
  const set = resolvePushAllowlist({ PUSH_ALLOWLIST_EXTRA: 'beer_rejected, tier_demotion' });
  assert.equal(set.has('beer_approved'), true);
  assert.equal(set.has('beer_rejected'), true);
  assert.equal(set.has('tier_demotion'), true);
});

test('createNoOpPushHooks always passes', () => {
  const hooks = createNoOpPushHooks();
  const out = evaluatePushEligibility({
    notification: { notification_type: 'streak_at_risk' },
    hasActiveToken: true,
    deliveryStatus: 'queued',
    hooks,
  });
  assert.equal(out.eligible, true);
});
