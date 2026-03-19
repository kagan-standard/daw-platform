const test = require('node:test');
const assert = require('node:assert/strict');
const { deleteAccountForUser } = require('../lib/deleteAccount');

test('deleteAccountForUser runs cleanup in expected order', async () => {
  const calls = [];
  const rest = async (method, path, opts = {}) => {
    calls.push({ method, path, opts });
    if (method === 'GET' && path.startsWith('/crew_members?')) {
      return {
        status: 200,
        body: [
          { crew_id: 'crew-1' },
          { crew_id: 'crew-1' },
          { crew_id: 'crew-2' },
          { crew_id: '' },
        ],
      };
    }
    if (method === 'POST' && path === '/rpc/remove_crew_member') return { status: 200, body: {} };
    return { status: 204, body: null };
  };

  await deleteAccountForUser(rest, 'user id/with spaces');

  assert.deepEqual(
    calls.map((call) => `${call.method} ${call.path}`),
    [
      'GET /crew_members?user_id=eq.user%20id%2Fwith%20spaces&select=crew_id&limit=1000',
      'POST /rpc/remove_crew_member',
      'POST /rpc/remove_crew_member',
      'DELETE /follows?or=(follower_id.eq.user%20id%2Fwith%20spaces,followed_id.eq.user%20id%2Fwith%20spaces)',
      'DELETE /head_to_head_prompts?user_id=eq.user%20id%2Fwith%20spaces',
      'DELETE /ratings?user_id=eq.user%20id%2Fwith%20spaces',
      'DELETE /tabs_ledger?user_id=eq.user%20id%2Fwith%20spaces',
      'DELETE /user_achievements?user_id=eq.user%20id%2Fwith%20spaces',
      'DELETE /user_cosmetics?user_id=eq.user%20id%2Fwith%20spaces',
      'DELETE /profiles?id=eq.user%20id%2Fwith%20spaces',
    ]
  );

  const rpcBodies = calls
    .filter((call) => call.method === 'POST' && call.path === '/rpc/remove_crew_member')
    .map((call) => JSON.parse(call.opts.body));
  assert.deepEqual(rpcBodies, [
    { p_crew_id: 'crew-1', p_user_id: 'user id/with spaces' },
    { p_crew_id: 'crew-2', p_user_id: 'user id/with spaces' },
  ]);
});

test('deleteAccountForUser ignores crew not found and still completes', async () => {
  let rpcCalled = false;
  const rest = async (method, path) => {
    if (method === 'GET' && path.startsWith('/crew_members?')) {
      return { status: 200, body: [{ crew_id: 'crew-1' }] };
    }
    if (method === 'POST' && path === '/rpc/remove_crew_member') {
      rpcCalled = true;
      return { status: 404, body: { code: 'P0002', message: 'Crew not found' } };
    }
    return { status: 204, body: null };
  };

  await deleteAccountForUser(rest, 'user-123');
  assert.equal(rpcCalled, true);
});

test('deleteAccountForUser throws when cleanup step fails', async () => {
  const rest = async (method, path) => {
    if (method === 'GET' && path.startsWith('/crew_members?')) return { status: 200, body: [] };
    if (method === 'DELETE' && path.startsWith('/ratings?')) return { status: 500, body: { error: 'boom' } };
    return { status: 204, body: null };
  };

  await assert.rejects(() => deleteAccountForUser(rest, 'user-123'), /delete ratings failed/);
});
