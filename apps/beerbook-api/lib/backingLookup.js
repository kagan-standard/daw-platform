const { getTierName } = require('./eloTiers');

/**
 * Shared backing lookup — used by both routes/backs.js GET handler
 * and the catalog beer detail endpoint.
 *
 * @param {Function} rest - route helper rest(method, path, opts)
 * @param {string} beerId
 * @param {string|null} userId - current user id (null if unauthenticated)
 * @returns {{ total_backers, top_backers, user_back }}
 */
async function getBackingInfo(rest, beerId, userId) {
  const encodedBeer = encodeURIComponent(beerId);

  // Total backers count
  const countRes = await rest('GET', `/beer_backs?beer_id=eq.${encodedBeer}&status=eq.active&select=id`, {
    headers: { Prefer: 'count=exact' },
  });
  const totalBackers = parseInt(countRes.headers?.['content-range']?.split('/')?.[1], 10) || 0;

  // Top 5 backer avatars
  const topRes = await rest('GET', `/beer_backs?beer_id=eq.${encodedBeer}&status=eq.active&select=user_id&order=tabs_staked.desc&limit=5`);
  const topBacks = topRes.status < 400 && Array.isArray(topRes.body) ? topRes.body : [];

  let topBackers = [];
  if (topBacks.length > 0) {
    const userIds = topBacks.map(b => b.user_id);
    const profileFilter = userIds.map(id => encodeURIComponent(id)).join(',');
    const profilesRes = await rest('GET', `/profiles?id=in.(${profileFilter})&select=id,display_name,avatar_url&limit=5`);
    const profiles = profilesRes.status < 400 && Array.isArray(profilesRes.body) ? profilesRes.body : [];
    topBackers = profiles.map(p => ({ user_id: p.id, username: p.display_name, avatar_url: p.avatar_url }));
  }

  // Current user's active back (if authed), enriched with payout info
  let userBack = null;
  if (userId) {
    const myRes = await rest('GET', `/beer_backs?user_id=eq.${encodeURIComponent(userId)}&beer_id=eq.${encodedBeer}&status=eq.active&select=tabs_staked,tier_at_stake,elo_at_stake,staked_at,locked_until&limit=1`);
    if (myRes.status < 400 && Array.isArray(myRes.body) && myRes.body.length) {
      const back = myRes.body[0];
      // Fetch current ELO for this beer to compute payout
      const eloRes = await rest('GET', `/beer_elo_ratings?beer_id=eq.${encodedBeer}&select=global_elo&limit=1`);
      const currentElo = eloRes.status < 400 && Array.isArray(eloRes.body) && eloRes.body[0]
        ? Number(eloRes.body[0].global_elo) || back.elo_at_stake
        : back.elo_at_stake;
      // Call calculate_backing_payout via RPC
      const payoutRes = await rest('POST', '/rpc/calculate_backing_payout', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_tabs_staked: back.tabs_staked,
          p_tier_at_stake: back.tier_at_stake,
          p_current_tier: getTierName(currentElo),
        }),
      });
      const payout = payoutRes.status < 400 && Array.isArray(payoutRes.body) && payoutRes.body[0]
        ? payoutRes.body[0]
        : { payout_available: false, estimated_payout: back.tabs_staked };
      const pastLock = new Date() >= new Date(back.locked_until);
      userBack = {
        tabs_staked: back.tabs_staked,
        tier_at_stake: back.tier_at_stake,
        staked_at: back.staked_at,
        locked_until: back.locked_until,
        payout_available: payout.payout_available && pastLock,
        estimated_payout: payout.estimated_payout,
      };
    }
  }

  return { total_backers: totalBackers, top_backers: topBackers, user_back: userBack };
}

module.exports = { getBackingInfo };
