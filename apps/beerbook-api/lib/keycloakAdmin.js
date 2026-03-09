const KEYCLOAK_URL = process.env.KEYCLOAK_URL; // e.g. https://auth.drinksafterwork.net
const ADMIN_CLIENT_ID = process.env.KEYCLOAK_ADMIN_CLIENT_ID;
const ADMIN_CLIENT_SECRET = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;
const ADMIN_REALM = process.env.KEYCLOAK_ADMIN_REALM || 'master';
const USER_REALM = 'daw';

/**
 * Service-account token for Keycloak Admin API calls.
 */
async function getAdminToken() {
  const tokenUrl = `${KEYCLOAK_URL}/realms/${ADMIN_REALM}/protocol/openid-connect/token`;
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: ADMIN_CLIENT_ID,
      client_secret: ADMIN_CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Keycloak admin token failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  return data.access_token;
}

/**
 * Create a user in Keycloak. Returns { success, userId } or { error, message }.
 */
async function createUser(adminToken, { email, username, password, display_name }) {
  const usersUrl = `${KEYCLOAK_URL}/admin/realms/${USER_REALM}/users`;
  const res = await fetch(usersUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      username,
      email,
      enabled: true,
      emailVerified: false,
      firstName: display_name || username,
      credentials: [
        {
          type: 'password',
          value: password,
          temporary: false,
        },
      ],
    }),
  });

  if (res.status === 409) {
    const body = await res.json().catch(() => ({}));
    const msg = (body.errorMessage || '').toLowerCase();
    if (msg.includes('email')) {
      return { error: 'email_exists', message: 'An account with this email already exists' };
    }
    return { error: 'username_exists', message: 'This username is already taken' };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error('Keycloak user creation failed:', res.status, body);
    return { error: 'creation_failed', message: 'Account creation failed. Please try again.' };
  }

  const locationHeader = res.headers.get('Location');
  const userId = locationHeader ? locationHeader.split('/').pop() : null;

  return { success: true, userId };
}

const MOBILE_CLIENT_ID = process.env.KEYCLOAK_MOBILE_CLIENT_ID || 'beerbook-service';

/**
 * ROPC token grant. Returns token object on success or { error, message } on failure.
 */
async function getTokensForUser(username, password) {
  const tokenUrl = `${KEYCLOAK_URL}/realms/${USER_REALM}/protocol/openid-connect/token`;
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: MOBILE_CLIENT_ID,
      username,
      password,
      scope: 'openid profile email',
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const desc = (body.error_description || '').toLowerCase();
    const errCode = body.error || '';

    if (desc.includes('invalid user credentials') || desc.includes('invalid username or password')) {
      return { error: 'invalid_credentials', message: 'Invalid username or password' };
    }
    if (desc.includes('not fully set up') || desc.includes('verify your email') || desc.includes('required action')) {
      return { error: 'email_not_verified', message: 'Please verify your email before signing in.' };
    }
    if (desc.includes('account disabled') || desc.includes('account is disabled')) {
      return { error: 'account_disabled', message: 'This account has been disabled.' };
    }

    console.error('ROPC token grant failed:', res.status, body);
    return { error: 'login_failed', message: 'Login failed. Please try again later.' };
  }

  return await res.json();
}

/**
 * Refresh token grant. Returns new token object or { error, message }.
 */
async function refreshTokens(refreshToken) {
  const tokenUrl = `${KEYCLOAK_URL}/realms/${USER_REALM}/protocol/openid-connect/token`;
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: MOBILE_CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error('Token refresh failed:', res.status, body);
    return { error: 'refresh_failed', message: 'Session expired. Please sign in again.' };
  }

  return await res.json();
}

/**
 * Trigger Keycloak verification email for a user. Requires admin token.
 */
async function sendVerificationEmail(adminToken, userId) {
  const url = `${KEYCLOAK_URL}/admin/realms/${USER_REALM}/users/${userId}/send-verify-email`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('Send verification email failed:', res.status, body);
    return false;
  }
  return true;
}

module.exports = { getAdminToken, createUser, getTokensForUser, refreshTokens, sendVerificationEmail };
