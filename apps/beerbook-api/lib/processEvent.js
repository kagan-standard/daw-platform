/**
 * Invoke process-event (BFF → server-to-server).
 * When PROCESS_EVENT_URL and SUPABASE_URL are unset (self-hosted), calls the in-process handler
 * directly (zero network, no fetch to self). Otherwise uses HTTP to PROCESS_EVENT_URL or Supabase.
 * Pass Keycloak JWT in Authorization; event_id required for rating_award, cheers, admin_grant.
 */

const PROCESS_EVENT_URL =
  process.env.PROCESS_EVENT_URL ||
  (process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/process-event` : null);

const INTERNAL_SECRET = process.env.INTERNAL_PROCESS_EVENT_SECRET || null;

/** In-process handler when PROCESS_EVENT_URL/SUPABASE_URL unset. Set by server.js at startup. */
let inProcessHandler = null;

/**
 * Register the in-process process-event handler (same logic as POST /internal/process-event).
 * Called by server.js so invokeProcessEvent() can run without any HTTP when self-hosted.
 */
function setInProcessHandler(handler) {
  inProcessHandler = handler;
}

/**
 * @param {string} authHeader - Authorization: Bearer <Keycloak JWT>
 * @param {string} eventType - rating_award | cheers_given | cheers_received | rating_submitted | admin_grant | spend
 * @param {string|null} eventId - UUID for idempotency (required for rating_award, cheers_*, admin_grant)
 * @param {Record<string, unknown>} payload - event payload (amount, breakdown, context, etc.)
 * @returns {Promise<{ unlocked: Array<{ key: string, name: string, reward_tabs: number }>, tabs_delta: number, tabs_balance: number, current_streak_weeks: number|null, longest_streak_weeks: number|null }>}
 */
async function invokeProcessEvent(authHeader, eventType, eventId, payload) {
  const body = { event_type: eventType, payload: payload ?? {} };
  if (eventId != null) body.event_id = eventId;

  if (!PROCESS_EVENT_URL) {
    if (!inProcessHandler) {
      throw new Error('Process-event in-process handler not registered; ensure server calls setInProcessHandler at startup.');
    }
    if (INTERNAL_SECRET) body._internalSecret = INTERNAL_SECRET;
    return inProcessHandler(authHeader, body);
  }

  const res = await fetch(PROCESS_EVENT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader || '',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`process-event returned invalid JSON: ${text.slice(0, 200)}`);
  }
  if (res.status >= 400) {
    const err = new Error(data.error || `process-event ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return {
    unlocked: Array.isArray(data.unlocked) ? data.unlocked : [],
    tabs_delta: Number(data.tabs_delta) || 0,
    tabs_balance: Number(data.tabs_balance) || 0,
    current_streak_weeks:
      data.current_streak_weeks == null ? null : (Number(data.current_streak_weeks) || 0),
    longest_streak_weeks:
      data.longest_streak_weeks == null ? null : (Number(data.longest_streak_weeks) || 0),
  };
}

module.exports = { invokeProcessEvent, setInProcessHandler, PROCESS_EVENT_URL };
