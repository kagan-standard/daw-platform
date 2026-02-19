# Keycloak Theme — Fix Registration Form Field Styling

## Context Files
- `infra/keycloak/themes/daw/login/resources/css/login.css` — the custom DAW Keycloak theme CSS

---

## Problem

The Keycloak registration form has inconsistent field styling:
- **Password** and **Confirm password** fields are properly themed (dark background, gold/amber border)
- **Username**, **Email**, **First name**, and **Last name** fields are unstyled white inputs with no border treatment

Also, the "Back to Login" link shows raw HTML entity `&laquo;` instead of the actual « character.

## Root Cause

The theme CSS likely targets only specific input types (e.g., `input[type="password"]`) or specific Keycloak form IDs from the login page, and misses the text/email inputs that appear on the registration form.

## Fix

### Update `login.css` to style ALL form inputs globally

Find the existing input styling rules and make them apply to ALL inputs inside the Keycloak login/register forms. The Keycloak login pages use the class `#kc-form` or `.pf-c-form` (PatternFly) depending on the theme version.

**Add or update these rules in `login.css`:**

```css
/* ============================================
   Form Inputs — ALL types (login + registration)
   ============================================ */

/* Target all text-like inputs in any Keycloak form */
input[type="text"],
input[type="password"],
input[type="email"],
input[type="tel"],
input[type="url"],
input[type="number"],
input[type="search"],
input,
select,
textarea {
    width: 100%;
    padding: 0.75rem 1rem;
    background: rgba(11, 14, 26, 0.8); /* Dark navy matching DAW background */
    border: 1px solid rgba(245, 183, 49, 0.3); /* Gold border, subtle */
    border-radius: 8px;
    color: #f5f0e8; /* Light cream text */
    font-family: 'Outfit', sans-serif;
    font-size: 0.95rem;
    transition: border-color 0.2s, box-shadow 0.2s;
    outline: none;
    box-sizing: border-box;
}

input:focus,
select:focus,
textarea:focus {
    border-color: #f5b731; /* Gold on focus */
    box-shadow: 0 0 0 3px rgba(245, 183, 49, 0.15);
}

input::placeholder {
    color: rgba(245, 240, 232, 0.4);
}

/* Fix for Keycloak's PatternFly form controls if present */
.pf-c-form-control,
.pf-c-form-control[type="text"],
.pf-c-form-control[type="password"],
.pf-c-form-control[type="email"] {
    background: rgba(11, 14, 26, 0.8) !important;
    border: 1px solid rgba(245, 183, 49, 0.3) !important;
    border-radius: 8px !important;
    color: #f5f0e8 !important;
    padding: 0.75rem 1rem !important;
    font-size: 0.95rem !important;
}

.pf-c-form-control:focus {
    border-color: #f5b731 !important;
    box-shadow: 0 0 0 3px rgba(245, 183, 49, 0.15) !important;
}

/* ============================================
   Labels
   ============================================ */

label,
.pf-c-form__label,
.pf-c-form__label-text {
    color: #f5b731; /* Gold labels */
    font-weight: 600;
    font-size: 0.85rem;
    letter-spacing: 0.03em;
    margin-bottom: 0.4rem;
    display: block;
}

/* Required field asterisk */
.pf-c-form__label-required,
.required {
    color: #e74c3c;
}

/* ============================================
   Registration-specific fixes
   ============================================ */

/* "Required fields" helper text */
#kc-form-options,
.kc-form-options {
    color: rgba(245, 240, 232, 0.5);
    font-size: 0.8rem;
}

/* "Back to Login" link */
#kc-registration a,
a.kc-link,
a[href*="login-actions"] {
    color: #f5b731;
    text-decoration: none;
    transition: color 0.2s;
}

#kc-registration a:hover,
a.kc-link:hover {
    color: #ffd166;
    text-decoration: underline;
}

/* Fix the broken &laquo; entity — style the back link nicely */
#kc-form-options .kc-form-options-wrapper a,
.backToLogin a {
    color: #f5b731;
}

/* ============================================
   Register button
   ============================================ */

/* Make sure the Register submit button matches the Sign In button */
input[type="submit"],
button[type="submit"],
.pf-c-button--primary,
#kc-register-form input[type="submit"],
#kc-register-form button[type="submit"] {
    width: 100%;
    padding: 15px;
    background: #f5b731;
    color: #0b0e1a;
    border: none;
    border-radius: 10px;
    font-family: 'Bebas Neue', sans-serif;
    font-size: 20px;
    letter-spacing: 3px;
    cursor: pointer;
    transition: all 0.3s;
    text-transform: uppercase;
}

input[type="submit"]:hover,
button[type="submit"]:hover {
    background: #e0a82a;
    box-shadow: 0 4px 20px rgba(245, 183, 49, 0.3);
    transform: translateY(-1px);
}

/* ============================================
   Tabs (Sign In / Create Account)
   ============================================ */

/* Style the tab navigation on pages that show both */
#kc-form-login .kc-form-card,
.login-pf-page .card-pf {
    background: rgba(20, 24, 40, 0.95);
    border: 1px solid rgba(245, 183, 49, 0.15);
    border-radius: 16px;
}

/* Tab headers */
.nav-tabs > li > a,
.pf-c-tabs__link {
    color: rgba(245, 183, 49, 0.6);
    font-family: 'Bebas Neue', sans-serif;
    letter-spacing: 2px;
    font-size: 16px;
}

.nav-tabs > li.active > a,
.pf-c-tabs__link.pf-m-current {
    color: #f5b731;
    border-bottom-color: #f5b731;
}

/* ============================================
   Form spacing
   ============================================ */

/* Add consistent spacing between form groups */
.form-group,
.pf-c-form__group {
    margin-bottom: 1rem;
}

/* ============================================
   Footer links (Politics, Gaming, etc.)
   ============================================ */

/* If these are Keycloak social/IDP buttons or realm links, style them */
.kc-social-links a,
.kc-realm-links a {
    color: rgba(245, 240, 232, 0.5);
    border: 1px solid rgba(245, 240, 232, 0.2);
    border-radius: 20px;
    padding: 4px 12px;
    font-size: 0.8rem;
    text-decoration: none;
}
```

### Key Points

1. **Use broad selectors with `!important` where needed** — Keycloak's default theme (or PatternFly) may have high-specificity selectors. The `!important` overrides ensure your DAW theme wins.

2. **Test on BOTH pages** — the Sign In page AND the Registration page. The registration page has more fields and different HTML structure.

3. **The `&laquo;` issue** — this is likely a Keycloak template encoding issue, not a CSS problem. Check if your theme has a custom `register.ftl` template. If so, make sure the "Back to Login" link uses the proper FreeMarker message:
   ```html
   <a href="${url.loginUrl}">&laquo; ${msg("backToLogin")}</a>
   ```
   If you don't have a custom `register.ftl`, this is a Keycloak version bug and you may need to add one. But the CSS fix above will at least make the fields look correct.

4. **After updating the CSS**, restart the Keycloak container to clear the theme cache:
   ```bash
   docker compose -f /opt/daw-platform/infra/compose/docker-compose.yml \
     --env-file /opt/daw-platform/infra/compose/.env \
     restart keycloak
   ```

   Or if Keycloak has theme caching enabled, you may need to disable it temporarily in the Keycloak startup args: `--spi-theme-static-max-age=-1 --spi-theme-cache-themes=false`

---

## Testing Checklist

- [ ] Visit Sign In page → Username, Password fields are dark with gold borders
- [ ] Visit Create Account page → ALL fields (Username, Password, Confirm Password, Email, First name, Last name) are dark with gold borders
- [ ] Focus on any field → gold border highlight with subtle glow
- [ ] Labels are gold colored
- [ ] Register button is gold with dark text (matching Sign In button)
- [ ] "Back to Login" link shows « properly (not `&laquo;`)
- [ ] No white/unstyled inputs anywhere on either page

## Constraints
- Only modify CSS in `infra/keycloak/themes/daw/login/resources/css/login.css`
- If the `&laquo;` fix requires a template change, modify `register.ftl` — do NOT touch `login.ftl`
- Restart Keycloak after changes to clear theme cache
