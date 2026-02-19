# BeerBook — Fix Greeting Language Label + Redesign Hamburger Menu

## Context Files (read ALL before writing code)
- `apps/beerbook/app.js` — greeting logic in `enterApp()`
- `apps/beerbook/index.html` — hamburger menu HTML, topbar structure
- `apps/beerbook/styles.css` — menu and topbar styles

---

## Issue 1: Greeting Must Always Show the Language Name

### Problem
The cheers greeting now randomizes (good!) but no longer shows which language it is. Previously it showed something like "Caipi, rambo!" with "Guaraní" underneath. Now it just shows the cheers phrase with no language label.

### Fix
The greetings array needs to store BOTH the phrase and the language name as structured data. Then render two lines:

**In `app.js`, update the greeting logic in `enterApp()`:**

Replace whatever the current greetings logic is with this pattern:

```javascript
const greeting = document.getElementById('user-greeting');
if (greeting && DB.currentUser) {
    const name = DB.currentUser.display_name || 'Beer Lover';
    const greetings = [
        { phrase: `Cheers, ${name}!`, lang: 'English', emoji: '🍻' },
        { phrase: `Prost, ${name}!`, lang: 'German', emoji: '🍺' },
        { phrase: `Salud, ${name}!`, lang: 'Spanish', emoji: '🥂' },
        { phrase: `Sláinte, ${name}!`, lang: 'Irish', emoji: '🍻' },
        { phrase: `Cin cin, ${name}!`, lang: 'Italian', emoji: '🍺' },
        { phrase: `Skål, ${name}!`, lang: 'Swedish', emoji: '🍻' },
        { phrase: `干杯, ${name}!`, lang: 'Mandarin', emoji: '🥂' },
        { phrase: `건배, ${name}!`, lang: 'Korean', emoji: '🍺' },
        { phrase: `Na zdraví, ${name}!`, lang: 'Czech', emoji: '🍻' },
        { phrase: `乾杯, ${name}!`, lang: 'Japanese', emoji: '🍺' },
        { phrase: `Santé, ${name}!`, lang: 'French', emoji: '🥂' },
        { phrase: `Proost, ${name}!`, lang: 'Dutch', emoji: '🍻' },
        { phrase: `Saúde, ${name}!`, lang: 'Portuguese', emoji: '🥂' },
        { phrase: `Şerefe, ${name}!`, lang: 'Turkish', emoji: '🍻' },
        { phrase: `L'chaim, ${name}!`, lang: 'Hebrew', emoji: '🍺' },
        { phrase: `Yamas, ${name}!`, lang: 'Greek', emoji: '🥂' },
        { phrase: `Na zdrowie, ${name}!`, lang: 'Polish', emoji: '🍻' },
        { phrase: `Noroc, ${name}!`, lang: 'Romanian', emoji: '🥂' },
        { phrase: `Chok dee, ${name}!`, lang: 'Thai', emoji: '🍺' },
        { phrase: `Mabuhay, ${name}!`, lang: 'Filipino', emoji: '🍻' },
    ];
    const g = greetings[Math.floor(Math.random() * greetings.length)];
    greeting.innerHTML = `
        <span class="greeting-phrase">${g.emoji} ${g.phrase}</span>
        <span class="greeting-lang">${g.lang}</span>
    `;
}
```

**In `styles.css`, add:**

```css
#user-greeting {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.2;
}

.greeting-phrase {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--amber-300);
}

.greeting-lang {
    font-size: 0.6rem;
    font-style: italic;
    color: var(--amber-500);
    opacity: 0.7;
    letter-spacing: 0.05em;
}
```

Make sure the greeting fits in the topbar — it should be compact (two tight lines), centered between the logo on the left and the hamburger on the right.

---

## Issue 2: Redesign Hamburger Dropdown Menu

### Problem
The current dropdown menu is way too heavy:
- The ✕ close button wastes a whole row at the top, pushing menu items down
- The menu items are spaced too far apart, taking up half the screen
- It duplicates the bottom navbar but in an oversized overlay format

### Design Requirements

1. **The ✕ close button should replace the ☰ hamburger icon in-place.** When the menu opens, the ☰ icon in the topbar transforms into ✕ at the exact same position. The menu content starts immediately below the topbar — no wasted space for a separate close button row.

2. **Compact menu items.** The dropdown should be a tight, narrow panel (right-aligned, not full-width) with smaller text and tighter spacing. Think of it as a quick-access list, not a full-screen takeover.

3. **Add items that the bottom nav DOESN'T have:** The hamburger menu should provide value by including items NOT in the bottom nav: Activity Feed, Leaderboard, YG Exchange, Settings/Logout. The bottom nav already covers Home, Browse, Rate, Map, Profile — the hamburger shouldn't just duplicate those.

### Implementation

**HTML structure** — the menu should be a dropdown panel anchored to the topbar, not a full overlay:

```html
<!-- In the topbar area -->
<button class="hamburger-btn" id="menu-toggle" aria-label="Menu">
    <span class="hamburger-icon">☰</span>
    <span class="close-icon" style="display:none;">✕</span>
</button>

<!-- Dropdown panel (not full overlay) -->
<div id="hamburger-menu" class="hamburger-dropdown" style="display:none;">
    <nav class="hamburger-nav">
        <a class="ham-link" data-view="activity">📰 Activity Feed</a>
        <a class="ham-link" data-view="leaderboard">🏆 Leaderboard</a>
        <a class="ham-link" data-view="yg-exchange">💱 YG Exchange</a>
        <hr class="ham-divider">
        <a class="ham-link" data-view="profile">👤 Profile & Stats</a>
        <a class="ham-link" id="ham-logout">🚪 Sign Out</a>
    </nav>
</div>
```

**CSS for the compact dropdown:**

```css
.hamburger-dropdown {
    position: absolute;
    top: 100%; /* Anchored right below the topbar */
    right: 0;
    width: 220px; /* Narrow, not full-width */
    background: var(--dark-800);
    border: 1px solid var(--dark-600);
    border-radius: 0 0 var(--radius-md) var(--radius-md);
    box-shadow: var(--shadow-lg);
    z-index: 1000;
    padding: 0.5rem 0;
}

.hamburger-nav {
    display: flex;
    flex-direction: column;
}

.ham-link {
    padding: 0.6rem 1rem;
    font-size: 0.9rem;
    color: var(--amber-200);
    text-decoration: none;
    cursor: pointer;
    transition: background 0.15s;
}

.ham-link:hover, .ham-link:active {
    background: rgba(230, 168, 23, 0.1);
}

.ham-divider {
    border: none;
    border-top: 1px solid var(--dark-600);
    margin: 0.25rem 0;
}

/* Toggle icon swap */
.hamburger-btn {
    background: none;
    border: 1px solid var(--dark-600);
    border-radius: var(--radius-sm);
    color: var(--amber-300);
    font-size: 1.4rem;
    padding: 0.3rem 0.6rem;
    cursor: pointer;
    position: relative;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
}
```

**JS toggle logic:**

```javascript
const menuToggle = document.getElementById('menu-toggle');
const menuDropdown = document.getElementById('hamburger-menu');
const hamIcon = menuToggle.querySelector('.hamburger-icon');
const closeIcon = menuToggle.querySelector('.close-icon');

menuToggle.addEventListener('click', () => {
    const isOpen = menuDropdown.style.display !== 'none';
    menuDropdown.style.display = isOpen ? 'none' : 'block';
    hamIcon.style.display = isOpen ? '' : 'none';
    closeIcon.style.display = isOpen ? 'none' : '';
});

// Close on outside click
document.addEventListener('click', (e) => {
    if (!menuToggle.contains(e.target) && !menuDropdown.contains(e.target)) {
        menuDropdown.style.display = 'none';
        hamIcon.style.display = '';
        closeIcon.style.display = 'none';
    }
});

// Close on menu item click + navigate
document.querySelectorAll('.ham-link[data-view]').forEach(link => {
    link.addEventListener('click', () => {
        menuDropdown.style.display = 'none';
        hamIcon.style.display = '';
        closeIcon.style.display = 'none';
        App.navigate(link.dataset.view);
    });
});

document.getElementById('ham-logout')?.addEventListener('click', () => {
    menuDropdown.style.display = 'none';
    document.getElementById('logout-btn')?.click(); // Trigger existing logout
});
```

**Key requirements:**
- The topbar must have `position: relative` so the dropdown anchors to it correctly
- The ☰ and ✕ swap in the SAME button, same position — no layout shift
- Menu items that navigate to views already handled by the bottom nav (Home, Browse, Rate, Map) should NOT be in the hamburger — keep it for supplementary items only
- Close the menu when clicking outside of it
- Close the menu when clicking a menu item

---

## Testing Checklist

### Greeting
- [ ] Every refresh shows a random cheers greeting
- [ ] Every greeting shows the language name below it in small italic text
- [ ] Greeting fits neatly in the topbar between logo and hamburger
- [ ] Works on mobile (375px width) without overflow

### Hamburger Menu
- [ ] ☰ click opens a compact dropdown (not full-screen overlay)
- [ ] ☰ transforms to ✕ in the same position
- [ ] Menu items start immediately at the top of the dropdown (no wasted space)
- [ ] Clicking outside closes the menu
- [ ] Clicking a menu item navigates and closes the menu
- [ ] Menu is narrow (right-aligned, ~220px) not full-width
- [ ] Menu does NOT duplicate bottom nav items (Home, Browse, Rate, Map already in bottom nav)

## Constraints
- Vanilla JS only
- Do NOT modify `server.js` or the database schema
- Do NOT break bottom navbar functionality
- Keep existing logout flow intact
