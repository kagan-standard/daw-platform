/**
 * Crew milestones emission (Phase 2 backend plan).
 * Emit crew_total_ratings and first_venue_visit when a rating is created.
 * Idempotent: unique indexes prevent duplicates on (crew_id, type, data key).
 */

const MILESTONE_THRESHOLDS = [25, 50, 75, 100];

/**
 * Emit crew milestones after a new rating is created.
 * - crew_total_ratings: when crew total crosses 25, 50, 75, or 100 (idempotent per threshold).
 * - first_venue_visit: when user has venue_id and this is their first rating at that venue (idempotent per crew, user, venue).
 * @param {Function} rest - PostgREST client (method, path, opts)
 * @param {Object} opts
 * @param {string} opts.userId - rater user id
 * @param {string} [opts.userDisplayName] - for message text
 * @param {string} [opts.venueId] - rating venue_id
 * @param {string} [opts.venueName] - for message text
 * @param {number} [opts.currentStreakWeeks] - from process-event; if crosses 5 or 10, emit member_streak (optional)
 */
async function emitMilestonesAfterRating(rest, opts) {
  const { userId, userDisplayName, venueId, venueName, currentStreakWeeks } = opts || {};
  if (!userId) return;

  try {
    const countsRes = await rest('POST', '/rpc/crew_rating_counts_for_user', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user_id: userId }),
    });
    if (countsRes.status >= 400) return;
    const counts = Array.isArray(countsRes.body) ? countsRes.body : [];
    const displayName = userDisplayName || 'A crew member';

    for (const row of counts) {
      const crewId = row.crew_id;
      const total = Number(row.total_ratings) || 0;
      for (const threshold of MILESTONE_THRESHOLDS) {
        if (total < threshold) continue;
        const message = `The crew hit ${threshold} total ratings!`;
        const insertRes = await rest('POST', '/crew_milestones', {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            crew_id: crewId,
            type: 'crew_total_ratings',
            occurred_at: new Date().toISOString(),
            data: { total_ratings: total, threshold },
            message,
          }),
        });
        if (insertRes.status >= 400 && insertRes.status !== 409) {
          console.warn('crew_milestones crew_total_ratings insert:', insertRes.status, insertRes.body);
        }
      }
    }

    if (venueId) {
      let resolvedVenueName = venueName;
      if (!resolvedVenueName || !String(resolvedVenueName).trim()) {
        const venueRes = await rest('GET', `/venues?id=eq.${encodeURIComponent(venueId)}&select=name&limit=1`);
        if (venueRes.status < 400 && Array.isArray(venueRes.body) && venueRes.body[0]?.name) {
          resolvedVenueName = venueRes.body[0].name;
        }
      }
      const firstCheckRes = await rest(
        'GET',
        `/ratings?user_id=eq.${encodeURIComponent(userId)}&venue_id=eq.${encodeURIComponent(venueId)}&select=id`,
        { headers: { Prefer: 'count=exact' } }
      );
      const totalAtVenue = parseInt(String(firstCheckRes.headers && firstCheckRes.headers['content-range'] || '').split('/')[1], 10) || 0;
      if (totalAtVenue !== 1) return;

      const membershipsRes = await rest('GET', `/crew_members?user_id=eq.${encodeURIComponent(userId)}&select=crew_id`);
      if (membershipsRes.status >= 400) return;
      const memberships = Array.isArray(membershipsRes.body) ? membershipsRes.body : [];
      const safeVenueName = (resolvedVenueName || 'a new venue').replace(/"/g, "'");
      for (const m of memberships) {
        const insertRes = await rest('POST', '/crew_milestones', {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            crew_id: m.crew_id,
            type: 'first_venue_visit',
            occurred_at: new Date().toISOString(),
            user_id: userId,
            data: { venue_id: venueId, venue_name: safeVenueName },
            message: `${displayName} visited a new venue: ${safeVenueName}`,
          }),
        });
        if (insertRes.status >= 400 && insertRes.status !== 409) {
          console.warn('crew_milestones first_venue_visit insert:', insertRes.status, insertRes.body);
        }
      }
    }

    if (currentStreakWeeks != null && typeof currentStreakWeeks === 'number') {
      const streakThresholds = [5, 10];
      if (streakThresholds.includes(currentStreakWeeks)) {
        const membershipsRes = await rest('GET', `/crew_members?user_id=eq.${encodeURIComponent(userId)}&select=crew_id`);
        if (membershipsRes.status >= 400) return;
        const memberships = Array.isArray(membershipsRes.body) ? membershipsRes.body : [];
        for (const m of memberships) {
          const insertRes = await rest('POST', '/crew_milestones', {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              crew_id: m.crew_id,
              type: 'member_streak',
              occurred_at: new Date().toISOString(),
              user_id: userId,
              data: { streak_weeks: currentStreakWeeks },
              message: `${displayName} hit a ${currentStreakWeeks}-week streak!`,
            }),
          });
          if (insertRes.status >= 400 && insertRes.status !== 409) {
            console.warn('crew_milestones member_streak insert:', insertRes.status, insertRes.body);
          }
        }
      }
    }
  } catch (err) {
    console.error('emitMilestonesAfterRating error:', err && err.message);
  }
}

module.exports = { emitMilestonesAfterRating, MILESTONE_THRESHOLDS };
