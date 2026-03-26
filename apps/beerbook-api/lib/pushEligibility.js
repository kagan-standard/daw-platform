const DEFAULT_PUSH_ALLOWLIST = new Set([
  'streak_at_risk',
  'approaching_demotion',
  'tier_promotion',
  'tabs_earned',
  'beer_approved',
  'weekly_summary',
]);

function evaluatePushEligibility({
  notification,
  hasActiveToken,
  deliveryStatus,
  allowlist = DEFAULT_PUSH_ALLOWLIST,
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
  DEFAULT_PUSH_ALLOWLIST,
  evaluatePushEligibility,
};
