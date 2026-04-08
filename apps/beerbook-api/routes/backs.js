/**
 * Beer backing (staking) endpoints.
 * Users stake tabs on beers they believe will rise in ELO tier.
 */
const express = require('express');
const { getTier, getTierName, ELO_TIERS } = require('../lib/eloTiers');
const { getBackingInfo } = require('../lib/backingLookup');

// Payout multiplier table: [stakedTierIndex][tiersRisen] = multiplier
// Tiers: 0=Unranked, 1=Local Pick, 2=Regional Gem, 3=Craft Classic, 4=Legend
const PAYOUT_MULTIPLIERS = [
  [0, 2, 4, 8, 12],   // Staked at Unranked
  [0, 1.75, 3, 6, 0],  // Staked at Local Pick
  [0, 1.5, 2.5, 0, 0], // Staked at Regional Gem
  [0, 1.25, 0, 0, 0],  // Staked at Craft Classic
  [0, 0, 0, 0, 0],     // Staked at Legend (can't rise further)
];

function tierIndex(tierName) {
  const idx = ELO_TIERS.findIndex(t => t.name === tierName);
  return idx >= 0 ? idx : 0;
}

module.exports = function (opts) {
  const { rest, authMiddleware, softAuthMiddleware } = opts;
  const router = express.Router();

  // POST /api/beers/:beerId/back — stake tabs on a beer
  router.post('/beers/:beerId/back', authMiddleware, async (req, res, next) => {
    try {
      const userId = req.claims.sub;
      const beerId = req.params.beerId;
      const tabs = parseInt(req.body.tabs, 10);

      if (!Number.isInteger(tabs) || tabs < 1 || tabs > 50) {
        return res.status(400).json({ error: 'tabs must be an integer between 1 and 50' });
      }

      // Check beer exists
      const beerRes = await rest('GET', `/beers?id=eq.${encodeURIComponent(beerId)}&limit=1`);
      if (beerRes.status >= 400 || !Array.isArray(beerRes.body) || !beerRes.body.length) {
        return res.status(404).json({ error: 'Beer not found' });
      }

      // Check no existing active back
      const existingRes = await rest('GET', `/beer_backs?user_id=eq.${encodeURIComponent(userId)}&beer_id=eq.${encodeURIComponent(beerId)}&status=eq.active&limit=1`);
      if (existingRes.status < 400 && Array.isArray(existingRes.body) && existingRes.body.length > 0) {
        return res.status(409).json({ error: 'You already have an active back on this beer' });
      }

      // Check user balance
      const profileRes = await rest('GET', `/profiles?id=eq.${encodeURIComponent(userId)}&select=tabs_balance&limit=1`);
      if (profileRes.status >= 400 || !Array.isArray(profileRes.body) || !profileRes.body.length) {
        return res.status(400).json({ error: 'Could not fetch user balance' });
      }
      const balance = Number(profileRes.body[0].tabs_balance) || 0;
      if (balance < tabs) {
        return res.status(409).json({ error: 'Insufficient tab balance' });
      }

      // Get current ELO for this beer
      const eloRes = await rest('GET', `/beer_elo_ratings?beer_id=eq.${encodeURIComponent(beerId)}&limit=1`);
      const eloRow = eloRes.status < 400 && Array.isArray(eloRes.body) && eloRes.body[0];
      const currentElo = eloRow ? Number(eloRow.global_elo) || 1500 : 1500;
      const currentTier = getTierName(currentElo);

      // Deduct tabs via tabs_ledger
      const eventId = crypto.randomUUID();
      const now = new Date().toISOString();
      const ledgerRes = await rest('POST', '/tabs_ledger', {
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
          event_id: eventId,
          user_id: userId,
          event_type: 'beer_back_stake',
          amount: -tabs,
          breakdown: {},
          context: { beer_id: beerId },
          created_at: now,
        }),
      });
      if (ledgerRes.status >= 400) {
        return res.status(500).json({ error: 'Failed to deduct tabs' });
      }

      // Create beer_backs row
      const lockedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const backRes = await rest('POST', '/beer_backs', {
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
          user_id: userId,
          beer_id: beerId,
          tabs_staked: tabs,
          elo_at_stake: currentElo,
          tier_at_stake: currentTier,
          staked_at: now,
          locked_until: lockedUntil,
          status: 'active',
        }),
      });
      if (backRes.status >= 400) {
        return res.status(500).json({ error: 'Failed to create back' });
      }
      const row = Array.isArray(backRes.body) ? backRes.body[0] : backRes.body;
      res.status(201).json(row);
    } catch (e) {
      next(e);
    }
  });

  // DELETE /api/beers/:beerId/back — early exit or free exit
  router.delete('/beers/:beerId/back', authMiddleware, async (req, res, next) => {
    try {
      const userId = req.claims.sub;
      const beerId = req.params.beerId;

      const backRes = await rest('GET', `/beer_backs?user_id=eq.${encodeURIComponent(userId)}&beer_id=eq.${encodeURIComponent(beerId)}&status=eq.active&limit=1`);
      if (backRes.status >= 400 || !Array.isArray(backRes.body) || !backRes.body.length) {
        return res.status(404).json({ error: 'No active back found on this beer' });
      }
      const back = backRes.body[0];
      const now = new Date();
      const lockedUntil = new Date(back.locked_until);
      const isEarlyExit = now < lockedUntil;

      const tabsReturned = isEarlyExit
        ? Math.floor(back.tabs_staked * 0.8)
        : back.tabs_staked;
      const newStatus = isEarlyExit ? 'early_exit' : 'cashed_out';

      // Credit tabs back
      const eventId = crypto.randomUUID();
      await rest('POST', '/tabs_ledger', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          user_id: userId,
          event_type: 'beer_back_exit',
          amount: tabsReturned,
          breakdown: {},
          context: { beer_id: beerId, back_id: back.id, early_exit: isEarlyExit },
        }),
      });

      // Update back record
      const patchRes = await rest('PATCH', `/beer_backs?id=eq.${encodeURIComponent(back.id)}`, {
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
          status: newStatus,
          cashed_out_at: now.toISOString(),
          tabs_returned: tabsReturned,
        }),
      });
      const updated = patchRes.status < 400 && Array.isArray(patchRes.body) ? patchRes.body[0] : null;
      res.json({ tabs_returned: tabsReturned, status: newStatus, back: updated });
    } catch (e) {
      next(e);
    }
  });

  // POST /api/beers/:beerId/back/cashout — cash out a winning back
  router.post('/beers/:beerId/back/cashout', authMiddleware, async (req, res, next) => {
    try {
      const userId = req.claims.sub;
      const beerId = req.params.beerId;

      const backRes = await rest('GET', `/beer_backs?user_id=eq.${encodeURIComponent(userId)}&beer_id=eq.${encodeURIComponent(beerId)}&status=eq.active&limit=1`);
      if (backRes.status >= 400 || !Array.isArray(backRes.body) || !backRes.body.length) {
        return res.status(404).json({ error: 'No active back found on this beer' });
      }
      const back = backRes.body[0];

      // Get current ELO
      const eloRes = await rest('GET', `/beer_elo_ratings?beer_id=eq.${encodeURIComponent(beerId)}&limit=1`);
      const eloRow = eloRes.status < 400 && Array.isArray(eloRes.body) && eloRes.body[0];
      const currentElo = eloRow ? Number(eloRow.global_elo) || 1500 : 1500;

      const stakedIdx = tierIndex(back.tier_at_stake);
      const currentIdx = tierIndex(getTierName(currentElo));
      const tiersRisen = currentIdx - stakedIdx;

      if (tiersRisen < 1) {
        return res.status(400).json({ error: 'Beer has not risen at least one tier since staking' });
      }

      const multiplier = PAYOUT_MULTIPLIERS[stakedIdx]?.[tiersRisen] || 0;
      if (multiplier <= 0) {
        return res.status(400).json({ error: 'No payout available for this tier combination' });
      }

      const payout = Math.floor(back.tabs_staked * multiplier);

      // Credit payout via tabs_ledger
      const eventId = crypto.randomUUID();
      await rest('POST', '/tabs_ledger', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          user_id: userId,
          event_type: 'beer_back_cashout',
          amount: payout,
          breakdown: { multiplier, tiers_risen: tiersRisen },
          context: { beer_id: beerId, back_id: back.id },
        }),
      });

      // Update back record
      const now = new Date().toISOString();
      await rest('PATCH', `/beer_backs?id=eq.${encodeURIComponent(back.id)}`, {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'cashed_out',
          cashed_out_at: now,
          tabs_returned: payout,
        }),
      });

      res.json({ tabs_returned: payout, multiplier, tiers_risen: tiersRisen });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/beers/:beerId/backs — public backer info + current user's back
  router.get('/beers/:beerId/backs', softAuthMiddleware, async (req, res, next) => {
    try {
      const info = await getBackingInfo(rest, req.params.beerId, req.claims?.sub || null);
      res.json(info);
    } catch (e) {
      next(e);
    }
  });

  // POST /api/backs/:backId/cash-out — cash out a single back (manual path)
  router.post('/backs/:backId/cash-out', authMiddleware, async (req, res, next) => {
    try {
      const userId = req.claims.sub;
      const backId = req.params.backId;

      const rpcRes = await rest('POST', '/rpc/cash_out_back', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_back_id: backId, p_user_id: userId }),
      });

      if (rpcRes.status >= 400) {
        console.error('cash_out_back RPC error:', rpcRes.body);
        return res.status(502).json({ error: 'Cash out failed' });
      }

      const row = Array.isArray(rpcRes.body) ? rpcRes.body[0] : rpcRes.body;
      if (!row || !row.success) {
        const code = row?.error_code;
        if (code === 'not_found') return res.status(404).json({ error: 'Back not found' });
        if (code === 'already_cashed_out') return res.status(409).json({ error: 'This back has already been cashed out' });
        if (code === 'still_locked') return res.status(400).json({ error: 'This back is still locked' });
        console.error('cash_out_back unexpected error_code:', code);
        return res.status(500).json({ error: 'Cash out failed' });
      }

      res.json({ tabs_credited: row.tabs_credited, new_balance: row.new_balance });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/users/me/backs — all backs for current user with payout info (via RPC)
  router.get('/users/me/backs', authMiddleware, async (req, res, next) => {
    try {
      const userId = req.claims.sub;
      const status = ['active', 'cashed_out', 'all'].includes(req.query.status) ? req.query.status : 'active';
      const rawLimit = parseInt(req.query.limit, 10);
      const limit = Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.min(rawLimit, 100) : 20;
      const rawOffset = parseInt(req.query.offset, 10);
      const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

      const rpcRes = await rest('POST', '/rpc/get_user_backs', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_user_id: userId, p_status: status, p_limit: limit, p_offset: offset }),
      });
      if (rpcRes.status >= 400) {
        return res.status(rpcRes.status >= 500 ? 502 : rpcRes.status).json(rpcRes.body || { error: 'Failed to fetch backs' });
      }
      res.json(rpcRes.body);
    } catch (e) {
      next(e);
    }
  });

  return router;
};
