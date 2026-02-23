/* ============================================
   BeerBook Tabs UI (user-facing)
   ============================================ */

const Tabs = {
    _initialized: false,
    _notificationPollTimer: null,
    _notificationOpen: false,
    _notifications: [],
    _tabProfile: null,
    _tabsLeaderboard: [],
    _mySubmissions: [],
    _tiers: [
        { key: 'taster', label: 'Taster', requiredWeeks: 0 },
        { key: 'regular', label: 'Regular', requiredWeeks: 2 },
        { key: 'local', label: 'Local', requiredWeeks: 4 },
        { key: 'patron', label: 'Patron', requiredWeeks: 8 },
        { key: 'house_account', label: 'House Account', requiredWeeks: 12 },
        { key: 'cellar_reserve', label: 'Cellar Reserve', requiredWeeks: 16 },
    ],

    init() {
        if (this._initialized) {
            this.startNotificationPolling();
            return;
        }
        this._initialized = true;
        this.bindNotifications();
        this.bindSubmissionModal();
        this.startNotificationPolling();
    },

    destroy() {
        if (this._notificationPollTimer) {
            clearInterval(this._notificationPollTimer);
            this._notificationPollTimer = null;
        }
    },

    toast(message, type = 'info') {
        if (typeof App !== 'undefined' && App && typeof App.toast === 'function') {
            App.toast(message, type);
            return;
        }
        Utils.toast(message, type, 3000);
    },

    startNotificationPolling() {
        if (this._notificationPollTimer) clearInterval(this._notificationPollTimer);
        this._notificationPollTimer = setInterval(() => {
            this.refreshNotifications();
        }, 60000);
    },

    tierLabel(tierKey) {
        const found = this._tiers.find((t) => t.key === tierKey);
        return found ? found.label : 'Taster';
    },

    tierClass(tierKey) {
        return `tier-badge tier-${String(tierKey || 'taster').replace(/_/g, '-')}`;
    },

    notificationIcon(type) {
        const map = {
            tier_promotion: '🎉',
            tier_demotion: '📉',
            streak_at_risk: '⚠️',
            approaching_demotion: '⏳',
            tabs_earned: '🪙',
            beer_approved: '✅',
            beer_rejected: '❌',
            seeder_granted: '⭐',
            reward_eligible: '🎁',
            weekly_summary: '📊',
        };
        return map[type] || '🔔';
    },

    formatTabsNumber(value) {
        return Number(value || 0).toLocaleString();
    },

    async renderDashboardWidget() {
        const widget = document.getElementById('tabs-widget');
        if (!widget || DB.isDemo || !DB.currentUser) return;
        try {
            const out = await DB.getTabsProfile();
            const profile = out && out.data ? out.data : null;
            if (!profile) return;
            this._tabProfile = profile;
            widget.style.display = '';

            const tierBadge = document.getElementById('tabs-tier-badge');
            const balanceEl = document.getElementById('tabs-balance');
            const progressEl = document.getElementById('tabs-weekly-progress');
            const streakEl = document.getElementById('tabs-streak');
            const nextTierEl = document.getElementById('tabs-next-tier');

            const tierName = profile.tier_display_name || this.tierLabel(profile.current_tier);
            const combined = Number(profile.combined_multiplier || 1).toFixed(2).replace(/\.00$/, '');
            const seederStar = profile.is_seeder ? ' ⭐' : '';
            if (tierBadge) {
                tierBadge.className = `${this.tierClass(profile.current_tier)} tabs-tier-badge`;
                tierBadge.textContent = `${tierName} • ${combined}x${seederStar}`;
            }
            if (balanceEl) {
                balanceEl.innerHTML = `<div class="tabs-balance-label">Tab Balance</div><div class="tabs-balance-value">${this.formatTabsNumber(profile.tab_balance)}</div>`;
            }

            const weekly = Number(profile.ratings_this_week || 0);
            const pct = Math.min(100, Math.round((weekly / 10) * 100));
            if (progressEl) {
                progressEl.innerHTML = `
                    <div class="tabs-progress-label">${weekly >= 10 ? 'Weekly cap reached ✓' : `${weekly}/10 ratings this week`}</div>
                    <div class="tabs-progress-bar"><div class="tabs-progress-fill" style="width:${pct}%;"></div></div>
                `;
            }

            const streak = Number(profile.current_streak_weeks || 0);
            if (streakEl) {
                streakEl.textContent = streak > 0 ? `🔥 ${streak} week streak` : 'No active streak';
            }

            if (nextTierEl) {
                const currentIdx = this._tiers.findIndex((t) => t.key === profile.current_tier);
                if (currentIdx < 0 || currentIdx === this._tiers.length - 1) {
                    nextTierEl.textContent = '🏆 Max tier reached';
                } else {
                    const next = this._tiers[currentIdx + 1];
                    const needed = Math.max(0, Number(next.requiredWeeks || 0) - streak);
                    nextTierEl.textContent = needed > 0
                        ? `${needed} more weeks to reach ${next.label}`
                        : `${next.label} criteria met — keep rating to promote`;
                }
            }
        } catch (err) {
            console.warn('Tabs widget render failed:', err?.message || err);
        }
    },

    bindNotifications() {
        const bellWrap = document.getElementById('notification-bell');
        const btn = document.getElementById('notification-btn');
        const dropdown = document.getElementById('notification-dropdown');
        const markAllBtn = document.getElementById('mark-all-read');
        if (!bellWrap || !btn || !dropdown || !markAllBtn) return;

        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            this._notificationOpen = !this._notificationOpen;
            dropdown.style.display = this._notificationOpen ? '' : 'none';
            if (this._notificationOpen) await this.refreshNotifications();
        });

        markAllBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await DB.markAllTabsNotificationsRead();
            await this.refreshNotifications();
        });

        document.addEventListener('click', (e) => {
            if (!bellWrap.contains(e.target)) {
                this._notificationOpen = false;
                dropdown.style.display = 'none';
            }
        });
    },

    async refreshNotifications() {
        const bellWrap = document.getElementById('notification-bell');
        const badge = document.getElementById('notification-badge');
        const list = document.getElementById('notification-list');
        if (!bellWrap || !badge || !list || DB.isDemo || !DB.currentUser) return;
        try {
            const out = await DB.getTabsNotifications(30, 0);
            this._notifications = Array.isArray(out?.data) ? out.data : [];
            const unread = Number(out?.metadata?.unread_count || 0);
            bellWrap.style.display = '';
            badge.style.display = unread > 0 ? '' : 'none';
            badge.textContent = unread > 99 ? '99+' : String(unread);

            list.innerHTML = this._notifications.length
                ? this._notifications.map((n) => `
                    <button type="button" class="notification-item ${n.is_read ? '' : 'unread'}" data-notification-id="${Utils.escapeHtml(String(n.id || ''))}">
                        <span class="notification-item-icon">${this.notificationIcon(n.notification_type)}</span>
                        <span class="notification-item-body">
                            <span class="notification-item-title">${Utils.escapeHtml(n.title || 'Notification')}</span>
                            <span class="notification-item-message">${Utils.escapeHtml(n.message || '')}</span>
                            <span class="notification-item-time">${Utils.timeAgo(n.created_at)}</span>
                        </span>
                    </button>
                `).join('')
                : '<p class="empty-state">No notifications yet.</p>';

            list.querySelectorAll('.notification-item').forEach((item) => {
                item.addEventListener('click', async () => {
                    const id = item.getAttribute('data-notification-id');
                    if (!id) return;
                    await DB.markTabsNotificationRead(id);
                    await this.refreshNotifications();
                });
            });
        } catch (err) {
            console.warn('Notifications refresh failed:', err?.message || err);
        }
    },

    formatTabsBreakdownLineItems(breakdown = {}) {
        const entries = [
            ['rating_base', '⭐ Rating'],
            ['rating_photo', '📸 Photo'],
            ['rating_location', '📍 Location'],
            ['rating_price', '💰 Price'],
            ['rating_review', '📝 Review'],
        ];
        return entries
            .filter(([key]) => breakdown[key] != null)
            .map(([key, label]) => `${label}: ${Number(breakdown[key]) >= 0 ? '+' : ''}${Number(breakdown[key])}`);
    },

    formatTabsMultiplierLine(result = {}, breakdown = {}) {
        const toNumberOrNull = (v) => {
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
        };
        const tier = toNumberOrNull(result.tier_multiplier ?? breakdown.tier_multiplier);
        const seeder = toNumberOrNull(result.seeder_multiplier ?? breakdown.seeder_multiplier);
        const parts = [];
        if (tier != null) parts.push(`× ${tier.toFixed(2).replace(/\.00$/, '')}x Tier`);
        if (seeder != null) parts.push(`× ${seeder.toFixed(2).replace(/\.00$/, '')}x Seeder`);
        return parts.join(' · ');
    },

    async showRatingFeedback(result) {
        if (!result || result.updated) return;
        if (result.tabs_reason === 'weekly_cap') {
            this.toast('Weekly cap reached — no tabs earned. Your first 10 ratings each week earn tabs!', 'tabs');
            return;
        }
        const earned = Number(result.tabs_earned ?? result.tabsEarned ?? 0);
        if (earned <= 0) return;
        const breakdown = result.tabs_breakdown || result.breakdown || {};
        const lineItems = this.formatTabsBreakdownLineItems(breakdown);
        const multiplierLine = this.formatTabsMultiplierLine(result, breakdown);
        const parts = [`+${earned} Tabs earned!`];
        if (lineItems.length) parts.push(lineItems.join(' · '));
        if (multiplierLine) parts.push(multiplierLine);
        this.toast(parts.join('\n'), 'tabs');
    },

    bindSubmissionModal() {
        const trigger = document.getElementById('submit-beer-trigger');
        const modal = document.getElementById('tabs-submission-modal');
        const cancel = document.getElementById('tabs-submission-cancel');
        const form = document.getElementById('tabs-submission-form');
        const styleSelect = document.getElementById('submission-style');
        if (!trigger || !modal || !cancel || !form || !styleSelect) return;

        const populateStyles = () => {
            const source = document.getElementById('beer-style');
            if (!source) return;
            const opts = Array.from(source.querySelectorAll('option'))
                .map((o) => o.value)
                .filter((v) => v);
            styleSelect.innerHTML = '<option value="">Select style...</option>' + opts.map((s) => `<option value="${Utils.escapeHtml(s)}">${Utils.escapeHtml(s)}</option>`).join('');
        };
        populateStyles();

        const open = () => { modal.style.display = 'flex'; };
        const close = () => { modal.style.display = 'none'; form.reset(); };
        trigger.addEventListener('click', open);
        cancel.addEventListener('click', close);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                beer_name: document.getElementById('submission-beer-name').value.trim(),
                brewery: document.getElementById('submission-brewery').value.trim() || null,
                style: document.getElementById('submission-style').value || null,
                abv: document.getElementById('submission-abv').value ? Number(document.getElementById('submission-abv').value) : null,
                notes: document.getElementById('submission-notes').value.trim() || null,
            };
            if (!payload.beer_name) {
                this.toast('Beer name is required.', 'error');
                return;
            }
            try {
                await DB.createTabsSubmission(payload);
                close();
                this.toast("Thanks! Your submission is pending review. You'll earn +3 tabs (with your multiplier) when approved.", 'success');
                await this.renderMySubmissions();
            } catch (err) {
                this.toast('Submission failed: ' + (err?.message || 'Unknown error'), 'error');
            }
        });
    },

    async renderMySubmissions() {
        const wrap = document.getElementById('profile-submissions-section');
        const list = document.getElementById('profile-submissions-list');
        if (!wrap || !list || DB.isDemo || !DB.currentUser) return;
        try {
            const out = await DB.getTabsSubmissions();
            this._mySubmissions = Array.isArray(out?.data) ? out.data : [];
            wrap.style.display = '';
            const statusLabel = (row) => {
                if (row.status === 'approved') return `Approved ✅${row.tabs_awarded ? ' (+tabs awarded)' : ''}`;
                if (row.status === 'rejected') return 'Rejected ❌';
                return 'Pending ⏳';
            };
            list.innerHTML = this._mySubmissions.length
                ? this._mySubmissions.map((s) => `
                    <div class="review-card">
                        <div class="review-content">
                            <div class="review-beer-name">${Utils.escapeHtml(s.beer_name || 'Beer submission')}</div>
                            <div class="review-meta">${Utils.escapeHtml(s.brewery || 'Unknown brewery')}${s.style ? ` · ${Utils.escapeHtml(s.style)}` : ''}</div>
                            <div class="review-user">${statusLabel(s)} · ${Utils.timeAgo(s.created_at)}</div>
                        </div>
                    </div>
                `).join('')
                : '<p class="empty-state">No submissions yet.</p>';
        } catch (err) {
            list.innerHTML = '<p class="empty-state">Could not load submissions.</p>';
        }
    },

    async renderTabsLeaderboard() {
        const list = document.getElementById('lb-tabs');
        if (!list || DB.isDemo) return;
        try {
            const out = await DB.getTabsLeaderboard(25, 0);
            const rows = Array.isArray(out?.data) ? out.data : [];
            this._tabsLeaderboard = rows;
            list.innerHTML = rows.length
                ? rows.map((row, idx) => `
                    <div class="lb-row tabs-lb-row">
                        <span class="lb-rank">${idx + 1}</span>
                        <span class="lb-name">
                            ${Utils.escapeHtml(row.display_name || 'Unknown')}
                            <span class="${this.tierClass(row.current_tier)}">${Utils.escapeHtml(this.tierLabel(row.current_tier))}${row.is_seeder ? ' ⭐' : ''}</span>
                        </span>
                        <span class="lb-value">${Number(row.lifetime_tabs_earned || 0).toLocaleString()} tabs · 🔥 ${Number(row.current_streak_weeks || 0)}</span>
                    </div>
                `).join('')
                : '<p class="empty-state">No tabs data yet.</p>';
        } catch (err) {
            list.innerHTML = '<p class="empty-state">Failed to load Tabs leaderboard.</p>';
        }
    },

    async renderProfileTabsSection() {
        const card = document.getElementById('profile-tabs-card');
        const summary = document.getElementById('profile-tabs-summary');
        if (!card || !summary || DB.isDemo || !DB.currentUser) return;
        try {
            const out = await DB.getTabsProfile();
            const p = out && out.data ? out.data : null;
            if (!p) return;
            this._tabProfile = p;
            card.style.display = '';
            const memberSince = DB.currentUser.created_at ? Utils.formatDate(DB.currentUser.created_at) : 'Recently joined';
            summary.innerHTML = `
                <div class="tabs-profile-grid">
                    <div><span class="${this.tierClass(p.current_tier)} tier-pill-large">${Utils.escapeHtml(p.tier_display_name || this.tierLabel(p.current_tier))}</span></div>
                    <div><strong>${this.formatTabsNumber(p.tab_balance)}</strong><span>Tab balance</span></div>
                    <div><strong>${this.formatTabsNumber(p.lifetime_tabs_earned)}</strong><span>Lifetime tabs earned</span></div>
                    <div><strong>${Number(p.current_streak_weeks || 0)}</strong><span>Current streak (weeks)</span></div>
                    <div><strong>${memberSince}</strong><span>Member since</span></div>
                    ${p.is_seeder ? '<div><span class="founding-badge">⭐ Founding Member</span></div>' : ''}
                </div>
            `;
        } catch (err) {
            console.warn('Profile tabs section failed:', err?.message || err);
        }
    },
};
