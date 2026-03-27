#!/usr/bin/env node
/* eslint-disable no-console */

const { evaluatePushEligibility, createNoOpPushHooks } = require('../lib/pushEligibility');
const { fetchPushAllowlistBundle, mergePushAllowlist } = require('../lib/pushAllowlistStore');

const REST_URL = (process.env.SUPABASE_REST_URL || 'http://supabase-rest:3000').replace(/\/$/, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EXPO_PUSH_URL = process.env.EXPO_PUSH_URL || 'https://exp.host/--/api/v2/push/send';
const PUSH_BATCH_SIZE = Math.max(1, Number(process.env.PUSH_BATCH_SIZE || 50));
const PUSH_MAX_BATCHES = Math.max(1, Number(process.env.PUSH_MAX_BATCHES || 1));
const MAX_RETRY_ATTEMPTS = Math.max(1, Number(process.env.PUSH_MAX_RETRY_ATTEMPTS || 5));
const RETRY_BASE_SECONDS = Math.max(5, Number(process.env.PUSH_RETRY_BASE_SECONDS || 30));
const RETRY_MAX_SECONDS = Math.max(RETRY_BASE_SECONDS, Number(process.env.PUSH_RETRY_MAX_SECONDS || 3600));
const RETRY_JITTER_RATIO = Math.min(0.5, Math.max(0, Number(process.env.PUSH_RETRY_JITTER_RATIO || 0.2)));

function composePayload(row) {
  return {
    to: row.expo_push_token,
    sound: 'default',
    title: row.title || 'BeerBook update',
    body: row.message || 'You have a new notification.',
    data: {
      notification_id: row.notification_id,
      notification_type: row.notification_type,
      target_type: row.target_type || null,
      target_id: row.target_id || null,
    },
  };
}

function computeBackoffIso(attemptCount) {
  const exp = Math.max(0, attemptCount - 1);
  const raw = RETRY_BASE_SECONDS * (2 ** exp);
  const waitSeconds = Math.min(raw, RETRY_MAX_SECONDS);
  const jitter = RETRY_JITTER_RATIO > 0 ? waitSeconds * RETRY_JITTER_RATIO * Math.random() : 0;
  return new Date(Date.now() + (waitSeconds + jitter) * 1000).toISOString();
}

function isPermanentExpoError(result) {
  const details = result?.details || {};
  const code = String(details.error || result?.message || '').trim();
  return code === 'DeviceNotRegistered';
}

function createRest() {
  return async function rest(method, path, body, headers = {}) {
    const res = await fetch(`${REST_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (res.status >= 400) {
      throw new Error(`PostgREST ${res.status} ${path}: ${text}`);
    }
    return json;
  };
}

async function sendToExpo(messages) {
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (res.status >= 400) {
    throw new Error(`Expo push send failed (${res.status}): ${text}`);
  }
  if (!Array.isArray(json?.data)) {
    throw new Error(`Unexpected Expo response: ${text}`);
  }
  return json.data;
}

async function deactivateToken(rest, tokenId, reason) {
  await rest(
    'PATCH',
    `/push_tokens?id=eq.${encodeURIComponent(tokenId)}&is_active=eq.true`,
    {
      is_active: false,
      deactivated_at: new Date().toISOString(),
      deactivation_reason: reason,
      updated_at: new Date().toISOString(),
    }
  );
}

async function recordAttempt(rest, row, params) {
  return rest('POST', '/rpc/record_push_send_attempt', {
    p_notification_id: row.notification_id,
    p_token_id: row.token_id,
    p_status: params.status,
    p_provider_ticket_id: params.providerTicketId || null,
    p_error_code: params.errorCode || null,
    p_error_message: params.errorMessage || null,
    p_next_attempt_at: params.nextAttemptAt || null,
  });
}

async function markIneligible(rest, row, reason) {
  await rest('POST', '/rpc/mark_push_pair_ineligible', {
    p_notification_id: row.notification_id,
    p_token_id: row.token_id,
    p_reason: reason,
  });
}

async function runOnce({ restFn = createRest(), sendFn = sendToExpo } = {}) {
  const bundle = await fetchPushAllowlistBundle(restFn);
  const allowlist = mergePushAllowlist(bundle, process.env);
  const hooks = createNoOpPushHooks();
  const claimedRows = await restFn('POST', '/rpc/claim_push_dispatch_batch', {
    p_batch_size: PUSH_BATCH_SIZE,
  });
  const rows = Array.isArray(claimedRows) ? claimedRows : [];
  if (rows.length === 0) {
    console.log('push-dispatch: no rows claimed');
    return { claimed: 0, sent_to_expo: 0, retryable_failure: 0, permanent_failure: 0 };
  }

  const messages = [];
  const messageRows = [];
  for (const row of rows) {
    const decision = evaluatePushEligibility({
      notification: row,
      hasActiveToken: Boolean(row.expo_push_token),
      deliveryStatus: row.delivery_status,
      allowlist,
      hooks,
    });
    if (!decision.eligible) {
      await markIneligible(restFn, row, decision.reason);
      continue;
    }
    messages.push(composePayload(row));
    messageRows.push(row);
  }

  if (messages.length === 0) {
    console.log(`push-dispatch: ${rows.length} claimed rows were ineligible`);
    return { claimed: rows.length, sent_to_expo: 0, retryable_failure: 0, permanent_failure: rows.length };
  }

  let expoResults;
  try {
    expoResults = await sendFn(messages);
  } catch (err) {
    const nextAttemptAt = new Date(Date.now() + (RETRY_BASE_SECONDS * 1000)).toISOString();
    await Promise.all(messageRows.map((row) => (
      recordAttempt(restFn, row, {
        status: row.attempt_count + 1 >= MAX_RETRY_ATTEMPTS ? 'permanent_failure' : 'retryable_failure',
        errorCode: 'expo_transport_error',
        errorMessage: err.message,
        nextAttemptAt,
      })
    )));
    throw err;
  }

  let sentToExpo = 0;
  let retryableFailure = 0;
  let permanentFailure = rows.length - messageRows.length;

  for (let i = 0; i < messageRows.length; i += 1) {
    const row = messageRows[i];
    const result = expoResults[i] || {};
    if (result.status === 'ok') {
      sentToExpo += 1;
      await recordAttempt(restFn, row, {
        status: 'sent_to_expo',
        providerTicketId: result.id || null,
      });
      continue;
    }

    const details = result.details || {};
    const errorCode = details.error || result.message || 'expo_send_error';
    const errorMessage = result.message || String(errorCode);
    const nextAttemptAt = computeBackoffIso(row.attempt_count + 1);
    const permanent = isPermanentExpoError(result) || (row.attempt_count + 1 >= MAX_RETRY_ATTEMPTS);

    if (permanent) {
      permanentFailure += 1;
      await recordAttempt(restFn, row, {
        status: 'permanent_failure',
        errorCode,
        errorMessage,
      });
      if (isPermanentExpoError(result)) {
        await deactivateToken(restFn, row.token_id, 'provider_device_not_registered');
      }
    } else {
      retryableFailure += 1;
      await recordAttempt(restFn, row, {
        status: 'retryable_failure',
        errorCode,
        errorMessage,
        nextAttemptAt,
      });
    }
  }

  console.log(
    `push-dispatch: claimed=${rows.length} sent_to_expo=${sentToExpo} retryable_failure=${retryableFailure} permanent_failure=${permanentFailure}`
  );
  return {
    claimed: rows.length,
    sent_to_expo: sentToExpo,
    retryable_failure: retryableFailure,
    permanent_failure: permanentFailure,
  };
}

async function run({ restFn = createRest(), sendFn = sendToExpo, maxBatches = PUSH_MAX_BATCHES } = {}) {
  const boundedBatches = Math.max(1, Number(maxBatches || 1));
  const totals = {
    batches: 0,
    claimed: 0,
    sent_to_expo: 0,
    retryable_failure: 0,
    permanent_failure: 0,
  };

  for (let i = 0; i < boundedBatches; i += 1) {
    const out = await runOnce({ restFn, sendFn });
    totals.batches += 1;
    totals.claimed += out.claimed;
    totals.sent_to_expo += out.sent_to_expo;
    totals.retryable_failure += out.retryable_failure;
    totals.permanent_failure += out.permanent_failure;
    if (out.claimed === 0) break;
  }

  console.log(
    `push-dispatch total: batches=${totals.batches} claimed=${totals.claimed} sent_to_expo=${totals.sent_to_expo} retryable_failure=${totals.retryable_failure} permanent_failure=${totals.permanent_failure}`
  );
  return totals;
}

if (require.main === module) {
  if (!SERVICE_ROLE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is required');
    process.exit(1);
  }
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  module.exports = {
    run,
    runOnce,
    composePayload,
    computeBackoffIso,
    isPermanentExpoError,
  };
}
