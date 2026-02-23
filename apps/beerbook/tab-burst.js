/**
 * tab-burst.js — BeerBook Tab Burst Animation Module
 * 
 * Explodes pull-tab images upward from a trigger point (submit button)
 * as a dopamine-hit reward animation when users earn tabs.
 * 
 * Usage:
 *   TabBurst.fire(earnedTabs)                    — burst from default origin (submit btn)
 *   TabBurst.fire(earnedTabs, { x: 200, y: 600 }) — burst from custom origin
 *   TabBurst.updateSettings({ gravity: 0.2 })    — live update settings
 *   TabBurst.getSettings()                        — get current settings
 *   TabBurst.resetSettings()                      — reset to defaults
 * 
 * Settings are persisted to localStorage under 'beerbook_tab_burst_settings'.
 * Admin panel can tweak all values live.
 */

const TabBurst = (() => {

  // ─── DEFAULT SETTINGS (your tuned values) ───
  const DEFAULTS = {
    style: 'shotgun',       // 'fountain' | 'firework' | 'shotgun' | 'popcorn' | 'geyser'
    tabSize: 50,            // base tab size in px
    spin: 9,                // max rotation speed
    spread: 4,              // horizontal spread multiplier
    gravity: 0.15,          // pull-down force
    launchPower: 4.5,       // upward launch velocity
    maxEarn: 50,            // maximum tabs earnable (scales the curve)
    minVisualTabs: 6,       // minimum visual tabs for any burst
    maxVisualTabs: 42,      // maximum visual tabs at max earning
    tabImagePath: '/images/can_tab.png',  // path to your tab PNG
    originSelector: null,   // CSS selector for burst origin element (null = center-bottom)
    showBadge: true,        // show the "+X tabs" floating text
    showFlash: true,        // show the radial flash behind burst
    hapticFeedback: true,   // vibrate on mobile if available
    fadeSpeed: 0.025,       // how fast tabs fade after peak
  };

  const STORAGE_KEY = 'beerbook_tab_burst_settings';

  let settings = { ...DEFAULTS };
  let container = null;
  let tabImagePreloaded = false;

  // ─── INIT ───
  function init() {
    loadSettings();
    ensureContainer();
    ensureCSS();
    preloadImage();
  }

  function ensureContainer() {
    if (document.getElementById('tab-burst-container')) {
      container = document.getElementById('tab-burst-container');
      return;
    }
    container = document.createElement('div');
    container.id = 'tab-burst-container';
    document.body.appendChild(container);
  }

  function ensureCSS() {
    if (document.getElementById('tab-burst-styles')) return;
    const style = document.createElement('style');
    style.id = 'tab-burst-styles';
    style.textContent = `
      #tab-burst-container {
        position: fixed;
        top: 0; left: 0;
        width: 100vw; height: 100vh;
        pointer-events: none;
        z-index: 10000;
        overflow: hidden;
      }

      .tab-burst-tab {
        position: absolute;
        pointer-events: none;
        will-change: transform, opacity;
      }

      .tab-burst-tab img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        filter: drop-shadow(0 2px 6px rgba(0,0,0,0.6));
      }

      .tab-burst-badge {
        position: fixed;
        pointer-events: none;
        z-index: 10001;
        font-family: 'Archivo Black', Arial Black, sans-serif;
        color: var(--gold-bright, #f0c85a);
        text-shadow: 0 0 20px rgba(212,168,67,0.7), 0 2px 6px rgba(0,0,0,0.9);
        white-space: nowrap;
        opacity: 0;
      }

      .tab-burst-badge.go {
        animation: tabBurstBadgePop 2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }

      @keyframes tabBurstBadgePop {
        0%   { opacity: 0; transform: translate(-50%, 0) scale(0.2); }
        12%  { opacity: 1; transform: translate(-50%, -30px) scale(1.4); }
        25%  { transform: translate(-50%, -50px) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -140px) scale(0.7); }
      }

      .tab-burst-flash {
        position: fixed;
        pointer-events: none;
        z-index: 9999;
        border-radius: 50%;
        width: 200px; height: 200px;
        background: radial-gradient(circle, rgba(212,168,67,0.5) 0%, rgba(240,200,90,0.2) 40%, transparent 70%);
        opacity: 0;
      }

      .tab-burst-flash.go {
        animation: tabBurstFlash 0.5s ease-out forwards;
      }

      @keyframes tabBurstFlash {
        0%   { opacity: 1; transform: translate(-50%, -50%) scale(0.1); }
        100% { opacity: 0; transform: translate(-50%, -50%) scale(4); }
      }
    `;
    document.head.appendChild(style);
  }

  function preloadImage() {
    const img = new Image();
    img.onload = () => { tabImagePreloaded = true; };
    img.src = settings.tabImagePath;
  }


  // ─── SETTINGS PERSISTENCE ───
  function loadSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        settings = { ...DEFAULTS, ...parsed };
      }
    } catch (e) {
      console.warn('TabBurst: Could not load saved settings, using defaults.');
      settings = { ...DEFAULTS };
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('TabBurst: Could not save settings.');
    }
  }

  function updateSettings(newSettings) {
    settings = { ...settings, ...newSettings };
    saveSettings();
  }

  function getSettings() {
    return { ...settings };
  }

  function resetSettings() {
    settings = { ...DEFAULTS };
    saveSettings();
    return { ...settings };
  }


  // ─── BURST ORIGIN ───
  function getOrigin(customOrigin) {
    if (customOrigin && customOrigin.x !== undefined) {
      return customOrigin;
    }

    if (settings.originSelector) {
      const el = document.querySelector(settings.originSelector);
      if (el) {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + 4 };
      }
    }

    // Default: center-bottom of viewport
    return {
      x: window.innerWidth / 2,
      y: window.innerHeight - 80
    };
  }


  // ─── LAUNCH VECTORS ───
  function getLaunchVector(intensity) {
    const power = settings.launchPower;
    const spread = settings.spread;
    let angle, speed;

    switch (settings.style) {
      case 'fountain':
        angle = -Math.PI / 2 + (Math.random() - 0.5) * (spread * 0.18);
        speed = power * (0.6 + Math.random() * 0.5) * intensity;
        return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };

      case 'firework':
        angle = -Math.PI * Math.random();
        speed = power * (0.5 + Math.random() * 0.6) * intensity;
        return { vx: Math.cos(angle) * speed * (spread / 4), vy: Math.sin(angle) * speed };

      case 'shotgun':
        angle = -Math.PI / 2 + (Math.random() - 0.5) * (spread * 0.08);
        speed = power * (0.8 + Math.random() * 0.4) * intensity * 1.3;
        return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };

      case 'popcorn':
        angle = -Math.PI / 2 + (Math.random() - 0.5) * (spread * 0.25);
        speed = power * (0.3 + Math.random() * 0.8) * intensity;
        return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };

      case 'geyser':
        angle = -Math.PI / 2 + (Math.random() - 0.5) * (spread * 0.05);
        speed = power * (0.7 + Math.random() * 0.5) * intensity * 1.2;
        return { vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 0.5, vy: Math.sin(angle) * speed };

      default:
        return { vx: 0, vy: -power };
    }
  }

  function getDelay(i, intensity) {
    switch (settings.style) {
      case 'fountain':  return i * (30 / intensity);
      case 'firework':  return Math.random() * 40;
      case 'shotgun':   return Math.random() * 20;
      case 'popcorn':   return i * (80 / intensity) + Math.random() * 120;
      case 'geyser':    return i * (25 / intensity);
      default:          return i * 30;
    }
  }


  // ─── VISUAL EFFECTS ───
  function spawnFlash(ox, oy) {
    if (!settings.showFlash) return;
    const f = document.createElement('div');
    f.className = 'tab-burst-flash';
    f.style.left = ox + 'px';
    f.style.top = oy + 'px';
    document.body.appendChild(f);
    requestAnimationFrame(() => f.classList.add('go'));
    setTimeout(() => f.remove(), 600);
  }

  function showBadge(amount, ox, oy) {
    if (!settings.showBadge) return;
    const b = document.createElement('div');
    b.className = 'tab-burst-badge';
    b.textContent = `+${amount} tab${amount !== 1 ? 's' : ''}`;
    b.style.fontSize = Math.min(28, 18 + amount * 0.2) + 'px';
    b.style.left = ox + 'px';
    b.style.top = (oy - 10) + 'px';
    document.body.appendChild(b);
    requestAnimationFrame(() => b.classList.add('go'));
    setTimeout(() => b.remove(), 2200);
  }


  // ─── PHYSICS ENGINE ───
  function dropTabs(count, intensity, ox, oy) {
    ensureContainer();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const baseSize = settings.tabSize;
    const gravity = settings.gravity;
    const spinMax = settings.spin;

    for (let i = 0; i < count; i++) {
      const tab = document.createElement('div');
      tab.className = 'tab-burst-tab';

      const sizeScale = 0.55 + Math.random() * (0.9 + 0.3 * intensity);
      const w = baseSize * sizeScale;
      const h = w * 1.35;
      tab.style.width = w + 'px';
      tab.style.height = h + 'px';

      const img = document.createElement('img');
      img.src = settings.tabImagePath;
      img.alt = '';
      tab.appendChild(img);

      const launch = getLaunchVector(intensity);
      let x = ox - w / 2;
      let y = oy - h / 2;
      let vx = launch.vx;
      let vy = launch.vy;
      let rotation = Math.random() * 360;
      let rotSpeed = (Math.random() - 0.5) * spinMax * intensity;
      let opacity = 1;
      let settled = false;
      let fadeTimer = 0;

      tab.style.opacity = '0';
      container.appendChild(tab);

      const delay = getDelay(i, intensity);
      const startTime = performance.now() + delay;
      let alive = true;
      let lastTime = null;
      const REF_FPS = 60;
      const MAX_DT = 0.05; // cap delta to avoid spikes when tab was in background

      function animate(now) {
        if (!alive) return;
        if (now < startTime) { requestAnimationFrame(animate); return; }

        let dt = 0;
        if (lastTime != null) {
          dt = (now - lastTime) / 1000; // seconds
          if (dt > MAX_DT) dt = MAX_DT;
        }
        lastTime = now;
        const scale = dt * REF_FPS; // 1.0 at 60fps, 0.5 at 30fps, etc.

        tab.style.opacity = String(opacity);

        // Gravity (time-scaled)
        vy += gravity * 0.35 * scale;

        // Air drag (exponential per reference frame, scaled by time)
        vy *= Math.pow(0.998, scale);
        vx *= Math.pow(0.996, scale);

        x += vx * scale;
        y += vy * scale;

        // 3D tumble (time-scaled)
        rotation += rotSpeed * scale;
        rotSpeed *= Math.pow(0.997, scale);
        const tumbleX = Math.sin(rotation * 0.02) * 25;
        const tumbleY = Math.cos(rotation * 0.03) * 15;

        tab.style.transform =
          `translate3d(${x}px,${y}px,0) rotateX(${tumbleX}deg) rotateY(${tumbleY}deg) rotateZ(${rotation}deg)`;

        // Fade when falling back past ~85% of viewport
        if (y > vh * 0.85 && vy > 0) settled = true;

        if (settled) {
          fadeTimer += scale;
          if (fadeTimer > 10) opacity -= settings.fadeSpeed * scale;
        }

        if (opacity <= 0 || y > vh + 40 || x < -80 || x > vw + 80) {
          tab.remove();
          alive = false;
          return;
        }

        requestAnimationFrame(animate);
      }

      requestAnimationFrame(animate);
    }
  }


  // ─── MAIN PUBLIC METHOD ───
  function fire(earnedTabs, customOrigin) {
    if (!earnedTabs || earnedTabs < 1) return;

    const origin = getOrigin(customOrigin);

    // Log curve scaled for 1–maxEarn → minVisualTabs to maxVisualTabs
    // Steeper curve to give more tabs at high earnings
    const logScale = Math.log10(1 + earnedTabs) / Math.log10(1 + settings.maxEarn);
    const visualCount = Math.round(
      settings.minVisualTabs + (settings.maxVisualTabs - settings.minVisualTabs) * logScale
    );
    const count = Math.max(settings.minVisualTabs, Math.min(visualCount, settings.maxVisualTabs));

    // Intensity 0.7 → 2.0
    const intensity = Math.max(0.7, Math.min(2.0,
      0.7 + Math.log10(1 + earnedTabs) * 0.75
    ));

    // Haptic
    if (settings.hapticFeedback && navigator.vibrate) {
      navigator.vibrate(40);
    }

    // Fire!
    spawnFlash(origin.x, origin.y);
    showBadge(earnedTabs, origin.x, origin.y);
    dropTabs(count, intensity, origin.x, origin.y);
  }


  // ─── AUTO-INIT ON LOAD ───
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }


  // ─── PUBLIC API ───
  return {
    fire,
    updateSettings,
    getSettings,
    resetSettings,
    DEFAULTS: { ...DEFAULTS },
  };

})();
