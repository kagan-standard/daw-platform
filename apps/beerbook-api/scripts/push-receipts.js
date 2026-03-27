#!/usr/bin/env node
/* eslint-disable no-console */

const { evaluatePushEligibility } = require('../lib/pushEligibility');
const { fetchPushAllowlistBundle, mergePushAllowlist } = require('../lib/pushAllowlistStore');

const REST_URL = (process.env.SUPABASE_REST_URL || 'http://supabase-rest:3000').replace(/\/$/, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EXPO_RECEIPTS_URL = process.env.EXPO_RECEIPTS_URL || 'https://exp.host/--/api/v2/push/getReceipts';
const RECEIPT_BATCH_SIZE = Math.max(1, Number(process.env.PUSH_RECEIPT_BATCH_SIZE || 50));
const RECEIPT_MAX_BATCHES = Math.max(1, Number(process.env.PUSH_RECEIPT_MAX_BATCHES || 3));
const RECEIPT_PENDING_SECONDS = Math.max(10, Number(process.env.PUSH_RECEIPT_PENDING_SECONDS || 45));
const RECEIPT_MIN_AGE_SECONDS = Math.max(1, Number(process.env.PUSH_RECEIPT_MIN_AGE_SECONDS || 15));
const RECEIPT_POLL_COOLDOWN_SECONDS = Math.max(1, Number(process.env.PUSH_RECEIPT_POLL_COOLDOWN_SECONDS || 20));

function createRest() {
  return async function rest(method, path, body) {
    const res = await fetch(`${REST_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
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

async function fetchExpoReceipts(ticketIds) {
  const res = await fetch(EXPO_RECEIPTS_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ids: ticketIds }),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (res.status >= 400) {
    throw new Error(`Expo getReceipts failed (${res.status}): ${text}`);
  }
  const data = json?.data;
  if (!data || typeof data !== 'object') {
    throw new Error(`Unexpected Expo receipts response: ${text}`);
  }
  return data;
}

function isPermanentExpoReceiptError(receipt) {
  const details = receipt?.details || {};
  const code = String(details.error || receipt?.message || '').trim();
  return code === 'DeviceNotRegistered';
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
    p_provider_ticket_id: null,
    p_error_code: params.errorCode || null,
    p_error_message: params.errorMessage || null,
    p_next_attempt_at: params.nextAttemptAt || null,
  });
}

async function markPending(rest, row, seconds) {
  await rest('POST', '/rpc/mark_push_receipt_pending', {
    p_notification_id: row.notification_id,
    p_token_id: row.token_id,
    p_next_poll_after_seconds: seconds,
  });
}

async function markIneligible(rest, row, reason) {
  await rest('POST', '/rpc/mark_push_pair_ineligible', {
    p_notification_id: row.notification_id,
    p_token_id: row.token_id,
    p_reason: reason,
  });
}

async function runOnce({ restFn = createRest(), receiptsFn = fetchExpoReceipts } = {}) {
  const claimedRows = await restFn('POST', '/rpc/claim_push_receipt_batch', {
    p_batch_size: RECEIPT_BATCH_SIZE,
    p_min_age_seconds: RECEIPT_MIN_AGE_SECONDS,
    p_poll_cooldown_seconds: RECEIPT_POLL_COOLDOWN_SECONDS,
  });
  const rows = Array.isArray(claimedRows) ? claimedRows : [];
  if (rows.length === 0) {
    console.log('push-receipts: no rows claimed');
    return { claimed: 0, receipt_ok: 0, pending: 0, permanent_failure: 0, ineligible: 0 };
  }

  const ids = [...new Set(rows.map((r) => r.provider_ticket_id).filter(Boolean))];
  let receiptMap = {};
  try {
    receiptMap = await receiptsFn(ids);
  } catch (err) {
    await Promise.all(rows.map((row) => markPending(restFn, row, RECEIPT_PENDING_SECONDS)));
    throw err;
  }

  const bundle = await fetchPushAllowlistBundle(restFn);
  const allowlist = mergePushAllowlist(bundle, process.env);
  let receiptOk = 0;
  let pending = 0;
  let permanentFailure = 0;
  let ineligible = 0;

  for (const row of rows) {
    const decision = evaluatePushEligibility({
      notification: { notification_type: row.notification_type },
      hasActiveToken: true,
      deliveryStatus: 'sent_to_expo',
      allowlist,
    });

    if (!decision.eligible) {
      await markIneligible(restFn, row, decision.reason);
      ineligible += 1;
      continue;
    }

    const receipt = receiptMap[row.provider_ticket_id];

    if (!receipt) {
      pending += 1;
      await markPending(restFn, row, RECEIPT_PENDING_SECONDS);
      continue;
    }

    if (receipt.status === 'ok') {
      receiptOk += 1;
      await recordAttempt(restFn, row, { status: 'receipt_ok' });
      continue;
    }

    if (receipt.status === 'error') {
      const msg = receipt.message || receipt.details?.error || 'expo_receipt_error';
      if (isPermanentExpoReceiptError(receipt)) {
        permanentFailure += 1;
        await recordAttempt(restFn, row, {
          status: 'permanent_failure',
          errorCode: receipt.details?.error || 'DeviceNotRegistered',
          errorMessage: msg,
        });
        await deactivateToken(restFn, row.token_id, 'provider_device_not_registered');
      } else {
        pending += 1;
        await markPending(restFn, row, RECEIPT_PENDING_SECONDS * 2);
      }
      continue;
    }

    pending += 1;
    await markPending(restFn, row, RECEIPT_PENDING_SECONDS);
  }

  console.log(
    `push-receipts: claimed=${rows.length} receipt_ok=${receiptOk} pending=${pending} permanent_failure=${permanentFailure} ineligible=${ineligible}`
  );
  return { claimed: rows.length, receipt_ok: receiptOk, pending, permanent_failure: permanentFailure, ineligible };
}

async function runLoop({ restFn = createRest(), receiptsFn = fetchExpoReceipts, maxBatches = RECEIPT_MAX_BATCHES } = {}) {
  const bounded = Math.max(1, Number(maxBatches || 1));
  const totals = { batches: 0, claimed: 0, receipt_ok: 0, pending: 0, permanent_failure: 0, ineligible: 0 };

  for (let i = 0; i < bounded; i += 1) {
    const out = await runOnce({ restFn, receiptsFn });
    totals.batches += 1;
    totals.claimed += out.claimed;
    totals.receipt_ok += out.receipt_ok;
    totals.pending += out.pending;
    totals.permanent_failure += out.permanent_failure;
    totals.ineligible += out.ineligible;
    if (out.claimed === 0) break;
  }

  console.log(
    `push-receipts total: batches=${totals.batches} claimed=${totals.claimed} receipt_ok=${totals.receipt_ok} pending=${totals.pending} permanent_failure=${totals.permanent_failure} ineligible=${totals.ineligible}`
  );
  return totals;
}

if (require.main === module) {
  if (!SERVICE_ROLE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is required');
    process.exit(1);
  }
  runLoop().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  module.exports = { run: runLoop, runOnce, fetchExpoReceipts };
}
