const express = require('express');

const VALID_TARGET_TYPES = new Set(['brewery', 'venue', 'beer', 'external']);

function firstForwardedIp(headerValue) {
  if (!headerValue) return null;
  const parts = String(headerValue).split(',').map((v) => v.trim()).filter(Boolean);
  return parts[0] || null;
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

    rest('POST', '/referral_clicks', {
      body: JSON.stringify(record),
      headers: { 'Content-Type': 'application/json' },
    }).catch((err) => {
      console.error('Referral click tracking failed:', err);
    });

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

    rest('POST', '/page_views', {
      body: JSON.stringify(record),
      headers: { 'Content-Type': 'application/json' },
    }).catch((err) => {
      console.error('Page view tracking failed:', err);
    });

    return res.status(202).json({ tracked: true });
  });

  return router;
};
