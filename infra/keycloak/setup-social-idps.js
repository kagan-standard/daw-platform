/* eslint-disable no-console */

// Idempotent Keycloak configuration script for social identity providers and beerbook-mobile client.
// Usage (example):
//   KEYCLOAK_URL="https://auth.drinksafterwork.net" \
//   KEYCLOAK_ADMIN_CLIENT_ID="admin-cli" \
//   KEYCLOAK_ADMIN_CLIENT_SECRET="..." \
//   node infra/keycloak/setup-social-idps.js

const REALM = 'daw';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const KEYCLOAK_URL = requireEnv('KEYCLOAK_URL').replace(/\/+$/, '');
const ADMIN_CLIENT_ID = requireEnv('KEYCLOAK_ADMIN_CLIENT_ID');
const ADMIN_CLIENT_SECRET = requireEnv('KEYCLOAK_ADMIN_CLIENT_SECRET');

async function getAdminToken() {
  const params = new URLSearchParams();
  params.set('grant_type', 'client_credentials');
  params.set('client_id', ADMIN_CLIENT_ID);
  params.set('client_secret', ADMIN_CLIENT_SECRET);

  const url = `${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to obtain admin token (${res.status}): ${text}`);
  }

  const json = await res.json();
  if (!json.access_token) {
    throw new Error('Admin token response missing access_token');
  }
  return json.access_token;
}

async function kcRequest(token, method, path, body) {
  const url = `${KEYCLOAK_URL}${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
  };
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body: payload });
  if (!res.ok && res.status !== 409) {
    const text = await res.text();
    throw new Error(`${method} ${path} failed (${res.status}): ${text}`);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    return await res.json();
  }
  return await res.text();
}

async function ensureIdentityProvider(token, { providerId, alias, displayName, config, firstBrokerLoginFlowAlias }) {
  console.log(`\nEnsuring identity provider '${alias}' (${providerId})...`);

  const existing = await kcRequest(token, 'GET', `/admin/realms/${encodeURIComponent(REALM)}/identity-provider/instances`, undefined);
  const current = Array.isArray(existing)
    ? existing.find((p) => p.alias === alias)
    : null;

  const payload = {
    alias,
    displayName: displayName || alias,
    providerId,
    enabled: true,
    trustEmail: true,
    firstBrokerLoginFlowAlias: firstBrokerLoginFlowAlias || 'first broker login',
    storeToken: false,
    addReadTokenRoleOnCreate: false,
    updateProfileFirstLoginMode: 'on',
    config,
  };

  if (!current) {
    console.log(`  Creating identity provider '${alias}'...`);
    await kcRequest(
      token,
      'POST',
      `/admin/realms/${encodeURIComponent(REALM)}/identity-provider/instances`,
      payload,
    );
    console.log(`  Created identity provider '${alias}'.`);
  } else {
    console.log(`  Identity provider '${alias}' exists, updating config...`);
    await kcRequest(
      token,
      'PUT',
      `/admin/realms/${encodeURIComponent(REALM)}/identity-provider/instances/${encodeURIComponent(alias)}`,
      { ...current, ...payload },
    );
    console.log(`  Updated identity provider '${alias}'.`);
  }
}

async function ensureIdpMapper(token, { identityProviderAlias, name, identityProviderMapper, config }) {
  console.log(`    Ensuring mapper '${name}' on '${identityProviderAlias}'...`);
  const basePath = `/admin/realms/${encodeURIComponent(
    REALM,
  )}/identity-provider/instances/${encodeURIComponent(identityProviderAlias)}`;

  const existing = await kcRequest(token, 'GET', `${basePath}/mappers`, undefined);
  const current = Array.isArray(existing)
    ? existing.find((m) => m.name === name)
    : null;

  const payload = {
    name,
    identityProviderAlias,
    identityProviderMapper,
    config,
  };

  if (!current) {
    await kcRequest(token, 'POST', `${basePath}/mappers`, payload);
    console.log(`    Created mapper '${name}'.`);
  } else {
    await kcRequest(
      token,
      'PUT',
      `${basePath}/mappers/${encodeURIComponent(current.id)}`,
      { ...current, ...payload },
    );
    console.log(`    Updated mapper '${name}'.`);
  }
}

async function ensureGoogleIdp(token) {
  const clientId = requireEnv('GOOGLE_CLIENT_ID');
  const clientSecret = requireEnv('GOOGLE_CLIENT_SECRET');

  await ensureIdentityProvider(token, {
    providerId: 'google',
    alias: 'google',
    displayName: 'Google',
    firstBrokerLoginFlowAlias: 'first broker login',
    config: {
      clientId,
      clientSecret,
      defaultScope: 'openid email profile',
      syncMode: 'IMPORT',
      'gui-order': '1',
      prompt: 'consent',
      useJwksUrl: 'true',
      validateSignature: 'true',
    },
  });

  const baseConfig = {
    identityProviderAlias: 'google',
  };

  // Email -> email
  await ensureIdpMapper(token, {
    ...baseConfig,
    name: 'google-email',
    identityProviderMapper: 'oidc-user-attribute-idp-mapper',
    config: {
      'claim': 'email',
      'user.attribute': 'email',
      'syncMode': 'INHERIT',
    },
  });

  // Given name -> firstName
  await ensureIdpMapper(token, {
    ...baseConfig,
    name: 'google-first-name',
    identityProviderMapper: 'oidc-user-attribute-idp-mapper',
    config: {
      'claim': 'given_name',
      'user.attribute': 'firstName',
      'syncMode': 'INHERIT',
    },
  });

  // Family name -> lastName
  await ensureIdpMapper(token, {
    ...baseConfig,
    name: 'google-last-name',
    identityProviderMapper: 'oidc-user-attribute-idp-mapper',
    config: {
      'claim': 'family_name',
      'user.attribute': 'lastName',
      'syncMode': 'INHERIT',
    },
  });

  // Picture -> picture
  await ensureIdpMapper(token, {
    ...baseConfig,
    name: 'google-picture',
    identityProviderMapper: 'oidc-user-attribute-idp-mapper',
    config: {
      'claim': 'picture',
      'user.attribute': 'picture',
      'syncMode': 'INHERIT',
    },
  });
}

async function ensureAppleIdp(token) {
  const clientId = requireEnv('APPLE_SERVICE_ID');
  const teamId = requireEnv('APPLE_TEAM_ID');
  const keyId = requireEnv('APPLE_KEY_ID');
  const privateKey = requireEnv('APPLE_PRIVATE_KEY');

  await ensureIdentityProvider(token, {
    providerId: 'apple',
    alias: 'apple',
    displayName: 'Apple',
    firstBrokerLoginFlowAlias: 'first broker login',
    config: {
      clientId,
      teamId,
      keyId,
      privateKey,
      defaultScope: 'name email',
      syncMode: 'IMPORT',
      'gui-order': '2',
    },
  });

  const baseConfig = {
    identityProviderAlias: 'apple',
  };

  // Email -> email
  await ensureIdpMapper(token, {
    ...baseConfig,
    name: 'apple-email',
    identityProviderMapper: 'oidc-user-attribute-idp-mapper',
    config: {
      'claim': 'email',
      'user.attribute': 'email',
      'syncMode': 'INHERIT',
    },
  });

  // First name -> firstName (update only on first login)
  await ensureIdpMapper(token, {
    ...baseConfig,
    name: 'apple-first-name',
    identityProviderMapper: 'oidc-user-attribute-idp-mapper',
    config: {
      'claim': 'given_name',
      'user.attribute': 'firstName',
      'syncMode': 'IMPORT',
    },
  });

  // Last name -> lastName (update only on first login)
  await ensureIdpMapper(token, {
    ...baseConfig,
    name: 'apple-last-name',
    identityProviderMapper: 'oidc-user-attribute-idp-mapper',
    config: {
      'claim': 'family_name',
      'user.attribute': 'lastName',
      'syncMode': 'IMPORT',
    },
  });
}

async function ensureBeerbookMobileClient(token) {
  console.log('\nEnsuring client \'beerbook-mobile\'...');
  const clients = await kcRequest(
    token,
    'GET',
    `/admin/realms/${encodeURIComponent(REALM)}/clients?clientId=beerbook-mobile`,
    undefined,
  );
  const current = Array.isArray(clients) && clients.length > 0 ? clients[0] : null;

  const clientPayload = {
    clientId: 'beerbook-mobile',
    name: 'Beerbook Mobile',
    publicClient: true,
    protocol: 'openid-connect',
    standardFlowEnabled: true,
    implicitFlowEnabled: false,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: false,
    redirectUris: ['beerbook://auth/*', 'exp://*/--/auth/*'],
    webOrigins: ['+'],
    attributes: {
      'pkce.code.challenge.method': 'S256',
      'post.logout.redirect.uris': '+',
    },
    defaultClientScopes: ['web-origins', 'acr', 'roles', 'profile', 'basic', 'email'],
    optionalClientScopes: ['address', 'phone', 'offline_access', 'organization', 'microprofile-jwt'],
  };

  if (!current) {
    console.log("  Client 'beerbook-mobile' not found, creating...");
    await kcRequest(
      token,
      'POST',
      `/admin/realms/${encodeURIComponent(REALM)}/clients`,
      clientPayload,
    );
    console.log("  Created client 'beerbook-mobile'.");
  } else {
    console.log("  Client 'beerbook-mobile' exists, updating core settings...");
    await kcRequest(
      token,
      'PUT',
      `/admin/realms/${encodeURIComponent(REALM)}/clients/${encodeURIComponent(current.id)}`,
      { ...current, ...clientPayload, id: current.id },
    );
    console.log("  Updated client 'beerbook-mobile'.");
  }
}

async function main() {
  try {
    // Ensure global fetch is available (Node 18+). If you run on older Node, install node-fetch and require it here.
    if (typeof fetch !== 'function') {
      // eslint-disable-next-line global-require
      global.fetch = require('node-fetch');
    }

    console.log('Obtaining Keycloak admin token...');
    const token = await getAdminToken();
    console.log('Admin token acquired.');

    await ensureBeerbookMobileClient(token);
    await ensureGoogleIdp(token);
    await ensureAppleIdp(token);

    console.log('\nKeycloak social identity providers and client configuration completed successfully.');
  } catch (err) {
    console.error('Error configuring Keycloak social identity providers:', err.message || err);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  // eslint-disable-next-line no-floating-decimal
  main();
}

