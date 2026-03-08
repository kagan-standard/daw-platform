const express = require('express');

const VALID_TARGET_TYPES = new Set(['brewery', 'venue', 'beer', 'external']);

const TRACKING_RETRIES = 3;
const TRACKING_BACKOFF_MS = [100, 300, 900];

function firstForwardedIp(headerValue) {
  if (!headerValue) return null;
  const parts = String(headerValue).split(',').map((v) => v.trim()).filter(Boolean);
  return parts[0] || null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Phase 4.2 (BE-G-06): Write tracking event with retries; on final failure
 * record to tracking_failures for dead-letter visibility and failure metrics.
 * Response is still 202 + tracked: true (fire-and-forget from request perspective).
 */
async function trackingWriteWithRetry(rest, path, record, eventType) {
  const headers = { 'Content-Type': 'application/json' };
  const body = JSON.stringify(record);
  let lastError;
  for (let attempt = 0; attempt < TRACKING_RETRIES; attempt++) {
    try {
      const result = await rest('POST', path, { headers, body });
      if (result.status < 400) return;
      lastError = new Error(`HTTP ${result.status}: ${JSON.stringify(result.body)}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < TRACKING_RETRIES - 1) {
      await sleep(TRACKING_BACKOFF_MS[attempt] ?? 500);
    }
  }
  const errorMessage = lastError?.message ?? String(lastError);
  console.error(`Tracking write failed after ${TRACKING_RETRIES} attempts (${eventType}):`, errorMessage);
  try {
    await rest('POST', '/tracking_failures', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: eventType,
        payload: record,
        error_message: errorMessage,
      }),
    });
  } catch (dlqErr) {
    console.error('Failed to write tracking_failures (dead-letter):', dlqErr);
  }
}

module.exports = function trackingRoutes(opts) {
  const router = express.Router();
  const { rest, softAuthMiddleware } = opts;

  router.post('/track/click', softAuthMiddleware, async (req, res) => {
    const {
      target_type,
      target_id,
      target_name,
      destination_url,
      source_page,
      source_beer_id,
      source_brewery_id,
      referrer_path,
    } = req.body || {};

    if (!destination_url || !target_type) {
      return res.status(400).json({ error: 'destination_url and target_type required' });
    }
    if (!VALID_TARGET_TYPES.has(target_type)) {
      return res.status(400).json({ error: 'Invalid target_type' });
    }

    const record = {
      user_id: req.claims?.sub || null,
      target_type,
      target_id: target_id || null,
      target_name: target_name || null,
      destination_url,
      source_page: source_page || null,
      source_beer_id: source_beer_id || null,
      source_brewery_id: source_brewery_id || null,
      referrer_path: referrer_path || null,
      ip_address: firstForwardedIp(req.headers['x-forwarded-for']) || req.ip || null,
      user_agent: req.headers['user-agent'] || null,
    };

    trackingWriteWithRetry(rest, '/referral_clicks', record, 'click').catch(() => {});

    return res.status(202).json({ tracked: true });
  });

  router.post('/track/pageview', softAuthMiddleware, async (req, res) => {
    const { page_path, session_id, referrer_url } = req.body || {};

    if (!page_path) {
      return res.status(400).json({ error: 'page_path required' });
    }

    const record = {
      user_id: req.claims?.sub || null,
      page_path,
      session_id: session_id || null,
      referrer_url: referrer_url || null,
      ip_address: firstForwardedIp(req.headers['x-forwarded-for']) || req.ip || null,
      user_agent: req.headers['user-agent'] || null,
    };

    trackingWriteWithRetry(rest, '/page_views', record, 'pageview').catch(() => {});

    return res.status(202).json({ tracked: true });
  });

  return router;
};
