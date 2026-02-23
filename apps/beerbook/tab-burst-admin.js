/**
 * tab-burst-admin.js — Admin Panel for Tab Burst Animation Settings
 * 
 * Renders a settings panel inside the admin view.
 * Requires: tab-burst.js to be loaded first.
 * 
 * Usage:
 *   TabBurstAdmin.render(containerElement)  — render into a DOM element
 *   TabBurstAdmin.destroy()                 — remove from DOM
 */

const TabBurstAdmin = (() => {

  let panelEl = null;

  const STYLES = [
    { value: 'shotgun',  label: '🔫 Shotgun',  desc: 'Tight fast blast straight up' },
    { value: 'fountain', label: '🎆 Fountain',  desc: 'Classic upward cone arc' },
    { value: 'firework', label: '💥 Firework',  desc: 'Radial burst in all directions' },
    { value: 'popcorn',  label: '🍿 Popcorn',   desc: 'Staggered playful pops' },
    { value: 'geyser',   label: '🌋 Geyser',    desc: 'Tall narrow column' },
  ];

  const SLIDERS = [
    { key: 'tabSize',       label: 'Tab Size',      min: 15,   max: 70,  step: 1,    unit: 'px' },
    { key: 'launchPower',   label: 'Launch Power',   min: 2,    max: 25,  step: 0.5,  unit: '' },
    { key: 'gravity',       label: 'Gravity',         min: 0.05, max: 0.5, step: 0.01, unit: '' },
    { key: 'spread',        label: 'Spread',           min: 1,    max: 8,   step: 0.5,  unit: '' },
    { key: 'spin',          label: 'Spin',             min: 0,    max: 15,  step: 0.5,  unit: '' },
    { key: 'maxVisualTabs', label: 'Max Visual Tabs', min: 10,   max: 60,  step: 1,    unit: '' },
    { key: 'fadeSpeed',     label: 'Fade Speed',       min: 0.01, max: 0.08,step: 0.005,unit: '' },
  ];

  const TOGGLES = [
    { key: 'showBadge',       label: 'Show "+X tabs" badge' },
    { key: 'showFlash',       label: 'Show radial flash' },
    { key: 'hapticFeedback',  label: 'Haptic vibration (mobile)' },
  ];

  const PRESETS = [
    { earned: 1,  label: '+1' },
    { earned: 3,  label: '+3' },
    { earned: 8,  label: '+8' },
    { earned: 15, label: '+15' },
    { earned: 30, label: '+30' },
    { earned: 50, label: '+50' },
  ];


  function render(containerEl) {
    if (!containerEl) return;
    if (!window.TabBurst) {
      console.error('TabBurstAdmin: TabBurst module not loaded.');
      return;
    }

    const s = TabBurst.getSettings();

    panelEl = document.createElement('div');
    panelEl.className = 'tb-admin';
    panelEl.innerHTML = buildHTML(s);
    containerEl.appendChild(panelEl);

    bindEvents();
  }


  function buildHTML(s) {
    // Style chips
    const styleChips = STYLES.map(st =>
      `<button class="tb-admin-chip ${s.style === st.value ? 'active' : ''}" 
              data-style="${st.value}" title="${st.desc}">
        ${st.label}
      </button>`
    ).join('');

    // Sliders
    const sliderRows = SLIDERS.map(sl =>
      `<div class="tb-admin-slider-row">
        <label>${sl.label}</label>
        <input type="range" data-key="${sl.key}" 
               min="${sl.min}" max="${sl.max}" step="${sl.step}" 
               value="${s[sl.key]}">
        <span class="tb-admin-val" data-valfor="${sl.key}">${s[sl.key]}${sl.unit}</span>
      </div>`
    ).join('');

    // Toggles
    const toggleRows = TOGGLES.map(tg =>
      `<div class="tb-admin-toggle-row">
        <label>
          <input type="checkbox" data-key="${tg.key}" ${s[tg.key] ? 'checked' : ''}>
          ${tg.label}
        </label>
      </div>`
    ).join('');

    // Test buttons
    const testBtns = PRESETS.map(p =>
      `<button class="tb-admin-test-btn" data-earn="${p.earned}">${p.label}</button>`
    ).join('');

    return `
      <div class="tb-admin-header">
        <h3>🍺 Tab Burst Animation</h3>
        <p>Configure the reward animation shown when users earn tabs.</p>
      </div>

      <div class="tb-admin-section">
        <div class="tb-admin-section-label">Burst Style</div>
        <div class="tb-admin-chips">${styleChips}</div>
      </div>

      <div class="tb-admin-section">
        <div class="tb-admin-section-label">Physics</div>
        ${sliderRows}
      </div>

      <div class="tb-admin-section">
        <div class="tb-admin-section-label">Options</div>
        ${toggleRows}
      </div>

      <div class="tb-admin-section">
        <div class="tb-admin-section-label">Test It</div>
        <div class="tb-admin-test-row">${testBtns}</div>
      </div>

      <div class="tb-admin-actions">
        <button class="tb-admin-btn tb-admin-btn-reset" id="tbResetBtn">Reset to Defaults</button>
        <button class="tb-admin-btn tb-admin-btn-save" id="tbSaveBtn">Save Settings</button>
      </div>
    `;
  }


  function bindEvents() {
    if (!panelEl) return;

    // Style chips
    panelEl.querySelectorAll('.tb-admin-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        panelEl.querySelectorAll('.tb-admin-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        TabBurst.updateSettings({ style: chip.dataset.style });
      });
    });

    // Sliders
    panelEl.querySelectorAll('input[type="range"]').forEach(input => {
      input.addEventListener('input', () => {
        const key = input.dataset.key;
        const val = parseFloat(input.value);
        panelEl.querySelector(`[data-valfor="${key}"]`).textContent = val;
        TabBurst.updateSettings({ [key]: val });
      });
    });

    // Toggles
    panelEl.querySelectorAll('input[type="checkbox"]').forEach(input => {
      input.addEventListener('change', () => {
        TabBurst.updateSettings({ [input.dataset.key]: input.checked });
      });
    });

    // Test buttons
    panelEl.querySelectorAll('.tb-admin-test-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        TabBurst.fire(parseInt(btn.dataset.earn));
      });
    });

    // Reset
    panelEl.querySelector('#tbResetBtn').addEventListener('click', () => {
      const defaults = TabBurst.resetSettings();
      // Re-render to update all inputs
      const parent = panelEl.parentElement;
      destroy();
      render(parent);
    });

    // Save (already auto-saves, but gives feedback)
    panelEl.querySelector('#tbSaveBtn').addEventListener('click', () => {
      const btn = panelEl.querySelector('#tbSaveBtn');
      btn.textContent = '✓ Saved!';
      btn.style.background = '#4ecb71';
      setTimeout(() => {
        btn.textContent = 'Save Settings';
        btn.style.background = '';
      }, 1500);
    });
  }


  function destroy() {
    if (panelEl && panelEl.parentElement) {
      panelEl.parentElement.removeChild(panelEl);
    }
    panelEl = null;
  }


  // ─── INJECT CSS ───
  function injectCSS() {
    if (document.getElementById('tb-admin-styles')) return;
    const style = document.createElement('style');
    style.id = 'tb-admin-styles';
    style.textContent = `
      .tb-admin {
        background: var(--navy-mid, #12233d);
        border: 1px solid rgba(212,168,67,0.15);
        border-radius: 16px;
        padding: 24px;
        margin-bottom: 24px;
      }

      .tb-admin-header h3 {
        font-family: 'Archivo Black', Arial Black, sans-serif;
        font-size: 18px;
        color: var(--gold, #d4a843);
        margin-bottom: 4px;
      }

      .tb-admin-header p {
        font-size: 13px;
        color: #6a7e92;
        margin-bottom: 20px;
      }

      .tb-admin-section {
        margin-bottom: 20px;
      }

      .tb-admin-section-label {
        font-family: 'Archivo Black', Arial Black, sans-serif;
        font-size: 11px;
        color: var(--gold-dim, #a07e2e);
        text-transform: uppercase;
        letter-spacing: 2px;
        margin-bottom: 10px;
      }

      .tb-admin-chips {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }

      .tb-admin-chip {
        background: var(--navy-light, #1a3355);
        border: 1px solid rgba(212,168,67,0.2);
        border-radius: 20px;
        padding: 7px 14px;
        font-size: 12px;
        font-weight: 600;
        color: #7a8ea0;
        cursor: pointer;
        transition: all 0.15s;
      }

      .tb-admin-chip:hover {
        border-color: var(--gold, #d4a843);
        color: #bbb;
      }

      .tb-admin-chip.active {
        background: var(--gold, #d4a843);
        color: var(--navy, #0a1628);
        border-color: var(--gold, #d4a843);
      }

      .tb-admin-slider-row {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
      }

      .tb-admin-slider-row label {
        width: 110px;
        font-size: 12px;
        color: #7a8ea0;
        flex-shrink: 0;
      }

      .tb-admin-slider-row input[type="range"] {
        flex: 1;
        accent-color: var(--gold, #d4a843);
      }

      .tb-admin-val {
        width: 44px;
        text-align: right;
        font-family: 'Archivo Black', Arial Black, sans-serif;
        font-size: 13px;
        color: var(--gold-bright, #f0c85a);
      }

      .tb-admin-toggle-row {
        margin-bottom: 8px;
      }

      .tb-admin-toggle-row label {
        font-size: 13px;
        color: #8899aa;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .tb-admin-toggle-row input[type="checkbox"] {
        accent-color: var(--gold, #d4a843);
        width: 16px;
        height: 16px;
      }

      .tb-admin-test-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .tb-admin-test-btn {
        background: var(--navy-light, #1a3355);
        border: 1px solid rgba(212,168,67,0.15);
        border-radius: 10px;
        padding: 10px 18px;
        font-family: 'Archivo Black', Arial Black, sans-serif;
        font-size: 14px;
        color: var(--gold-bright, #f0c85a);
        cursor: pointer;
        transition: all 0.15s;
      }

      .tb-admin-test-btn:hover {
        border-color: var(--gold, #d4a843);
        transform: translateY(-1px);
      }

      .tb-admin-actions {
        display: flex;
        gap: 12px;
        margin-top: 20px;
        padding-top: 20px;
        border-top: 1px solid rgba(212,168,67,0.1);
      }

      .tb-admin-btn {
        flex: 1;
        padding: 12px;
        border: none;
        border-radius: 10px;
        font-family: 'Archivo Black', Arial Black, sans-serif;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.15s;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .tb-admin-btn-reset {
        background: rgba(255,255,255,0.06);
        color: #7a8ea0;
      }

      .tb-admin-btn-reset:hover {
        background: rgba(255,255,255,0.1);
        color: #aaa;
      }

      .tb-admin-btn-save {
        background: var(--gold, #d4a843);
        color: var(--navy, #0a1628);
      }

      .tb-admin-btn-save:hover {
        box-shadow: 0 4px 16px rgba(212,168,67,0.3);
      }
    `;
    document.head.appendChild(style);
  }

  // Auto-inject CSS
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectCSS);
  } else {
    injectCSS();
  }


  return { render, destroy };

})();
