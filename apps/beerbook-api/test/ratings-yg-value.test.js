/**
 * Unit tests for POST /api/ratings yg_value validation (bidirectional scale -6 to 6).
 * Phase 4 of yg_scale_bidirectional_ratings_migration_addendum.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateYgValue, ygValueToStarRating, YG_ERROR } = require('../lib/ratingsValidation');

test('validateYgValue accepts integers -6 to 7 except zero', () => {
  for (const v of [-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7]) {
    const result = validateYgValue(v);
    assert.equal(result.valid, true, `yg_value ${v} should be valid`);
    assert.equal(result.value, v);
  }
});

test('validateYgValue rejects zero', () => {
  assert.deepEqual(validateYgValue(0), { valid: false, error: YG_ERROR });
});

test('validateYgValue rejects -7 and 8', () => {
  assert.deepEqual(validateYgValue(-7), { valid: false, error: YG_ERROR });
  assert.deepEqual(validateYgValue(8), { valid: false, error: YG_ERROR });
});

test('validateYgValue rejects non-integers', () => {
  assert.deepEqual(validateYgValue(3.5), { valid: false, error: YG_ERROR });
  assert.deepEqual(validateYgValue(-2.1), { valid: false, error: YG_ERROR });
  assert.deepEqual(validateYgValue(7.0), { valid: true, value: 7 }); // 7.0 is integer
});

test('validateYgValue rejects non-numeric and invalid values', () => {
  assert.deepEqual(validateYgValue('x'), { valid: false, error: YG_ERROR });
  assert.deepEqual(validateYgValue(''), { valid: false, error: YG_ERROR });
  assert.deepEqual(validateYgValue(NaN), { valid: false, error: YG_ERROR });
  assert.deepEqual(validateYgValue(Infinity), { valid: false, error: YG_ERROR });
  assert.deepEqual(validateYgValue(-Infinity), { valid: false, error: YG_ERROR });
});

test('validateYgValue accepts null/undefined (optional field)', () => {
  assert.deepEqual(validateYgValue(null), { valid: true, value: null });
  assert.deepEqual(validateYgValue(undefined), { valid: true, value: null });
});

test('error message mentions -6 to 7 and zero not allowed', () => {
  assert.ok(YG_ERROR.includes('-6') && YG_ERROR.includes('7'), 'error message must mention range');
  assert.ok(YG_ERROR.includes('zero'), 'error message must mention zero not allowed');
  const result = validateYgValue(0);
  assert.equal(result.error, 'yg_value must be an integer from -6 to 7 (zero not allowed)');
});

test('ygValueToStarRating: -6..-2 → 1, -1 → 2, 1..2 → 3, 3..6 → 4, 7 → 5', () => {
  assert.equal(ygValueToStarRating(-6), 1);
  assert.equal(ygValueToStarRating(-2), 1);
  assert.equal(ygValueToStarRating(-1), 2);
  assert.equal(ygValueToStarRating(1), 3);
  assert.equal(ygValueToStarRating(2), 3);
  assert.equal(ygValueToStarRating(3), 4);
  assert.equal(ygValueToStarRating(6), 4);
  assert.equal(ygValueToStarRating(7), 5);
});

test('ygValueToStarRating 0 returns 3 (invalid fallback)', () => {
  assert.equal(ygValueToStarRating(0), 3);
});

test('ygValueToStarRating null/undefined returns 3', () => {
  assert.equal(ygValueToStarRating(null), 3);
  assert.equal(ygValueToStarRating(undefined), 3);
});
