function isCrewNotFoundError(body) {
  if (!body || typeof body !== 'object') return false;
  const code = typeof body.code === 'string' ? body.code : '';
  const message = typeof body.message === 'string' ? body.message.toLowerCase() : '';
  return code === 'P0002' || message.includes('crew not found') || message.includes('member not found');
}

function assertSuccess(out, operation) {
  if (out.status >= 400) {
    const err = new Error(`${operation} failed (${out.status})`);
    err.status = out.status;
    err.body = out.body;
    throw err;
  }
}

async function deleteAccountForUser(rest, sub) {
  const userId = encodeURIComponent(String(sub || ''));

  // Remove crew memberships first via RPC to preserve crew invariants.
  const crewMembersOut = await rest('GET', `/crew_members?user_id=eq.${userId}&select=crew_id&limit=1000`);
  assertSuccess(crewMembersOut, 'load crew memberships');

  const memberships = Array.isArray(crewMembersOut.body) ? crewMembersOut.body : [];
  const crewIds = [...new Set(memberships.map((row) => row?.crew_id).filter((value) => typeof value === 'string' && value.trim() !== ''))];

  for (const crewId of crewIds) {
    const rpcOut = await rest('POST', '/rpc/remove_crew_member', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_crew_id: crewId, p_user_id: sub }),
    });
    if (rpcOut.status >= 400 && !isCrewNotFoundError(rpcOut.body)) {
      assertSuccess(rpcOut, `remove crew member for crew ${crewId}`);
    }
  }

  const followsOut = await rest('DELETE', `/follows?or=(follower_id.eq.${userId},followed_id.eq.${userId})`);
  assertSuccess(followsOut, 'delete follows');

  const promptsOut = await rest('DELETE', `/head_to_head_prompts?user_id=eq.${userId}`);
  assertSuccess(promptsOut, 'delete head-to-head prompts');

  const ratingsOut = await rest('DELETE', `/ratings?user_id=eq.${userId}`);
  assertSuccess(ratingsOut, 'delete ratings');

  const tabsLedgerOut = await rest('DELETE', `/tabs_ledger?user_id=eq.${userId}`);
  assertSuccess(tabsLedgerOut, 'delete tabs ledger');

  const achievementsOut = await rest('DELETE', `/user_achievements?user_id=eq.${userId}`);
  assertSuccess(achievementsOut, 'delete user achievements');

  const cosmeticsOut = await rest('DELETE', `/user_cosmetics?user_id=eq.${userId}`);
  assertSuccess(cosmeticsOut, 'delete user cosmetics');

  const profileOut = await rest('DELETE', `/profiles?id=eq.${userId}`);
  assertSuccess(profileOut, 'delete profile');
}

module.exports = { deleteAccountForUser };
