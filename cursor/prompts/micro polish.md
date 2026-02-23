# Micro-Polish — Scroll Gradient, Parallax & Haptic Feedback

Apply `cursor/prompts/00_system.md` rules.

**Prerequisite:** All existing functionality working. This is a purely additive polish pass — no existing behavior should change.

## Context Files (read before writing code)
- `DECISIONS.md`
- `apps/beerbook/index.html`
- `apps/beerbook/app.js`
- `apps/beerbook/styles.css`
- `apps/beerbook/beerbook-design-tokens.css`

## Goal

Add three micro-interaction layers that make the app feel more alive and tactile on mobile. None of these affect data flow, API calls, or existing functionality. All three degrade gracefully — if a browser doesn't support something, the app works exactly as before.

**Do NOT modify `server.js` or the database schema.**

---

## Task 1: Subtle Background Gradient Shift on Scroll

The body currently has a static gradient:
```css
background: linear-gradient(180deg, #0B1320 0%, #0E1829 100%);
```

As the user scrolls deeper into any view, the gradient should subtly warm — shifting from the cool blue-black toward a faint amber-dark tone at the bottom. This should feel like the room getting warmer as you go deeper into your beer list.

### Implementation

**CSS (`styles.css`):**

- Keep the existing `body` background as-is (it remains the base layer).
- Add a `body::after` pseudo-element:
  - `position: fixed; inset: 0; z-index: -1;`
  - `pointer-events: none;`
  - Background: a warmer gradient — something like `linear-gradient(180deg, #0B1320 0%, #1a1228 40%, #1e1005 100%)` (deep blue → subtle purple-brown → warm amber-black). Tune to taste, but keep it dark and subtle.
  - `opacity: var(--scroll-grad, 0);`
  - `transition: opacity 0.6s ease-out;`

**JS (`app.js`):**

- Add a single unified scroll handler (used by Tasks 1 and 2 together — see Task 2).
- On scroll, calculate `scrollPct` = `window.scrollY / (document.body.scrollHeight - window.innerHeight)`, clamped to 0–1.
- Set `document.body.style.setProperty('--scroll-grad', scrollPct.toFixed(3))`.
- Use `requestAnimationFrame` with a `ticking` guard so it only runs once per frame.
- Attach with `{ passive: true }` for scroll performance.
- Reset `--scroll-grad` to `0` when switching views (inside whatever function handles view transitions — look for `.view.active` class toggling).

### Acceptance Criteria
- [ ] At scroll position 0, background looks identical to current (no visible change)
- [ ] At maximum scroll, a subtle warmth is visible — not dramatic, just perceptible
- [ ] Transition is smooth, no flicker or jank
- [ ] Switching views resets the gradient
- [ ] No visible change on short views that don't scroll
- [ ] No impact on scroll performance (passive listener, rAF-gated)

---

## Task 2: Slight Parallax on View Headers

The `.view-header` elements (containing the page title like "Dashboard", "Rate a Beer", etc.) should drift slightly as the user scrolls, creating a subtle parallax depth effect.

### Implementation

**CSS (`styles.css`):**

- Add `will-change: transform;` to `.view-header`.
- That's it for CSS — the transform is applied via JS.

**JS (`app.js`):**

- Inside the **same** scroll handler from Task 1 (do not create a second scroll listener):
  - Query `.view.active .view-header` (only the currently visible view's header).
  - Apply `transform: translateY(${scrollY * 0.12}px)` where `scrollY` is `window.scrollY`.
  - The `0.12` multiplier means the header moves at 12% of scroll speed — very subtle.
- When the user switches views, reset any lingering transform on all `.view-header` elements to `transform: none`.

### Constraints
- The `.topbar` is `position: sticky` — do NOT apply parallax to it.
- Only apply to `.view-header`, not `.view` itself (that would shift the whole page).
- If `scrollY` exceeds 600px, cap the parallax offset at `600 * 0.12 = 72px` so headers don't drift too far on very long pages.

### Acceptance Criteria
- [ ] Header text drifts slightly upward relative to content as user scrolls down
- [ ] Effect is subtle — barely noticeable unless you look for it
- [ ] No jitter or frame drops on mobile
- [ ] Parallax resets cleanly when switching views
- [ ] `.topbar` is completely unaffected
- [ ] Combined scroll handler (gradient + parallax) uses a single `requestAnimationFrame` call

---

## Task 3: Haptic Feedback on Key Interactions

Add tactile vibration feedback on three specific interactions using the Vibration API (`navigator.vibrate()`). This API is supported on Android Chrome and some other mobile browsers. iOS Safari does NOT support it — the implementation must degrade silently (no errors, no fallback UI).

### Implementation

**JS (`app.js`):**

**Step 1: Add a haptic utility function** (near the top of the file, or in your `Utils` object if you have one):

```js
function haptic(pattern) {
    if (!navigator.vibrate) return;
    var patterns = {
        tap:    [10],        // quick light tap
        medium: [18],        // slightly heavier
        detent: [8, 40, 8]   // double-pulse "click-stop" feel
    };
    navigator.vibrate(patterns[pattern] || patterns.tap);
}
```

**Step 2: Wire haptic to star rating taps**

- Find the existing star rating click handler (look for the `setStarValue` function or the click listener on `#star-rating .star` buttons).
- After the star value is set and the visual update happens, call `haptic('tap')`.
- This should fire on every star tap, even if tapping the same star again.

**Step 3: Wire haptic to YG glass increment**

- Find the existing YG slider `setValue` function inside `bindYgSlider()`.
- At the top of `setValue`, capture the previous value: `var prev = parseInt(ygValueInput.value) || 0;`
- After computing the new value `v`, if `v !== prev`, call `haptic('tap')`.
- This fires only when the value actually changes, not on redundant taps.

**Step 4: Wire haptic to flavor slider stops**

- Find the existing flavor slider binding (the `['hoppy', 'malty', 'bitter', 'sweet', 'fruity'].forEach(...)` block).
- For each slider, add a `change` event listener (NOT `input` — `change` fires when the user releases the thumb):
  ```js
  slider.addEventListener('change', function() { haptic('detent'); });
  ```
- The `'detent'` pattern gives a double-pulse feel that signals "value locked in" — distinct from the single tap on stars/YG.

### Constraints
- **No feature detection UI** — don't show "haptics not supported" messages. Just silently skip.
- **No iOS workarounds** — don't try AudioContext or other hacks. If `navigator.vibrate` doesn't exist, do nothing.
- **Don't haptic on `input` events** — only on discrete actions (tap, change). Continuous vibration during slider drag would be awful.

### Acceptance Criteria
- [ ] On Android Chrome: tapping a star gives a quick vibration
- [ ] On Android Chrome: tapping a YG glass gives a quick vibration (only when value changes)
- [ ] On Android Chrome: releasing a flavor slider gives a distinct double-pulse vibration
- [ ] On iOS Safari: no errors in console, no behavioral difference, haptic calls silently no-op
- [ ] On desktop: no errors in console, no behavioral difference
- [ ] Haptic does not fire during slider drag, only on release
- [ ] No new UI elements, no new dependencies, no new API calls

---

## Combined Scroll Handler Reference

For clarity, Tasks 1 and 2 should share a single scroll listener. The final structure should look like this (adapt to your existing code patterns):

```js
(function initScrollEffects() {
    var ticking = false;
    window.addEventListener('scroll', function() {
        if (!ticking) {
            requestAnimationFrame(function() {
                var scrollY = window.scrollY;
                var docHeight = document.body.scrollHeight - window.innerHeight;
                var scrollPct = docHeight > 0 ? Math.min(scrollY / docHeight, 1) : 0;

                // Task 1: Gradient shift
                document.body.style.setProperty('--scroll-grad', scrollPct.toFixed(3));

                // Task 2: Parallax (capped at 600px scroll)
                var parallax = Math.min(scrollY, 600) * 0.12;
                var header = document.querySelector('.view.active .view-header');
                if (header) header.style.transform = 'translateY(' + parallax + 'px)';

                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });
})();
```

This is a reference — adapt variable names, style, and placement to match the existing codebase conventions.

---

## Files Modified

| File | Changes |
|------|---------|
| `apps/beerbook/styles.css` | Add `body::after` gradient overlay, add `will-change: transform` to `.view-header` |
| `apps/beerbook/app.js` | Add `haptic()` utility, add scroll handler for gradient + parallax, wire haptic to star/YG/slider events, reset scroll effects on view switch |

**No new files. No new dependencies. No HTML changes. No API changes.**

---

## Agent Assumption Log

| # | Assumption | Risk |
|---|-----------|------|
| 1 | `body::after` with `z-index: -1` won't interfere with existing stacking contexts | Low — body pseudo-elements sit behind all content |
| 2 | View switching function is identifiable by `.view.active` class toggling | Low — standard pattern in codebase |
| 3 | Vibration API patterns of 8–18ms are perceptible on Android devices | Low — tested pattern, common in PWAs |
| 4 | Flavor slider `change` event fires on touch release on mobile browsers | Low — standard behavior per spec |
