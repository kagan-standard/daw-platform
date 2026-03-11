/**
 * Unit tests for guest/actor identity: validateGuestId, resolveActor.
 * Guest ratings feature (ENABLE_GUEST_RATINGS).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateGuestId,
  resolveActor,
  GUEST_ID_REGEX,
} = require('../lib/actorIdentity');

test('validateGuestId accepts UUID v4 with hyphens', () => {
  const id = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
  const result = validateGuestId(id);
  assert.equal(result.valid, true);
  assert.equal(result.value, id);
});

test('validateGuestId accepts UUID v4 without hyphens', () => {
  const id = 'a1b2c3d4e5f64a7b8c9d0e1f2a3b4c5d';
  const result = validateGuestId(id);
  assert.equal(result.valid, true);
  assert.equal(result.value, id);
});

test('validateGuestId rejects null and undefined', () => {
  assert.equal(validateGuestId(null).valid, false);
  assert.equal(validateGuestId(undefined).valid, false);
});

test('validateGuestId rejects empty string', () => {
  const result = validateGuestId('');
  assert.equal(result.valid, false);
  assert.ok(result.error && result.error.includes('empty'));
});

test('validateGuestId rejects non-UUID strings', () => {
  assert.equal(validateGuestId('not-a-uuid').valid, false);
  assert.equal(validateGuestId('123').valid, false);
  assert.equal(validateGuestId('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx').valid, false); // invalid variant
});

test('validateGuestId trims whitespace', () => {
  const id = '  a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d  ';
  const result = validateGuestId(id);
  assert.equal(result.valid, true);
  assert.equal(result.value, id.trim());
});

test('GUEST_ID_REGEX matches valid UUID v4', () => {
  assert.ok(GUEST_ID_REGEX.test('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'));
  assert.ok(GUEST_ID_REGEX.test('a1b2c3d4e5f64a7b8c9d0e1f2a3b4c5d'));
});

test('resolveActor returns user when req.claims.sub is set', () => {
  const req = {
    claims: { sub: 'user-123', preferred_username: 'alice', email: 'a@b.com' },
    headers: {},
    body: {},
  };
  const actor = resolveActor(req);
  assert.equal(actor.type, 'user');
  assert.equal(actor.sub, 'user-123');
  assert.equal(actor.preferred_username, 'alice');
});

test('resolveActor returns guest when no claims and valid X-Guest-Id (ENABLE_GUEST_RATINGS)', () => {
  const guestId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
  const req = {
    claims: null,
    headers: { 'x-guest-id': guestId },
    body: {},
  };
  const actor = resolveActor(req);
  if (process.env.ENABLE_GUEST_RATINGS === 'true' || process.env.ENABLE_GUEST_RATINGS === '1') {
    assert.equal(actor.type, 'guest');
    assert.equal(actor.guest_id, guestId);
  } else {
    assert.equal(actor.type, null);
    assert.ok(actor.error);
  }
});
