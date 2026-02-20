# Keycloak Theme — Fix Theme Not Loading

## Context Files
- `infra/compose/docker-compose.yml` — Keycloak service definition
- `infra/keycloak/themes/daw/` — the custom DAW theme directory

---

## Problem

The custom DAW Keycloak theme (dark background, gold accents, DAW branding) is NOT being applied. The Keycloak login/register pages show the styled version because of CSS-only overrides that may be cached, but the registration form fields are unstyled. Restarting Keycloak doesn't help.

## Root Cause

**The Keycloak container does not have the theme directory mounted.** Looking at `docker-compose.yml`, the `keycloak` service has NO volume mount for the theme files. Keycloak can't use a theme it can't see.

## Fix — Two Steps

### Step 1: Add theme volume mount to docker-compose.yml

In `infra/compose/docker-compose.yml`, add a volume mount to the `keycloak` service:

```yaml
  keycloak:
    image: quay.io/keycloak/keycloak:26.1
    container_name: keycloak
    restart: unless-stopped
    command: start
    environment:
      KC_PROXY: edge
      KC_HOSTNAME: auth.drinksafterwork.net
      KC_HOSTNAME_STRICT: "false"
      KC_HTTP_ENABLED: "true"
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://keycloak-db:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: ${KC_DB_PASSWORD}
      KEYCLOAK_ADMIN: ${KEYCLOAK_ADMIN}
      KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD}
    volumes:
      - ../../infra/keycloak/themes/daw:/opt/keycloak/themes/daw:ro
    depends_on:
      keycloak-db: { condition: service_healthy }
    networks:
      - default
      - traefik
    labels:
      - "traefik.enable=true"
      - "traefik.docker.network=traefik"
      - "traefik.http.routers.keycloak.rule=Host(`auth.drinksafterwork.net`)"
      - "traefik.http.routers.keycloak.entrypoints=web-secure"
      - "traefik.http.routers.keycloak.tls=true"
      - "traefik.http.routers.keycloak.tls.certresolver=default"
      - "traefik.http.services.keycloak.loadbalancer.server.port=8080"
```

The key addition is:
```yaml
    volumes:
      - ../../infra/keycloak/themes/daw:/opt/keycloak/themes/daw:ro
```

This mounts the local theme directory into the Keycloak container at the path where Keycloak looks for custom themes.

### Step 2: Verify the theme directory structure

The theme must follow this exact structure for Keycloak 26.x to recognize it:

```
infra/keycloak/themes/daw/
└── login/
    ├── theme.properties
    ├── resources/
    │   ├── css/
    │   │   └── login.css
    │   └── img/
    │       └── (any logo/background images)
    └── messages/          (optional)
        └── messages_en.properties  (optional)
```

**`theme.properties`** must exist and contain at minimum:

```properties
parent=keycloak
import=common/keycloak

styles=css/login.css
```

This tells Keycloak to extend the default `keycloak` theme and apply your custom CSS on top. Without `theme.properties`, Keycloak won't recognize the theme at all.

If `theme.properties` doesn't exist yet, create it:

```bash
mkdir -p infra/keycloak/themes/daw/login
cat > infra/keycloak/themes/daw/login/theme.properties << 'EOF'
parent=keycloak
import=common/keycloak

styles=css/login.css
EOF
```

### Step 3: Set the theme in Keycloak Admin Console

After deploying with the volume mount, you need to tell the `daw` realm to USE the theme:

1. Log into Keycloak admin: `https://auth.drinksafterwork.net`
2. Select the `daw` realm (top-left dropdown)
3. Go to **Realm Settings** → **Themes** tab
4. Set **Login theme** to `daw`
5. Click **Save**

Alternatively, if you want to set this via the realm export JSON (`infra/keycloak/daw-realm.json`), add/update:

```json
"loginTheme": "daw",
```

at the top level of the realm JSON.

### Step 4: Disable theme caching for development

To make CSS changes take effect immediately without restarting Keycloak, add these to the Keycloak command or environment:

In `docker-compose.yml`, update the `command`:

```yaml
    command: start --spi-theme-static-max-age=-1 --spi-theme-cache-themes=false
```

**Remove these flags before going to production** — they hurt performance. They're only for development/debugging.

### Step 5: Recreate the Keycloak container

After updating `docker-compose.yml`, the container must be recreated (not just restarted) for the new volume mount to take effect:

```bash
cd /opt/daw-platform
docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env up -d keycloak
```

This will recreate the container with the new volume mount. Keycloak data is safe — it's in the `keycloak-db` database, not in the container.

---

## Verification

After deploying:

```bash
# Verify the theme files are visible inside the container
docker exec keycloak ls -la /opt/keycloak/themes/daw/login/
docker exec keycloak cat /opt/keycloak/themes/daw/login/theme.properties

# Check Keycloak logs for theme loading
docker logs keycloak 2>&1 | grep -i theme
```

Then visit `https://auth.drinksafterwork.net/realms/daw/protocol/openid-connect/auth?client_id=daw-web&response_type=code&redirect_uri=https://drinksafterwork.net/` in a browser — you should see the DAW-themed login page.

---

## Checklist

- [ ] `docker-compose.yml` has the theme volume mount on the keycloak service
- [ ] `infra/keycloak/themes/daw/login/theme.properties` exists with `parent=keycloak`
- [ ] `infra/keycloak/themes/daw/login/resources/css/login.css` exists with DAW styles
- [ ] Keycloak container recreated (not just restarted)
- [ ] Keycloak admin → daw realm → Themes → Login theme set to `daw`
- [ ] Login page shows DAW branding (dark background, gold accents)
- [ ] Registration page shows ALL fields with consistent DAW styling
- [ ] Theme caching disabled flags removed after confirming it works

## Constraints
- Do NOT modify Keycloak's built-in themes — only add files to `infra/keycloak/themes/daw/`
- Volume mount is `:ro` (read-only) for safety
- After confirming theme works, remove `--spi-theme-static-max-age=-1 --spi-theme-cache-themes=false` from the command
