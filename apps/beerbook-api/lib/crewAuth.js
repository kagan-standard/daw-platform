/**
 * Shared crew membership authorization guard.
 * Used by crew-scoped feed, stats, and activity endpoints to enforce
 * consistent membership checks (Phase 1, item 1.3).
 */

async function requireCrewMembership(rest, userId, crewId) {
  const out = await rest(
    'GET',
    `/crew_members?crew_id=eq.${encodeURIComponent(crewId)}&user_id=eq.${encodeURIComponent(userId)}&limit=1`
  );
  if (out.status >= 400) return null;
  return Array.isArray(out.body) && out.body[0] ? out.body[0] : null;
}

module.exports = { requireCrewMembership };
