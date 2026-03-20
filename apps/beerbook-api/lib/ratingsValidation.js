/**
 * Validation helpers for POST /api/ratings.
 * Kept in sync with DB constraint ratings_yg_value_check (canonical half-step migration).
 * Star rating is derived from YG for internal/DB use only; never shown to users.
 *
 * Allowed yg_value: -1, or 1..10 in steps of 0.5 (i.e. 2x is an integer). Zero is invalid.
 * EPS compares raw input to that grid so float noise (e.g. JSON/binary) snaps safely; values
 * far from a half-step are rejected — the server does not round off-grid values into compliance.
 */

/** Max distance of (value * 2) from nearest integer to count as on the half-step grid. */
const YG_GRID_EPS = 1e-9;

const YG_ERROR =
  'yg_value must be -1 or a number from 1 to 10 in steps of 0.5 (0 is not allowed)';

/** POST /api/ratings when yg_value is missing after validation pass-through. */
const YG_REQUIRED_ERROR =
  'yg_value is required (-1 or 1–10 in steps of 0.5; 0 is not allowed)';

/**
 * @param {unknown} value - Raw value from request body (yg_value or ygValue)
 * @returns {{ valid: true, value: number } | { valid: false, error: string }}
 */
function validateYgValue(value) {
  if (value == null) return { valid: true, value: null };
  if (value === '') return { valid: false, error: YG_ERROR };
  const yg = Number(value);
  if (!Number.isFinite(yg)) {
    return { valid: false, error: YG_ERROR };
  }
  const doubled = yg * 2;
  const n = Math.round(doubled);
  if (Math.abs(doubled - n) >= YG_GRID_EPS) {
    return { valid: false, error: YG_ERROR };
  }
  const normalized = n / 2;
  if (normalized === 0) {
    return { valid: false, error: YG_ERROR };
  }
  if (normalized === -1) {
    return { valid: true, value: -1 };
  }
  if (normalized >= 1 && normalized <= 10) {
    return { valid: true, value: normalized };
  }
  return { valid: false, error: YG_ERROR };
}

/**
 * Internal 1–5 star value from canonical yg_value (linear map). Not for user display.
 * Formula: clamp(1, round(1 + (yg + 1) * 4 / 11), 5) for yg in [-1, 10].
 * @param {number} ygValue
 * @returns {number} 1–5
 */
function ygValueToStarRating(ygValue) {
  if (ygValue == null || !Number.isFinite(Number(ygValue))) return 3;
  const yg = Number(ygValue);
  if (yg === 0) return 3;
  if (yg < -1 || yg > 10) return 3;
  const raw = 1 + (yg + 1) * (4 / 11);
  const rounded = Math.round(raw);
  return Math.min(5, Math.max(1, rounded));
}

module.exports = {
  validateYgValue,
  ygValueToStarRating,
  YG_ERROR,
  YG_REQUIRED_ERROR,
  YG_GRID_EPS,
};
