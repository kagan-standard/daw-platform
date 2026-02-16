Phase 3.5: Custom Keycloak Login Theme
Read cursor/prompts/00_system.md rules.
Goal: Create a custom Keycloak login theme that matches the DAW brand identity. The theme should have a slider-style UI where the login and register forms slide between each other, matching the aesthetic of the DAW landing page.
Location: infra/keycloak/themes/daw/login/
Required files:

theme.properties — theme config (parent = keycloak)
login.ftl — login page template
register.ftl — registration page template
resources/css/daw-login.css — custom styles
resources/img/logo.jpg — DAW logo (copy from apps/daw-web/ or reference existing)

Design requirements:

Dark navy background (#0b0e1a) with animated stars or subtle particle effect
Cityscape silhouette at bottom (match landing page)
DAW logo centered above the form
Gold accent colors (#f5b731, #fdd868)
Fonts: Bebas Neue for headers, Outfit for body (Google Fonts CDN)
Slider animation between Login and Register forms (smooth horizontal slide)
"Sign In" and "Create Account" tabs at top of card that toggle the slider
Form inputs styled to match the dark theme (dark inputs, gold focus borders)
Gold primary buttons, same gradient as landing page
Mobile responsive (360px+)
"Drinks After Work" branding with "WHERE THE CREW LINKS UP" tagline
Channel pills at bottom (Politics, Gaming, Fantasy Football, General)
Keep all Keycloak form field names and action URLs intact — only restyle, don't break functionality
Support error messages and validation feedback from Keycloak

Keycloak FreeMarker notes:

Login form action: ${url.loginAction}
Register form action: ${url.registrationAction}
Error messages: <#if message?has_content>${message.summary}</#if>
Username field: ${(login.username!'')}
Keep all hidden fields and CSRF tokens that Keycloak injects
Social/SSO buttons: ${url.socialLoginUrl} if applicable

Do NOT modify:

Any docker-compose files
Any Keycloak realm config
Any other app files

Output:

All theme files in infra/keycloak/themes/daw/login/
Instructions for how to mount the theme into the Keycloak container


Feed that to Cursor and it'll build the theme. After it's done, we'll mount it into Keycloak and activate it. Want to kick that off? Opus 4.6