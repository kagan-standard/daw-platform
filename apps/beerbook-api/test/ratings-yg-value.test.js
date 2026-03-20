/**
 * Unit tests for POST /api/ratings yg_value validation (canonical scale: -1 or 1–10 in 0.5 steps).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateYgValue,
  ygValueToStarRating,
  YG_ERROR,
  YG_GRID_EPS,
} = require('../lib/ratingsValidation');

const validGrid = [];
for (let i = 2; i <= 20; i += 1) {
  validGrid.push(i / 2); // 1, 1.5, …, 10
}
const allValid = [-1, ...validGrid];

test('validateYgValue accepts -1 and 1..10 in half steps', () => {
  for (const v of allValid) {
    const result = validateYgValue(v);
    assert.equal(result.valid, true, `yg_value ${v} should be valid`);
    assert.equal(result.value, v);
  }
});

test('validateYgValue rejects zero', () => {
  assert.deepEqual(validateYgValue(0), { valid: false, error: YG_ERROR });
});

test('validateYgValue rejects out-of-range and legacy negatives', () => {
  assert.deepEqual(validateYgValue(-2), { valid: false, error: YG_ERROR });
  assert.deepEqual(validateYgValue(-6), { valid: false, error: YG_ERROR });
  assert.deepEqual(validateYgValue(10.5), { valid: false, error: YG_ERROR });
  assert.deepEqual(validateYgValue(11), { valid: false, error: YG_ERROR });
});

test('validateYgValue rejects values not on half-step grid', () => {
  assert.deepEqual(validateYgValue(4.25), { valid: false, error: YG_ERROR });
  assert.deepEqual(validateYgValue(3.14159), { valid: false, error: YG_ERROR });
  assert.deepEqual(validateYgValue(-1.5), { valid: false, error: YG_ERROR });
});

test('validateYgValue accepts numeric strings on grid', () => {
  assert.deepEqual(validateYgValue('4.5'), { valid: true, value: 4.5 });
  assert.deepEqual(validateYgValue('-1'), { valid: true, value: -1 });
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

test('validateYgValue: epsilon — tiny float noise on grid is accepted', () => {
  const jitter = YG_GRID_EPS / 4;
  const result = validateYgValue(4.5 + jitter);
  assert.equal(result.valid, true);
  assert.equal(result.value, 4.5);
});

test('validateYgValue: epsilon — far from grid still rejected', () => {
  const result = validateYgValue(4.5 + YG_GRID_EPS * 100);
  assert.equal(result.valid, false);
});

test('error message describes canonical scale and zero', () => {
  assert.ok(YG_ERROR.includes('-1'), 'error message must mention -1');
  assert.ok(YG_ERROR.includes('10'), 'error message must mention 10');
  assert.ok(YG_ERROR.includes('0.5'), 'half steps');
  assert.ok(YG_ERROR.toLowerCase().includes('not allowed'), 'zero/disallowed');
});

test('ygValueToStarRating: linear map for canonical range', () => {
  assert.equal(ygValueToStarRating(-1), 1);
  assert.equal(ygValueToStarRating(10), 5);
  assert.equal(ygValueToStarRating(4.5), 3);
  assert.equal(ygValueToStarRating(1), 2);
  assert.equal(ygValueToStarRating(7), 4);
  assert.equal(ygValueToStarRating(9.5), 5);
});

test('ygValueToStarRating: out-of-range legacy returns 3', () => {
  assert.equal(ygValueToStarRating(-6), 3);
  assert.equal(ygValueToStarRating(10.5), 3);
  assert.equal(ygValueToStarRating(11), 3);
});

test('ygValueToStarRating 0 returns 3 (invalid fallback)', () => {
  assert.equal(ygValueToStarRating(0), 3);
});

test('ygValueToStarRating null/undefined returns 3', () => {
  assert.equal(ygValueToStarRating(null), 3);
  assert.equal(ygValueToStarRating(undefined), 3);
});
