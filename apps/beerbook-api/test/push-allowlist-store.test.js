const test = require('node:test');
const assert = require('node:assert/strict');

const { mergePushAllowlist, normalizePushAllowlistRows } = require('../lib/pushAllowlistStore');

test('mergePushAllowlist: enabled types plus catalog-filtered EXTRA', () => {
  const bundle = normalizePushAllowlistRows(
    [{ notification_type: 'streak_at_risk' }, { notification_type: 'beer_rejected' }],
    [
      { notification_type: 'streak_at_risk', push_enabled: true },
      { notification_type: 'beer_rejected', push_enabled: false },
    ],
  );
  const set = mergePushAllowlist(bundle, { PUSH_ALLOWLIST_EXTRA: 'beer_rejected, unknown_type' });
  assert.equal(set.has('streak_at_risk'), true);
  assert.equal(set.has('beer_rejected'), true);
  assert.equal(set.has('unknown_type'), false);
});

test('mergePushAllowlist: ok false yields empty set', () => {
  const set = mergePushAllowlist({ ok: false, catalogTypes: new Set(['a']), enabledTypes: new Set(['a']) }, {
    PUSH_ALLOWLIST_EXTRA: 'a',
  });
  assert.equal(set.size, 0);
});

test('normalizePushAllowlistRows: only enabled and in catalog', () => {
  const bundle = normalizePushAllowlistRows(
    [{ notification_type: 'x' }],
    [{ notification_type: 'x', push_enabled: true }, { notification_type: 'y', push_enabled: true }],
  );
  assert.equal(bundle.ok, true);
  assert.equal(bundle.enabledTypes.has('x'), true);
  assert.equal(bundle.enabledTypes.has('y'), false);
});
