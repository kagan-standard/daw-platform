const express = require('express');

const VALID_PLATFORMS = new Set(['ios', 'android']);
const EXPO_TOKEN_PREFIX = 'ExponentPushToken[';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function looksLikeExpoPushToken(token) {
  return token.startsWith(EXPO_TOKEN_PREFIX) && token.endsWith(']');
}

module.exports = function pushRoutes(opts) {
  const { rest, authMiddleware } = opts;
  const router = express.Router();

  // POST /api/push/register
  // Idempotent by expo_push_token unique constraint + PostgREST upsert.
  router.post('/push/register', authMiddleware, async (req, res, next) => {
    try {
      const userId = req.claims.sub;
      const expoPushToken = normalizeString(req.body?.expo_push_token);
      const platform = normalizeString(req.body?.platform).toLowerCase();
      const deviceId = normalizeString(req.body?.device_id) || null;
      const appVersion = normalizeString(req.body?.app_version) || null;

      if (!expoPushToken) {
        return res.status(400).json({ error: 'expo_push_token is required' });
      }
      if (!looksLikeExpoPushToken(expoPushToken)) {
        return res.status(400).json({ error: 'expo_push_token is invalid' });
      }
      if (!VALID_PLATFORMS.has(platform)) {
        return res.status(400).json({ error: 'platform must be ios or android' });
      }

      const now = new Date().toISOString();
      const row = {
        user_id: userId,
        expo_push_token: expoPushToken,
        platform,
        device_id: deviceId,
        app_version: appVersion,
        is_active: true,
        deactivated_at: null,
        deactivation_reason: null,
        last_seen_at: now,
        updated_at: now,
      };

      // If device_id is provided, keep one active token per user+device.
      if (deviceId) {
        const deactivateDeviceOut = await rest(
          'PATCH',
          `/push_tokens?user_id=eq.${encodeURIComponent(userId)}&device_id=eq.${encodeURIComponent(deviceId)}&is_active=eq.true&expo_push_token=neq.${encodeURIComponent(expoPushToken)}`,
          {
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
              is_active: false,
              deactivated_at: now,
              deactivation_reason: 'replaced_by_new_registration',
              updated_at: now,
            }),
          }
        );
        if (deactivateDeviceOut.status >= 400) {
          return res.status(deactivateDeviceOut.status).json(deactivateDeviceOut.body || { error: 'Upstream error' });
        }
      }

      const upsertOut = await rest(
        'POST',
        '/push_tokens?on_conflict=expo_push_token&select=id,user_id,expo_push_token,platform,device_id,app_version,is_active,last_seen_at,updated_at,created_at',
        {
          headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
          body: JSON.stringify(row),
        }
      );
      if (upsertOut.status >= 400) {
        return res.status(upsertOut.status).json(upsertOut.body || { error: 'Upstream error' });
      }

      const saved = Array.isArray(upsertOut.body) ? upsertOut.body[0] : upsertOut.body;
      return res.json({
        registered: true,
        token: saved || null,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/push/unregister
  // Idempotent by scoped PATCH on (user_id, expo_push_token); no-op is success.
  router.post('/push/unregister', authMiddleware, async (req, res, next) => {
    try {
      const userId = req.claims.sub;
      const expoPushToken = normalizeString(req.body?.expo_push_token);
      if (!expoPushToken) {
        return res.status(400).json({ error: 'expo_push_token is required' });
      }

      const now = new Date().toISOString();
      const patchOut = await rest(
        'PATCH',
        `/push_tokens?user_id=eq.${encodeURIComponent(userId)}&expo_push_token=eq.${encodeURIComponent(expoPushToken)}&is_active=eq.true`,
        {
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            is_active: false,
            deactivated_at: now,
            deactivation_reason: 'user_unregistered',
            updated_at: now,
          }),
        }
      );
      if (patchOut.status >= 400) {
        return res.status(patchOut.status).json(patchOut.body || { error: 'Upstream error' });
      }

      const updatedRows = Array.isArray(patchOut.body) ? patchOut.body : [];
      return res.json({
        unregistered: true,
        already_unregistered: updatedRows.length === 0,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
};
