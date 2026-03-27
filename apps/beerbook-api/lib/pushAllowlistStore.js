/**
 * Push allowlist from DB (catalog + admin toggles) merged with PUSH_ALLOWLIST_EXTRA (catalog-filtered).
 * Used by push-dispatch / push-receipts workers (service-role PostgREST).
 */

const { parseAllowlistExtra } = require('./pushEligibility');

/**
 * @param {Array<{ notification_type?: string }>} catalogRows
 * @param {Array<{ notification_type?: string, push_enabled?: boolean }>} toggleRows
 * @returns {{ ok: boolean, catalogTypes: Set<string>, enabledTypes: Set<string> }}
 */
function normalizePushAllowlistRows(catalogRows, toggleRows) {
  const catalogTypes = new Set();
  if (Array.isArray(catalogRows)) {
    for (const row of catalogRows) {
      const t = String(row?.notification_type || '').trim();
      if (t) catalogTypes.add(t);
    }
  }

  const enabledTypes = new Set();
  if (Array.isArray(toggleRows)) {
    for (const row of toggleRows) {
      const t = String(row?.notification_type || '').trim();
      if (!t) continue;
      if (row.push_enabled !== true) continue;
      if (catalogTypes.has(t)) enabledTypes.add(t);
    }
  }

  return { ok: true, catalogTypes, enabledTypes };
}

/** @param {function(string,string?,object?): Promise<any>} restFn worker PostgREST client */
async function fetchPushAllowlistBundle(restFn) {
  if (typeof restFn !== 'function') {
    return { ok: false, catalogTypes: new Set(), enabledTypes: new Set() };
  }
  try {
    const catalogRows = await restFn(
      'GET',
      '/push_notification_catalog?select=notification_type',
      undefined,
    );
    const toggleRows = await restFn(
      'GET',
      '/push_notification_push_toggle?select=notification_type,push_enabled',
      undefined,
    );
    return normalizePushAllowlistRows(catalogRows, toggleRows);
  } catch (err) {
    console.error('pushAllowlistStore: fetchPushAllowlistBundle failed', err?.message || err);
    return { ok: false, catalogTypes: new Set(), enabledTypes: new Set() };
  }
}

/**
 * Effective allowlist: enabled catalog types plus EXTRA entries that exist in catalog.
 * On bundle.ok === false, returns empty Set (fail-closed; no extras).
 *
 * @param {{ ok: boolean, catalogTypes: Set<string>, enabledTypes: Set<string> }} bundle
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Set<string>}
 */
function mergePushAllowlist(bundle, env = process.env) {
  if (!bundle || bundle.ok !== true) {
    return new Set();
  }
  const { catalogTypes, enabledTypes } = bundle;
  const out = new Set(enabledTypes);
  for (const t of parseAllowlistExtra(env.PUSH_ALLOWLIST_EXTRA)) {
    if (catalogTypes.has(t)) out.add(t);
  }
  return out;
}

module.exports = {
  fetchPushAllowlistBundle,
  mergePushAllowlist,
  normalizePushAllowlistRows,
};
