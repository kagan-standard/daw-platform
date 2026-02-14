# BeerBook + Keycloak SSO — Deployment Guide

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                 Keycloak (auth)                       │
│            auth.drinksafterwork.net                   │
│                 Realm: "daw"                          │
│                                                      │
│  Clients:                                            │
│  ├── element      → Element Web / Element X          │
│  ├── synapse      → Matrix Synapse (OIDC provider)   │
│  ├── beerbook     → BeerBook app                     │
│  ├── daw-website  → Main DAW website                 │
│  └── fantasy-fb   → Fantasy Football (future)        │
└──────────────────────────────────────────────────────┘
         │
    ┌────┴─────┬──────────┬──────────┐
    ▼          ▼          ▼          ▼
 Synapse   BeerBook   DAW Web   Fantasy FB
 (Matrix)  (Supabase) (future)  (future)
```

**One account. One login. Every DAW service.**

---

## Step 1: Deploy Keycloak

### DNS

Add an A record:
```
auth.drinksafterwork.net → 178.156.232.88
```

### Docker Compose

Create `/opt/keycloak/docker-compose.yml`:

```yaml
version: "3.8"

services:
  keycloak:
    image: quay.io/keycloak/keycloak:26.1
    container_name: keycloak
    restart: unless-stopped
    command: start
    environment:
      # Admin credentials (change these!)
      KC_BOOTSTRAP_ADMIN_USERNAME: admin
      KC_BOOTSTRAP_ADMIN_PASSWORD: CHANGE_ME_TO_SOMETHING_SECURE
      # Database (uses built-in H2 for small deployments)
      # For production with your existing Postgres, uncomment below:
      # KC_DB: postgres
      # KC_DB_URL: jdbc:postgresql://matrix-postgres:5432/keycloak
      # KC_DB_USERNAME: keycloak
      # KC_DB_PASSWORD: CHANGE_ME
      # Proxy settings (Traefik handles TLS)
      KC_PROXY_HEADERS: xforwarded
      KC_HTTP_ENABLED: "true"
      KC_HOSTNAME: auth.drinksafterwork.net
    networks:
      - traefik
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.keycloak.rule=Host(`auth.drinksafterwork.net`)"
      - "traefik.http.routers.keycloak.entrypoints=web-secure"
      - "traefik.http.routers.keycloak.tls=true"
      - "traefik.http.routers.keycloak.tls.certresolver=default"
      - "traefik.http.services.keycloak.loadbalancer.server.port=8080"

networks:
  traefik:
    external: true
```

Start it:
```bash
mkdir -p /opt/keycloak
cd /opt/keycloak
# Create docker-compose.yml (paste above)
docker compose up -d
```

Verify: visit `https://auth.drinksafterwork.net` — you should see the Keycloak admin login.

---

## Step 2: Configure Keycloak Realm & Clients

### Create the "daw" Realm

1. Log into Keycloak admin at `https://auth.drinksafterwork.net`
2. Click dropdown top-left (says "master") → **Create Realm**
3. Name: `daw`
4. Enabled: ON
5. Save

### Configure Realm Settings

1. **Realm Settings → Login tab:**
   - User registration: ON
   - Forgot password: ON
   - Remember me: ON
   - Email as username: OFF (let people pick usernames)

2. **Realm Settings → Email tab** (optional but recommended):
   - Configure SMTP if you want email verification

3. **Realm Settings → Themes tab:**
   - Login theme: `keycloak` (or customize later)

### Create Client: `beerbook`

1. Go to **Clients → Create Client**
2. Client ID: `beerbook`
3. Client type: OpenID Connect
4. Next →
5. Client authentication: **OFF** (public client — SPA)
6. Authorization: OFF
7. Standard flow: **ON**
8. Direct access grants: OFF
9. Next →
10. Valid redirect URIs:
    ```
    https://beerbook.drinksafterwork.net/*
    http://localhost:*
    ```
11. Valid post logout redirect URIs:
    ```
    https://beerbook.drinksafterwork.net/*
    http://localhost:*
    ```
12. Web origins:
    ```
    https://beerbook.drinksafterwork.net
    http://localhost:8000
    ```
13. Save

### Create Client: `synapse` (for Matrix)

1. **Clients → Create Client**
2. Client ID: `synapse`
3. Client type: OpenID Connect
4. Next →
5. Client authentication: **ON** (confidential — server-side)
6. Standard flow: ON
7. Next →
8. Valid redirect URIs:
    ```
    https://matrix.drinksafterwork.net/_synapse/client/oidc/callback
    ```
9. Web origins: `https://matrix.drinksafterwork.net`
10. Save
11. Go to **Credentials tab** → copy the **Client secret**

### Create Client: `daw-website` (for future main site)

Same pattern as `beerbook` — public client, with redirect URIs for `drinksafterwork.net`.

---

## Step 3: Connect Matrix Synapse to Keycloak

Add to your Matrix `vars.yml` (in `/opt/matrix-docker-ansible-deploy/inventory/host_vars/matrix.drinksafterwork.net/vars.yml`):

```yaml
# Enable OIDC with Keycloak
matrix_synapse_configuration_extension_yaml: |
  oidc_providers:
    - idp_id: keycloak
      idp_name: "Drinks After Work"
      issuer: "https://auth.drinksafterwork.net/realms/daw"
      client_id: "synapse"
      client_secret: "PASTE_YOUR_CLIENT_SECRET_HERE"
      scopes: ["openid", "profile"]
      user_mapping_provider:
        config:
          localpart_template: "{% raw %}{{ user.preferred_username }}{% endraw %}"
          display_name_template: "{% raw %}{{ user.name }}{% endraw %}"
      allow_existing_users: true
      backchannel_logout_enabled: true
```

Then redeploy:
```bash
cd /opt/matrix-docker-ansible-deploy
ansible-playbook -i inventory/hosts setup.yml --tags=setup-synapse,start
```

Now Element will show a "Sign in with Drinks After Work" button that redirects to Keycloak.

### Migrating Existing Users

If you have users who already registered via Matrix directly, you can link them to Keycloak accounts. After they create a Keycloak account with the same username, run this SQL in your Matrix Postgres:

```sql
INSERT INTO user_external_ids 
VALUES('oidc-keycloak', 'KEYCLOAK_USER_ID', '@username:drinksafterwork.net');
```

Get the Keycloak user ID from: Keycloak Admin → Users → click user → the ID is in the URL.

---

## Step 4: Deploy BeerBook

### DNS

```
beerbook.drinksafterwork.net → 178.156.232.88
```

### Docker Compose

Create `/opt/beerbook/docker-compose.yml`:

```yaml
version: "3.8"

services:
  beerbook:
    image: nginx:alpine
    container_name: beerbook
    restart: unless-stopped
    volumes:
      - ./site:/usr/share/nginx/html:ro
    networks:
      - traefik
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.beerbook.rule=Host(`beerbook.drinksafterwork.net`)"
      - "traefik.http.routers.beerbook.entrypoints=web-secure"
      - "traefik.http.routers.beerbook.tls=true"
      - "traefik.http.routers.beerbook.tls.certresolver=default"
      - "traefik.http.services.beerbook.loadbalancer.server.port=80"

networks:
  traefik:
    external: true
```

### Upload Files

From your Windows machine:
```powershell
# Copy the beerbook folder contents to the server
scp -r C:\Users\kenyo\Downloads\files\beerbook\* root@178.156.232.88:/opt/beerbook/site/
```

Start:
```bash
cd /opt/beerbook
docker compose up -d
```

### First-Time BeerBook Config

1. Visit `https://beerbook.drinksafterwork.net`
2. Click ⚙ Configure connection
3. Enter:
   - **Keycloak Realm URL:** `https://auth.drinksafterwork.net/realms/daw`
   - **Client ID:** `beerbook`
   - **Supabase URL:** your Supabase project URL
   - **Supabase Key:** your anon key
4. Save & Connect
5. Click "Sign In with DAW" — you'll be redirected to Keycloak

---

## Step 5: Update the Landing Page

Your current landing page at `drinksafterwork.net` has a launcher with DAW Chat, Website, and Fantasy Football. Add BeerBook as a new launcher card:

```html
<!-- BeerBook -->
<a href="https://beerbook.drinksafterwork.net" class="launch-btn" id="launch-beerbook">
  <div class="launch-icon beerbook">
    <span style="font-size:24px">🍺</span>
  </div>
  <div class="launch-info">
    <div class="launch-name">BeerBook</div>
    <div class="launch-desc">Rate & review beers</div>
  </div>
  <span class="launch-badge badge-live">Live</span>
  <span class="launch-arrow">→</span>
</a>
```

---

## DNS Summary

| Record | Type | Value |
|---|---|---|
| `drinksafterwork.net` | A | `178.156.232.88` |
| `matrix.drinksafterwork.net` | A | `178.156.232.88` |
| `element.drinksafterwork.net` | A | `178.156.232.88` |
| `auth.drinksafterwork.net` | A | `178.156.232.88` |
| `beerbook.drinksafterwork.net` | A | `178.156.232.88` |

---

## How SSO Works for Users

1. User visits `beerbook.drinksafterwork.net` → clicks "Sign In with DAW"
2. Redirected to `auth.drinksafterwork.net` (Keycloak login page)
3. If already logged in to any DAW service → auto-authenticated (SSO magic)
4. If not → enters username/password once
5. Redirected back to BeerBook, fully authenticated
6. Next time they visit Element, Fantasy Football, etc. → already logged in

**That's the whole point.** One login, everything works.
