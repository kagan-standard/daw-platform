/** Off-by-default hook surface for preferences / quiet hours / fatigue (v1: no-ops). */
function createNoOpPushHooks() {
  return {
    preferences: () => ({ pass: true }),
    quietHours: () => ({ pass: true }),
    fatigue: () => ({ pass: true }),
  };
}

function parseAllowlistExtra(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function evaluatePushEligibility({
  notification,
  hasActiveToken,
  deliveryStatus,
  allowlist = new Set(),
  hooks = {},
}) {
  const notificationType = String(notification?.notification_type || '').trim();

  if (!notificationType) {
    return { eligible: false, reason: 'missing_notification_type' };
  }
  if (!hasActiveToken) {
    return { eligible: false, reason: 'no_active_token' };
  }
  if (!allowlist.has(notificationType)) {
    // Fail-closed by default: unknown/new types stay in-app only.
    return { eligible: false, reason: 'notification_type_not_allowlisted' };
  }
  if (deliveryStatus === 'receipt_ok' || deliveryStatus === 'permanent_failure') {
    return { eligible: false, reason: 'terminal_delivery_state' };
  }

  const preferenceCheck = hooks.preferences ? hooks.preferences(notification) : { pass: true };
  if (!preferenceCheck.pass) {
    return { eligible: false, reason: preferenceCheck.reason || 'preferences_blocked' };
  }

  const quietHoursCheck = hooks.quietHours ? hooks.quietHours(notification) : { pass: true };
  if (!quietHoursCheck.pass) {
    return { eligible: false, reason: quietHoursCheck.reason || 'quiet_hours_blocked' };
  }

  const fatigueCheck = hooks.fatigue ? hooks.fatigue(notification) : { pass: true };
  if (!fatigueCheck.pass) {
    return { eligible: false, reason: fatigueCheck.reason || 'fatigue_blocked' };
  }

  return { eligible: true, reason: 'allowlisted' };
}

module.exports = {
  createNoOpPushHooks,
  evaluatePushEligibility,
  parseAllowlistExtra,
};
