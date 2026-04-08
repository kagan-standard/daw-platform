/**
 * Rankings endpoints — beer leaderboard by ELO power score.
 * GET /api/rankings/beers
 */
const express = require('express');
const { getTierName, ELO_TIERS } = require('../lib/eloTiers');
const { fetchBeerTrendsBatch } = require('../lib/eloTrend');

const TIER_NAMES = new Set(ELO_TIERS.map(t => t.name));

module.exports = function (opts) {
  const { rest, totalFromContentRange, softAuthMiddleware } = opts;
  const router = express.Router();

  router.get('/beers', async (req, res, next) => {
    try {
      const rawLimit = parseInt(req.query.limit, 10);
      const rawOffset = parseInt(req.query.offset, 10);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 50;
      const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
      const tierFilter = (req.query.tier || '').trim();

      // Build query against beers_with_elo view
      let path = '/beers_with_elo?select=id,name,brewery_name,style,abv,global_elo,comparison_count';
      path += '&global_elo=not.is.null';
      path += '&style=not.is.null&style=neq.&abv=not.is.null';
      path += `&order=global_elo.desc.nullslast&limit=${limit}&offset=${offset}`;

      // Optional tier filter: translate tier name to ELO range
      if (tierFilter && TIER_NAMES.has(tierFilter)) {
        const tier = ELO_TIERS.find(t => t.name === tierFilter);
        if (tier) {
          path += `&global_elo=gte.${tier.min}`;
          if (Number.isFinite(tier.max)) {
            path += `&global_elo=lte.${tier.max}`;
          }
        }
      }

      const { status, headers, body } = await rest('GET', path, { headers: { Prefer: 'count=exact' } });
      if (status >= 400) {
        return res.status(status >= 500 ? 502 : status).json(body || { error: 'Rankings fetch failed' });
      }

      const rows = Array.isArray(body) ? body : [];
      const total = totalFromContentRange(headers['content-range']) ?? rows.length;

      // Batch fetch trends
      const beerIds = rows.map(r => r.id).filter(Boolean);
      const [trends, backerCounts] = await Promise.all([
        fetchBeerTrendsBatch(rest, beerIds).catch(() => ({})),
        fetchBackerCounts(rest, beerIds).catch(() => ({})),
      ]);

      const data = rows.map((r, i) => {
        const elo = Number(r.global_elo) || 1500;
        const newWindow = { trend: 'new', delta: 0, tier_changed: false };
        const trend = trends[r.id] || { trend_3d: newWindow, trend_7d: newWindow };
        return {
          rank: offset + i + 1,
          beer_id: r.id,
          name: r.name,
          brewery: r.brewery_name || null,
          style: r.style || null,
          abv: r.abv != null ? Number(r.abv) : null,
          power_score: elo,
          elo_tier: getTierName(elo),
          elo_trend: { trend_3d: trend.trend_3d || newWindow, trend_7d: trend.trend_7d || newWindow },
          total_backers: backerCounts[r.id] || 0,
          comparison_count: Number(r.comparison_count) || 0,
        };
      });

      res.json({ data, pagination: { limit, offset, total } });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/rankings/challenge/current — active weekly challenge + crew standings
  router.get('/challenge/current', softAuthMiddleware, async (req, res, next) => {
    try {
      const now = new Date().toISOString();

      // 1. Find active challenge: unresolved (winner_crew_id IS NULL) and not yet ended (week_end > now)
      const challengePath = `/weekly_challenges?winner_crew_id=is.null&week_end=gt.${encodeURIComponent(now)}&order=week_start.desc&limit=1`;
      const { status: cStatus, body: cBody } = await rest('GET', challengePath);
      if (cStatus >= 400) {
        return res.status(cStatus >= 500 ? 502 : cStatus).json(cBody || { error: 'Challenge fetch failed' });
      }

      const challenges = Array.isArray(cBody) ? cBody : [];
      if (challenges.length === 0) {
        return res.json({ challenge: null, standings: [], my_crew: null });
      }

      const ch = challenges[0];

      // 2. Get leaderboard via RPC
      const { status: lStatus, body: lBody } = await rest('POST', '/rpc/get_challenge_leaderboard', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_challenge_id: ch.id }),
      });
      if (lStatus >= 400) {
        return res.status(lStatus >= 500 ? 502 : lStatus).json(lBody || { error: 'Leaderboard fetch failed' });
      }

      const rawRows = Array.isArray(lBody) ? lBody : (lBody || []);
      const standings = rawRows.map(r => ({
        crew_id: r.crew_id,
        crew_name: r.crew_name,
        progress: r.current_count || 0,
        member_count: r.contributing_member_count || 0,
        rank: r.rank,
      }));

      // 3. Build my_crew if authenticated
      let myCrew = null;
      if (req.claims && req.claims.sub) {
        const me = req.claims.sub;
        const { status: mStatus, body: mBody } = await rest('GET',
          `/crew_members?user_id=eq.${encodeURIComponent(me)}&select=crew_id`
        );
        if (mStatus < 400 && Array.isArray(mBody) && mBody.length > 0) {
          const myCrewIds = mBody.map(r => r.crew_id);

          // Pick crew with highest progress in standings; fall back to first
          let bestId = myCrewIds[0];
          let bestProgress = -1;
          for (const cid of myCrewIds) {
            const row = standings.find(s => s.crew_id === cid);
            if (row && row.progress > bestProgress) {
              bestProgress = row.progress;
              bestId = cid;
            }
          }

          const standing = standings.find(s => s.crew_id === bestId);
          if (standing) {
            myCrew = {
              crew_id: standing.crew_id,
              crew_name: standing.crew_name,
              progress: standing.progress,
              rank: standing.rank,
            };
          } else {
            // Crew exists but has zero progress — fetch crew name
            const { status: nStatus, body: nBody } = await rest('GET',
              `/crews?id=eq.${encodeURIComponent(bestId)}&select=id,name&limit=1`
            );
            const crewRow = (nStatus < 400 && Array.isArray(nBody) && nBody[0]) ? nBody[0] : null;
            myCrew = {
              crew_id: bestId,
              crew_name: crewRow ? crewRow.name : null,
              progress: 0,
              rank: null,
            };
          }
        }
      }

      // 4. Shape challenge object
      const challenge = {
        id: ch.id,
        title: ch.title,
        description: ch.description,
        starts_at: ch.week_start,
        ends_at: ch.week_end,
        prize_pot_tabs: ch.reward_tabs || 0,
      };

      res.json({ challenge, standings, my_crew: myCrew });
    } catch (e) {
      next(e);
    }
  });

  return router;
};

/**
 * Batch fetch active backer counts for a list of beer IDs.
 * Returns { [beer_id]: count }
 */
async function fetchBackerCounts(rest, beerIds) {
  const result = {};
  if (!beerIds || beerIds.length === 0) return result;
  const filter = [...new Set(beerIds)].map(id => encodeURIComponent(id)).join(',');
  const { status, body } = await rest('GET',
    `/beer_backs?beer_id=in.(${filter})&status=eq.active&select=beer_id`
  );
  if (status >= 400 || !Array.isArray(body)) return result;
  for (const row of body) {
    result[row.beer_id] = (result[row.beer_id] || 0) + 1;
  }
  return result;
}
