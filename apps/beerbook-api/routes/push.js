const express = require('express');

const VALID_PLATFORMS = new Set(['ios', 'android']);
const EXPO_TOKEN_PREFIX = 'ExponentPushToken[';

/** PostgREST/PG select list for push token upsert + reconcile GETs (keep in sync). */
const PUSH_TOKENS_REGISTER_SELECT =
  'id,user_id,expo_push_token,platform,device_id,app_version,is_active,last_seen_at,updated_at,created_at';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function looksLikeExpoPushToken(token) {
  return token.startsWith(EXPO_TOKEN_PREFIX) && token.endsWith(']');
}

function isPostgrestUniqueViolation(body) {
  if (!body || typeof body !== 'object') return false;
  const code = body.code;
  return code === '23505' || code === 23505;
}

module.exports = function pushRoutes(opts) {
  const { rest, authMiddleware } = opts;
  const router = express.Router();

  // POST /api/push/register
  // Idempotent by expo_push_token upsert; on unique_violation (23505), reconcile by token then by active (user_id, device_id).
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

      const upsertQuery =
        `/push_tokens?on_conflict=expo_push_token&select=${PUSH_TOKENS_REGISTER_SELECT}`;
      const upsertOut = await rest(
        'POST',
        upsertQuery,
        {
          headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
          body: JSON.stringify(row),
        }
      );
      if (upsertOut.status >= 400) {
        if (!isPostgrestUniqueViolation(upsertOut.body)) {
          return res.status(upsertOut.status).json(upsertOut.body || { error: 'Upstream error' });
        }

        const conflictStatus = upsertOut.status;
        const conflictBody = upsertOut.body || { error: 'Upstream error' };

        const byToken = await rest(
          'GET',
          `/push_tokens?expo_push_token=eq.${encodeURIComponent(expoPushToken)}&limit=1&select=${PUSH_TOKENS_REGISTER_SELECT}`
        );
        if (byToken.status < 400) {
          const tokenRows = Array.isArray(byToken.body) ? byToken.body : [];
          const existing = tokenRows[0];
          if (existing) {
            if (existing.user_id === userId) {
              return res.json({
                registered: true,
                already_registered: true,
                token: existing,
              });
            }
            return res.status(conflictStatus).json(conflictBody);
          }
        }

        if (deviceId) {
          const byDevice = await rest(
            'GET',
            `/push_tokens?user_id=eq.${encodeURIComponent(userId)}&device_id=eq.${encodeURIComponent(deviceId)}&is_active=eq.true&limit=1&select=${PUSH_TOKENS_REGISTER_SELECT}`
          );
          if (byDevice.status < 400) {
            const deviceRows = Array.isArray(byDevice.body) ? byDevice.body : [];
            const active = deviceRows[0];
            if (active) {
              return res.json({
                registered: true,
                already_registered: true,
                token: active,
              });
            }
          }
        }

        return res.status(conflictStatus).json(conflictBody);
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
