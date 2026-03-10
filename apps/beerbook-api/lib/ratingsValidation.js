/**
 * Validation helpers for POST /api/ratings.
 * Kept in sync with DB constraint ratings_yg_value_check
 * (migration: 20260316100000 + 20260317100000 for -6..7, no zero).
 * Star rating is derived from YG for internal/DB use only; never shown to users.
 * YG scale: -6 to +7, zero is not a valid option.
 */

const YG_ERROR = 'yg_value must be an integer from -6 to 7 (zero not allowed)';

/** Valid YG set: -6,-5,-4,-3,-2,-1, 1,2,3,4,5,6,7 */
const YG_VALID_SET = new Set([-6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7]);

/**
 * Validates yg_value for the YG scale (-6 to 7, zero not allowed).
 * @param {unknown} value - Raw value from request body (yg_value or ygValue)
 * @returns {{ valid: true, value: number } | { valid: false, error: string }}
 */
function validateYgValue(value) {
  if (value == null) return { valid: true, value: null };
  if (value === '') return { valid: false, error: YG_ERROR };
  const yg = Number(value);
  if (!Number.isFinite(yg) || !Number.isInteger(yg) || !YG_VALID_SET.has(yg)) {
    return { valid: false, error: YG_ERROR };
  }
  return { valid: true, value: yg };
}

/**
 * Derives internal 1–5 star value from yg_value for DB/legacy only. Not for user display.
 * Mapping: -6..-2→1, -1→2, 1..2→3, 3..6→4, 7→5. (0 is invalid; fallback 3.)
 * @param {number} ygValue - Integer -6 to 7 (no 0)
 * @returns {number} 1–5
 */
function ygValueToStarRating(ygValue) {
  if (ygValue == null || !Number.isInteger(ygValue)) return 3;
  if (ygValue === 0) return 3; // invalid input fallback
  if (ygValue <= -2) return 1;
  if (ygValue === -1) return 2;
  if (ygValue <= 2) return 3;
  if (ygValue <= 6) return 4;
  return 5; // 7 → 5 stars
}

module.exports = { validateYgValue, ygValueToStarRating, YG_ERROR };
