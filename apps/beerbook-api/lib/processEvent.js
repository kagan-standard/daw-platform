/**
 * Invoke process-event Edge Function (BFF → server-to-server).
 * Pass Keycloak JWT in Authorization; event_id required for rating_award, cheers, admin_grant.
 */

const PROCESS_EVENT_URL =
  process.env.PROCESS_EVENT_URL ||
  (process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/process-event` : null);

/**
 * @param {string} authHeader - Authorization: Bearer <Keycloak JWT>
 * @param {string} eventType - rating_award | cheers_given | cheers_received | rating_submitted | admin_grant | spend
 * @param {string|null} eventId - UUID for idempotency (required for rating_award, cheers_*, admin_grant)
 * @param {Record<string, unknown>} payload - event payload (amount, breakdown, context, etc.)
 * @returns {Promise<{ unlocked: Array<{ key: string, name: string, reward_tabs: number }>, tabs_delta: number, tabs_balance: number }>}
 */
async function invokeProcessEvent(authHeader, eventType, eventId, payload) {
  if (!PROCESS_EVENT_URL) {
    throw new Error('PROCESS_EVENT_URL or SUPABASE_URL is required to call process-event');
  }
  const body = { event_type: eventType, payload: payload ?? {} };
  if (eventId != null) body.event_id = eventId;

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
  };
}

module.exports = { invokeProcessEvent, PROCESS_EVENT_URL };
