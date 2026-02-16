# Mounting the DAW Keycloak Login Theme

## Theme location

All theme files live under:

```
infra/keycloak/themes/daw/login/
├── theme.properties
├── template.ftl
├── login.ftl
├── register.ftl
├── footer.ftl
└── resources/
    ├── css/
    │   └── daw-login.css
    ├── js/
    │   └── passwordVisibility.js
    └── img/
        └── logo.jpg   ← copy from apps/daw-web/logo.jpg
```

## Logo

Copy the DAW logo into the theme so the login page can display it:

- **From:** `apps/daw-web/logo.jpg`
- **To:** `infra/keycloak/themes/daw/login/resources/img/logo.jpg`

If `logo.jpg` is missing, the login page still works; the image area will show a broken image until the file is added.

## How to mount the theme into the Keycloak container

Keycloak 26.x expects themes under `/opt/keycloak/themes` inside the container. Mount the repo’s theme directory so the container sees the `daw` theme.

### Option A: Add a volume in docker-compose (recommended)

In `infra/compose/docker-compose.yml`, under the `keycloak` service, add a `volumes` section:

```yaml
  keycloak:
    image: quay.io/keycloak/keycloak:26.1
    container_name: keycloak
    restart: unless-stopped
    command: start
    volumes:
      - ../keycloak/themes:/opt/keycloak/themes:ro
    environment:
      # ... rest unchanged
```

Use the path relative to the compose file. From `infra/compose/` the themes directory is `../keycloak/themes`. On the VPS at `/opt/daw-platform` that would be:

```yaml
volumes:
  - /opt/daw-platform/infra/keycloak/themes:/opt/keycloak/themes:ro
```

Then restart Keycloak:

```bash
docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml --env-file /opt/daw-platform/infra/compose/.env up -d keycloak
```

### Option B: Copy theme into a custom image

If you build a custom Keycloak image, copy the theme into it:

```dockerfile
FROM quay.io/keycloak/keycloak:26.1
COPY themes/daw /opt/keycloak/themes/daw
# ... rest of Dockerfile
```

## Activate the theme in Keycloak

1. Open the Keycloak Admin Console (e.g. `https://auth.drinksafterwork.net`).
2. Select the **daw** realm.
3. Go to **Realm settings** → **Themes**.
4. Set **Login theme** to **daw**.
5. Save.

After that, the login and registration pages will use the DAW theme (navy background, gold accents, cityscape, “Drinks After Work” branding).

## Rollback

- In Realm settings → Themes, set **Login theme** back to **keycloak** (or empty) and save.
- If you added a volume, remove it from `docker-compose.yml` and restart Keycloak to stop using the custom theme files.
