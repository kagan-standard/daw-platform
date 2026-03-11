/**
 * Actor identity for ratings: user (JWT) or guest (client-generated ID).
 * Used by POST/DELETE /api/ratings and POST /api/guest-ratings/claim.
 * Gate guest flows on ENABLE_GUEST_RATINGS.
 */

const ENABLE_GUEST_RATINGS = process.env.ENABLE_GUEST_RATINGS === 'true' || process.env.ENABLE_GUEST_RATINGS === '1';

/** UUID v4 (with or without hyphens). Client-generated guest IDs must match this. */
const GUEST_ID_REGEX = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[34][0-9a-f]{3}-?[89ab][0-9a-f]{3}-?[0-9a-f]{12}$/i;

/**
 * Validates client-provided guest ID format. Backend does not issue guest IDs.
 * @param {string} guestId - Raw guest ID from header or body
 * @returns {{ valid: true, value: string } | { valid: false, error: string }}
 */
function validateGuestId(guestId) {
  if (guestId == null || typeof guestId !== 'string') {
    return { valid: false, error: 'guest_id is required for guest ratings' };
  }
  const trimmed = String(guestId).trim();
  if (!trimmed) {
    return { valid: false, error: 'guest_id cannot be empty' };
  }
  if (trimmed.length > 64) {
    return { valid: false, error: 'guest_id too long' };
  }
  if (!GUEST_ID_REGEX.test(trimmed)) {
    return { valid: false, error: 'guest_id must be a valid UUID (e.g. client-generated UUID v4)' };
  }
  return { valid: true, value: trimmed };
}

/**
 * Resolves actor from request: JWT (user) or X-Guest-Id (guest) when guest ratings enabled.
 * Does not perform JWT verification; run softAuthMiddleware first so req.claims may be set.
 * @param {object} req - Express request (headers, body); req.claims set by softAuthMiddleware if JWT valid
 * @returns {{ type: 'user', sub: string, preferred_username?: string, email?: string } | { type: 'guest', guest_id: string } | { type: null, error: string }}
 */
function resolveActor(req) {
  if (req.claims && req.claims.sub) {
    return {
      type: 'user',
      sub: String(req.claims.sub).trim(),
      preferred_username: req.claims.preferred_username,
      email: req.claims.email,
    };
  }
  if (!ENABLE_GUEST_RATINGS) {
    return { type: null, error: 'Authentication required. Guest ratings are not enabled.' };
  }
  const guestIdRaw = req.headers['x-guest-id'] || req.body?.guest_id;
  const result = validateGuestId(guestIdRaw);
  if (!result.valid) {
    return { type: null, error: result.error };
  }
  return { type: 'guest', guest_id: result.value };
}

/**
 * Middleware: resolves actor and sets req.actor. Requires either valid JWT (after softAuth) or valid X-Guest-Id when ENABLE_GUEST_RATINGS.
 * Use on POST /api/ratings and DELETE /api/ratings/:id for user-or-guest access.
 */
function actorMiddleware(req, res, next) {
  const actor = resolveActor(req);
  if (actor.type === null) {
    const status = actor.error && actor.error.includes('required') ? 401 : 400;
    return res.status(status).json({
      error_code: actor.error.includes('Authentication') ? 'AUTH_REQUIRED' : 'INVALID_GUEST_ID',
      error: actor.error,
      request_id: req.requestId || null,
    });
  }
  req.actor = actor;
  next();
}

module.exports = {
  ENABLE_GUEST_RATINGS,
  validateGuestId,
  resolveActor,
  actorMiddleware,
  GUEST_ID_REGEX,
};
