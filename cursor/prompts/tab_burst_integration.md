# Tab Burst Animation — Integration Guide

Apply `cursor/prompts/00_system.md` rules.

## Overview

Two new JS files add a reward animation that fires when users earn tabs:
- `tab-burst.js` — the animation engine (self-contained module)
- `tab-burst-admin.js` — admin panel component for tweaking settings live

## Files to Add

| File | Location | Purpose |
|------|----------|---------|
| `tab-burst.js` | `apps/beerbook/tab-burst.js` | Animation module |
| `tab-burst-admin.js` | `apps/beerbook/tab-burst-admin.js` | Admin settings panel |
| `can_tab.png` | `apps/beerbook/images/can_tab.png` | Pull-tab image (transparent PNG) |

## Files to Modify

### `apps/beerbook/index.html`

Add script tags **before** `</body>`, after `tabs.js` but before `admin.js`:

```html
<script src="tab-burst.js"></script>
<script src="tab-burst-admin.js"></script>
```

### `apps/beerbook/admin.js`

In the admin view rendering function, add a container for the tab burst settings panel.
Find where admin sub-sections are rendered and add:

```javascript
// Inside the admin view render function, after other admin sections:
const burstContainer = document.createElement('div');
burstContainer.id = 'admin-tab-burst';
adminViewElement.appendChild(burstContainer);

// Render the settings panel
if (window.TabBurstAdmin) {
  TabBurstAdmin.render(burstContainer);
}
```

### Rating Submission Handler

Wherever the rating submission completes and `tabsEarned` is returned from the API, fire the animation:

```javascript
// After successful rating submission:
const result = await submitRating(/* ... */);

if (result.tabsEarned && result.tabsEarned > 0) {
  // Fire animation from the submit button
  const submitBtn = document.querySelector('.rate-submit-btn'); // adjust selector
  if (submitBtn) {
    const rect = submitBtn.getBoundingClientRect();
    TabBurst.fire(result.tabsEarned, {
      x: rect.left + rect.width / 2,
      y: rect.top
    });
  } else {
    TabBurst.fire(result.tabsEarned); // fallback: center-bottom
  }
}
```

## How TabBurst Works

### Public API

```javascript
TabBurst.fire(earnedTabs)                     // burst from default position
TabBurst.fire(earnedTabs, { x: 200, y: 600 }) // burst from custom origin
TabBurst.updateSettings({ gravity: 0.2 })     // update any setting
TabBurst.getSettings()                         // get current settings object
TabBurst.resetSettings()                       // reset to defaults
TabBurst.DEFAULTS                              // read-only defaults
```

### Default Settings (pre-tuned)

```javascript
{
  style: 'shotgun',        // burst pattern
  tabSize: 50,             // px
  spin: 9,                 // rotation speed
  spread: 4,               // horizontal spread
  gravity: 0.15,           // downward pull
  launchPower: 4.5,        // upward velocity
  maxEarn: 50,             // max earnable tabs (scales the curve)
  minVisualTabs: 6,        // fewest tabs shown for +1 earning
  maxVisualTabs: 42,       // most tabs shown for max earning
  tabImagePath: '/images/can_tab.png',
  originSelector: null,    // CSS selector for burst origin, or null for center-bottom
  showBadge: true,         // "+X tabs" floating text
  showFlash: true,         // radial gold flash
  hapticFeedback: true,    // mobile vibration
  fadeSpeed: 0.025,        // tab fade-out rate
}
```

### Settings Persistence

Settings auto-save to `localStorage` under key `beerbook_tab_burst_settings`.
The admin panel reads/writes through `TabBurst.updateSettings()` and `TabBurst.getSettings()`.
`TabBurst.resetSettings()` restores defaults and clears saved overrides.

### Visual Scaling (earned → visual tabs)

Uses a logarithmic curve so small earnings still feel rewarding:
- +1 tab earned  → ~6 visual tabs
- +3 earned      → ~11 visual
- +8 earned      → ~18 visual
- +15 earned     → ~25 visual
- +30 earned     → ~33 visual
- +50 earned     → ~42 visual (max)

Intensity also scales: bigger earnings = faster launch, wider spread, more spin.

### Image Requirements

`can_tab.png` must be:
- Transparent background (no black)
- Roughly 80x100px is ideal for the sprite
- Larger is fine (it scales down) but wastes memory when spawning 40+ instances

## Admin Panel

The admin panel (`TabBurstAdmin`) renders a self-contained settings card with:
- Burst style selector (5 styles)
- Physics sliders (size, power, gravity, spread, spin, max tabs, fade)
- Toggle switches (badge, flash, haptic)
- Test buttons (+1 through +50) that fire live bursts
- Reset to defaults button
- Save button (auto-saves, but gives visual confirmation)

It expects to be rendered inside the admin view:
```javascript
TabBurstAdmin.render(document.getElementById('some-container'));
```

Call `TabBurstAdmin.destroy()` to clean up when navigating away from admin.

## Do NOT

- Do NOT modify `tab-burst.js` or `tab-burst-admin.js` unless fixing a bug
- Do NOT use npm or any bundler — these are vanilla JS IIFE modules
- Do NOT add CSS to `styles.css` for these — both files inject their own scoped CSS
- Do NOT call `TabBurst.fire()` if `tabsEarned` is 0 or undefined
