/**
 * Internal routes (no Supabase Edge Runtime). process-event runs in-app.
 * POST /internal/process-event — Keycloak JWT + x-internal-secret header required.
 * INTERNAL_PROCESS_EVENT_SECRET must be set; server.js refuses to mount these routes otherwise.
 * Same auth/validation as handleProcessEventRequest (used by invokeProcessEvent in-process path).
 */

const express = require('express');
const crypto = require('crypto');
const { processEvent, VALID_EVENT_TYPES, isAdminUser } = require('../lib/processEventEngine');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUIRES_EVENT_ID = ['rating_award', 'cheers_given', 'cheers_received', 'admin_grant'];
const INTERNAL_SECRET = process.env.INTERNAL_PROCESS_EVENT_SECRET || '';

/**
 * Handle one process-event request (auth + validate + engine). Used by both the HTTP route and
 * invokeProcessEvent() in-process path. Does NOT call invokeProcessEvent (no recursion).
 * @param {{ rest, totalFromContentRange, getKeycloakUserId }} opts
 * @param {string} authHeader - Authorization: Bearer <token>
 * @param {{ event_type?: string, event_id?: string, payload?: object }} body
 * @returns {Promise<{ unlocked: Array, tabs_delta: number, tabs_balance: number, current_streak_weeks: number|null, longest_streak_weeks: number|null }>}
 * @throws Error with .status and .body for 4xx
 */
async function handleProcessEventRequest(opts, authHeader, body) {
  const { rest, totalFromContentRange, getKeycloakUserId } = opts;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err = new Error('Missing or invalid Authorization header');
    err.status = 401;
    err.body = { error: err.message };
    throw err;
  }
  if (!INTERNAL_SECRET || body._internalSecret !== INTERNAL_SECRET) {
    const err = new Error('Forbidden');
    err.status = 403;
    err.body = { error: 'Invalid or missing internal secret' };
    throw err;
  }
  const token = authHeader.slice(7);
  const userId = await getKeycloakUserId(token);
  if (!userId) {
    const err = new Error('Unauthorized');
    err.status = 401;
    err.body = { error: err.message };
    throw err;
  }
  const safeBody = typeof body === 'object' && body !== null ? body : {};
  const eventType = safeBody.event_type;
  const eventId = safeBody.event_id;
  const payload = safeBody.payload ?? {};
  if (!eventType || !VALID_EVENT_TYPES.includes(eventType)) {
    const err = new Error('Invalid event_type');
    err.status = 400;
    err.body = { error: err.message, valid_types: VALID_EVENT_TYPES };
    throw err;
  }
  if (REQUIRES_EVENT_ID.includes(eventType) && (!eventId || !UUID_REGEX.test(eventId))) {
    const err = new Error(`event_id (UUID) required for ${eventType}`);
    err.status = 400;
    err.body = { error: err.message };
    throw err;
  }
  if (eventType === 'admin_grant' && !isAdminUser(userId)) {
    const err = new Error('Forbidden: admin_grant requires admin role');
    err.status = 403;
    err.body = { error: err.message };
    throw err;
  }
  return processEvent(
    { rest, totalFromContentRange },
    eventType,
    REQUIRES_EVENT_ID.includes(eventType) ? eventId : null,
    payload,
    userId
  );
}

module.exports = function internalRoutes(opts) {
  const router = express.Router();
  const { rest, totalFromContentRange, getKeycloakUserId } = opts;

  router.post('/process-event', async (req, res) => {
    const authHeader = req.headers.authorization;
    const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
    body._internalSecret = req.headers['x-internal-secret'];
    try {
      const result = await handleProcessEventRequest(opts, authHeader, body);
      return res.status(200).json(result);
    } catch (err) {
      const status = err.status || 500;
      if (status < 500 && err.body) {
        return res.status(status).json(err.body);
      }
      const correlationId = req.requestId || crypto.randomUUID();
      console.error(`[process-event] internal_error correlation_id=${correlationId}`, err);
      return res.status(status).json({
        error: 'internal_error',
        correlation_id: correlationId,
      });
    }
  });

  return router;
};
module.exports.handleProcessEventRequest = handleProcessEventRequest;
