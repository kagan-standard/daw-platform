# BeerBook Domain Migration: drinksafterwork.net → beerbookapp.com

## Current State
| Service          | Current Domain                        | Container        |
|------------------|---------------------------------------|------------------|
| BeerBook Web     | `beerbook.drinksafterwork.net`        | beerbook         |
| BeerBook API     | `api.beerbook.drinksafterwork.net`    | beerbook-api     |
| Keycloak (Auth)  | `auth.drinksafterwork.net`            | keycloak         |
| DAW Website      | `drinksafterwork.net`                 | daw-web          |

## Target State
| Service          | New Domain                   | Old Domain (kept during transition)   |
|------------------|------------------------------|---------------------------------------|
| BeerBook Web     | `beerbookapp.com`            | `beerbook.drinksafterwork.net`        |
| BeerBook API     | `api.beerbookapp.com`        | `api.beerbook.drinksafterwork.net`    |
| Keycloak (Auth)  | `auth.beerbookapp.com`       | `auth.drinksafterwork.net`            |
| DAW Website      | `drinksafterwork.net`        | *(no change)*                         |

---

## Phase 1: DNS Setup (Cloudflare)

### 1a. Create Cloudflare Account & Add Domain
1. Go to https://dash.cloudflare.com → Add Site → `beerbookapp.com`
2. Select **Free** plan
3. Cloudflare will scan existing records (ignore the Squarespace ones)
4. Note the two nameservers Cloudflare assigns (e.g. `ada.ns.cloudflare.com`)

### 1b. Update Nameservers at Squarespace
1. Squarespace → Domains → `beerbookapp.com` → Domain Nameservers
2. Switch to **Custom nameservers**
3. Enter the two Cloudflare nameservers
4. Wait for propagation (usually 15 min – 2 hours)

### 1c. Add DNS Records in Cloudflare
Replace `YOUR_HETZNER_IP` with your server's public IP.

| Type  | Name    | Content             | Proxy   | TTL  |
|-------|---------|---------------------|---------|------|
| A     | `@`     | `YOUR_HETZNER_IP`   | Proxied | Auto |
| A     | `api`   | `YOUR_HETZNER_IP`   | Proxied | Auto |
| A     | `auth`  | `YOUR_HETZNER_IP`   | Proxied | Auto |
| A     | `app`   | `YOUR_HETZNER_IP`   | Proxied | Auto |
| CNAME | `www`   | `beerbookapp.com`   | Proxied | Auto |

### 1d. Cloudflare SSL Settings
- Go to **SSL/TLS** → Set mode to **Full (Strict)**
  - Traefik already handles Let's Encrypt certs, so Cloudflare needs to trust them
- Go to **SSL/TLS → Edge Certificates** → Enable **Always Use HTTPS**

### ⚠️ Important: Cloudflare + Traefik ACME
Since Cloudflare proxies traffic, Traefik's HTTP challenge for Let's Encrypt won't work 
for the new domains (Cloudflare terminates TLS before it reaches Traefik). You have two options:

**Option A (Recommended): Use Cloudflare Origin Certificates**
1. In Cloudflare → SSL/TLS → Origin Server → Create Certificate
2. Generate a cert covering `*.beerbookapp.com` and `beerbookapp.com`
3. Save the cert + key to your Hetzner box (e.g. `/opt/certs/beerbookapp.com.pem` and `.key`)
4. Add a TLS file provider in Traefik for this cert (see Phase 2 notes)

**Option B: Disable Cloudflare proxy (DNS only / grey cloud)**
- Set all records to "DNS only" (grey cloud icon) instead of "Proxied"
- This lets Traefik's HTTP challenge work as-is
- You lose Cloudflare's CDN/DDoS protection but keep simple DNS management
- Easiest path if you just want to get moved over quickly

---

## Phase 2: Update Server Config

### 2a. Replace docker-compose.yml
The updated file is provided alongside this guide. Changes marked with ⚠️ comments:

**Keycloak container:**
- `--hostname` in command → `https://auth.beerbookapp.com`
- Traefik router rule → accepts both `auth.beerbookapp.com` and `auth.drinksafterwork.net`

**beerbook container:**
- Traefik router rule → accepts `beerbookapp.com`, `www.beerbookapp.com`, and `beerbook.drinksafterwork.net`

**beerbook-api container:**
- All `KEYCLOAK_*` env vars → point to `auth.beerbookapp.com`
- `CORS_ORIGIN` → comma-separated list with both domains
- Traefik router rule → accepts both `api.beerbookapp.com` and `api.beerbook.drinksafterwork.net`

### 2b. Deploy
```bash
cd /opt/daw-platform/infra/compose
# Back up current config
cp docker-compose.yml docker-compose.yml.bak

# Replace with updated file
# (copy the new docker-compose.yml here)

# Recreate affected containers
docker compose --env-file .env up -d --force-recreate keycloak beerbook beerbook-api
```

### 2c. Verify Traefik picks up new certs
```bash
# Watch Traefik logs for cert issuance
docker logs matrix-traefik --tail 50 -f | grep -i "acme\|cert\|beerbookapp"
```

---

## Phase 3: Keycloak Configuration

This is critical — Keycloak has internal URL references that need updating.

### 3a. Login to Keycloak Admin
Go to `https://auth.beerbookapp.com` (or old URL until DNS propagates)

### 3b. Update Realm Settings
1. Select the **daw** realm
2. **Realm Settings → General**
   - Frontend URL: `https://auth.beerbookapp.com`

### 3c. Update Client Configurations
For each client (`beerbook-mobile`, `beerbook-service`, and any others):
1. **Settings → Valid Redirect URIs**  
   - Add: `https://beerbookapp.com/*`
   - Add: `com.daw.beerbook://callback` (if using deep links)
   - Keep old `https://beerbook.drinksafterwork.net/*` during transition
2. **Settings → Valid Post Logout Redirect URIs**
   - Same pattern as above
3. **Settings → Web Origins**
   - Add: `https://beerbookapp.com`
   - Add: `https://api.beerbookapp.com`
   - Keep old origins during transition

### 3d. Update Identity Providers (if any)
If you have Apple Sign-In, Google, etc. configured:
- Update the **Redirect URI** in the provider's developer console to use `auth.beerbookapp.com`
- Apple: https://developer.apple.com → Certificates, Identifiers & Profiles → Service IDs
- Google: https://console.cloud.google.com → APIs & Services → Credentials

---

## Phase 4: React Native App Updates

### 4a. API Configuration
Update your app's API base URL config (likely in an env file or config.ts):
```
# Old
API_URL=https://api.beerbook.drinksafterwork.net
AUTH_URL=https://auth.drinksafterwork.net

# New
API_URL=https://api.beerbookapp.com
AUTH_URL=https://auth.beerbookapp.com
```

### 4b. Keycloak Client Config in App
Update the OIDC/Keycloak configuration:
```
# Old issuer
https://auth.drinksafterwork.net/realms/daw

# New issuer
https://auth.beerbookapp.com/realms/daw
```

### 4c. Deep Links / Universal Links
If using universal links for iOS:
- Host `apple-app-site-association` at `https://beerbookapp.com/.well-known/apple-app-site-association`
- Update your Xcode project's Associated Domains: `applinks:beerbookapp.com`

For Android:
- Host `assetlinks.json` at `https://beerbookapp.com/.well-known/assetlinks.json`
- Update `AndroidManifest.xml` intent filters

### 4d. Existing Users / Token Migration
⚠️ **Important**: Existing JWT tokens will have `iss: https://auth.drinksafterwork.net/realms/daw`.
After changing the issuer URL, these tokens will fail validation.

Options:
- **Recommended**: Keep the old domain working during transition. Users will re-authenticate
  naturally as tokens expire (Keycloak default is usually 5-30 min for access tokens).
- Force all users to re-login by bumping the app version with the new URLs.

---

## Phase 5: Cleanup (2-4 weeks after migration)

Once everything is stable on the new domain:

1. **Remove old domain fallbacks** from docker-compose.yml:
   - Remove `|| Host(\`auth.drinksafterwork.net\`)` from keycloak labels
   - Remove `|| Host(\`beerbook.drinksafterwork.net\`)` from beerbook labels  
   - Remove `|| Host(\`api.beerbook.drinksafterwork.net\`)` from beerbook-api labels
   - Remove old domain from `CORS_ORIGIN`

2. **Set up 301 redirects** on old domains (optional but good practice):
   - Add a Traefik middleware to redirect old domains to new ones

3. **Update Keycloak**: Remove old redirect URIs and web origins from clients

4. **DNS**: Old `*.drinksafterwork.net` beerbook subdomains can stay or be removed
   (they're managed by the Matrix Traefik setup separately)

---

## Quick Reference: What Changes Where

| What                              | Old Value                                      | New Value                                |
|-----------------------------------|-------------------------------------------------|------------------------------------------|
| Keycloak `--hostname`             | `https://auth.drinksafterwork.net`              | `https://auth.beerbookapp.com`           |
| Traefik: keycloak Host            | `auth.drinksafterwork.net`                      | `auth.beerbookapp.com` (+ old as fallback)|
| Traefik: beerbook Host            | `beerbook.drinksafterwork.net`                  | `beerbookapp.com` (+ old as fallback)    |
| Traefik: beerbook-api Host        | `api.beerbook.drinksafterwork.net`              | `api.beerbookapp.com` (+ old as fallback)|
| beerbook-api `KEYCLOAK_ISSUER`    | `https://auth.drinksafterwork.net/realms/daw`   | `https://auth.beerbookapp.com/realms/daw`|
| beerbook-api `KEYCLOAK_JWKS_URI`  | `https://auth.drinksafterwork.net/realms/...`   | `https://auth.beerbookapp.com/realms/...`|
| beerbook-api `KEYCLOAK_URL`       | `https://auth.drinksafterwork.net`              | `https://auth.beerbookapp.com`           |
| beerbook-api `CORS_ORIGIN`        | `https://beerbook.drinksafterwork.net`          | Both old + `https://beerbookapp.com`     |
| React Native API URL              | `api.beerbook.drinksafterwork.net`              | `api.beerbookapp.com`                    |
| React Native Auth URL             | `auth.drinksafterwork.net`                      | `auth.beerbookapp.com`                   |
| Keycloak client redirect URIs     | `*drinksafterwork.net*`                         | Add `*beerbookapp.com*` patterns         |
| OAuth providers (Apple/Google)    | Callback to `auth.drinksafterwork.net`          | Callback to `auth.beerbookapp.com`       |
| DNS (Cloudflare)                  | *(n/a — new)*                                   | A records → Hetzner IP                   |
