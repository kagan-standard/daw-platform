/* ============================================
   BeerBook Tabs Admin UI
   ============================================ */

const Admin = {
    _initialized: false,
    activeView: 'users',
    users: [],
    submissions: [],
    submissionsFilter: 'pending',
    stats: null,

    toast(message, type = 'info') {
        if (typeof App !== 'undefined' && App && typeof App.toast === 'function') {
            App.toast(message, type);
            return;
        }
        Utils.toast(message, type, 3000);
    },

    init() {
        if (this._initialized) return;
        this._initialized = true;
        const tabs = document.querySelectorAll('#admin-tabs .admin-tab');
        tabs.forEach((btn) => {
            btn.addEventListener('click', () => {
                const next = btn.getAttribute('data-admin-view') || 'users';
                this.switchView(next);
            });
        });
    },

    switchView(view) {
        const allowed = ['users', 'submissions', 'economy', 'challenges', 'achievements', 'featured', 'cosmetics', 'push'];
        this.activeView = allowed.includes(view) ? view : 'users';
        document.querySelectorAll('#admin-tabs .admin-tab').forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-admin-view') === this.activeView);
        });
        const panels = {
            users: document.getElementById('admin-users'),
            submissions: document.getElementById('admin-submissions'),
            economy: document.getElementById('admin-economy'),
            challenges: document.getElementById('admin-challenges'),
            achievements: document.getElementById('admin-achievements'),
            featured: document.getElementById('admin-featured'),
            cosmetics: document.getElementById('admin-cosmetics'),
            push: document.getElementById('admin-push'),
        };
        Object.entries(panels).forEach(([key, panel]) => {
            if (!panel) return;
            panel.style.display = key === this.activeView ? '' : 'none';
            panel.classList.toggle('active', key === this.activeView);
        });
        if (this.activeView === 'users') this.renderUsersPanel();
        if (this.activeView === 'submissions') this.renderSubmissionsPanel();
        if (this.activeView === 'economy') this.renderEconomyPanel();
        if (this.activeView === 'challenges') this.renderChallengesPanel();
        if (this.activeView === 'achievements') this.renderAchievementsPanel();
        if (this.activeView === 'featured') this.renderFeaturedPanel();
        if (this.activeView === 'cosmetics') this.renderCosmeticsPanel();
        if (this.activeView === 'push') this.renderPushNotificationsPanel();
    },

    async renderDashboard() {
        if (!DB.currentUser || !DB.currentUser.isAdmin) return;
        await this.renderUsersPanel();
        await this.renderSubmissionsPanel();
        await this.renderEconomyPanel();
        if (this.activeView === 'challenges') await this.renderChallengesPanel();
        if (this.activeView === 'achievements') await this.renderAchievementsPanel();
        if (this.activeView === 'featured') await this.renderFeaturedPanel();
        if (this.activeView === 'cosmetics') await this.renderCosmeticsPanel();
        if (this.activeView === 'push') await this.renderPushNotificationsPanel();
        const adminViewElement = document.getElementById('view-admin');
        if (adminViewElement) {
            let burstContainer = document.getElementById('admin-tab-burst');
            if (!burstContainer) {
                burstContainer = document.createElement('div');
                burstContainer.id = 'admin-tab-burst';
                adminViewElement.appendChild(burstContainer);
            }
            burstContainer.innerHTML = '';
            if (typeof TabBurstAdmin !== 'undefined' && typeof TabBurstAdmin.render === 'function') {
                TabBurstAdmin.render(burstContainer);
            }
        }
        this.switchView(this.activeView || 'users');
    },

    tierOptions(selectedTier) {
        const tiers = ['taster', 'regular', 'local', 'patron', 'house_account', 'cellar_reserve'];
        return tiers.map((t) => `<option value="${t}" ${t === selectedTier ? 'selected' : ''}>${t.replace(/_/g, ' ')}</option>`).join('');
    },

    async renderUsersPanel() {
        const panel = document.getElementById('admin-users');
        if (!panel) return;
        panel.innerHTML = '<p class="empty-state">Loading users…</p>';
        try {
            const out = await DB.adminTabsGetUsers();
            this.users = Array.isArray(out?.data) ? out.data : [];
            panel.innerHTML = `
                <div class="admin-panel-wrap">
                    <div class="admin-table-wrap">
                        <table class="admin-table">
                            <thead>
                                <tr>
                                    <th>User</th>
                                    <th>Tier</th>
                                    <th>Seeder</th>
                                    <th>Balance</th>
                                    <th>Lifetime</th>
                                    <th>Streak</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.users.map((u) => {
                                    const p = u.tabs_profile || {};
                                    return `
                                        <tr data-user-id="${Utils.escapeHtml(u.id)}">
                                            <td>
                                                <div class="admin-user-cell">
                                                    <span class="admin-user-avatar">${Utils.escapeHtml(Utils.initials(u.display_name || 'U') || 'U')}</span>
                                                    <span>${Utils.escapeHtml(u.display_name || u.email || 'Unknown')}</span>
                                                </div>
                                            </td>
                                            <td><span class="tier-badge tier-${String(p.current_tier || 'taster').replace(/_/g, '-')}">${Utils.escapeHtml((p.current_tier || 'taster').replace(/_/g, ' '))}</span></td>
                                            <td><label class="admin-switch"><input type="checkbox" class="admin-seeder-toggle" ${p.is_seeder ? 'checked' : ''}><span>Seeder</span></label></td>
                                            <td class="admin-balance">${Number(p.tab_balance || 0).toLocaleString()}</td>
                                            <td>${Number(p.lifetime_tabs_earned || 0).toLocaleString()}</td>
                                            <td>${Number(p.current_streak_weeks || 0)}</td>
                                            <td>
                                                <div class="admin-actions">
                                                    <select class="admin-tier-select">${this.tierOptions(p.current_tier || 'taster')}</select>
                                                    <button class="btn btn-ghost btn-sm admin-adjust-btn" type="button">Adjust Tabs</button>
                                                </div>
                                                <form class="admin-adjust-form" style="display:none;">
                                                    <input type="number" class="admin-adjust-amount" placeholder="+ / - amount" required>
                                                    <input type="text" class="admin-adjust-reason" placeholder="Reason" required>
                                                    <button class="btn btn-primary btn-sm" type="submit">Save</button>
                                                </form>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            panel.querySelectorAll('.admin-seeder-toggle').forEach((el) => {
                el.addEventListener('change', async (e) => {
                    const row = e.target.closest('tr');
                    if (!row) return;
                    const userId = row.getAttribute('data-user-id');
                    const checked = !!e.target.checked;
                    try {
                        await DB.adminTabsSetSeeder(userId, checked);
                        const user = this.users.find((x) => x.id === userId);
                        const name = user?.display_name || 'user';
                        this.toast(`Seeder status updated for ${name}`, 'success');
                    } catch (err) {
                        e.target.checked = !checked;
                        this.toast('Failed to update seeder status: ' + (err?.message || ''), 'error');
                    }
                });
            });

            panel.querySelectorAll('.admin-tier-select').forEach((el) => {
                el.addEventListener('change', async (e) => {
                    const row = e.target.closest('tr');
                    if (!row) return;
                    const userId = row.getAttribute('data-user-id');
                    const tier = e.target.value;
                    const user = this.users.find((x) => x.id === userId);
                    const name = user?.display_name || 'user';
                    if (!window.confirm(`Set ${name} to ${tier.replace(/_/g, ' ')}?`)) return;
                    try {
                        await DB.adminTabsSetTier(userId, tier);
                        this.toast(`Tier updated for ${name}`, 'success');
                        await this.renderUsersPanel();
                    } catch (err) {
                        this.toast('Tier update failed: ' + (err?.message || ''), 'error');
                    }
                });
            });

            panel.querySelectorAll('.admin-adjust-btn').forEach((el) => {
                el.addEventListener('click', (e) => {
                    const row = e.target.closest('tr');
                    if (!row) return;
                    const form = row.querySelector('.admin-adjust-form');
                    if (form) form.style.display = form.style.display === 'none' ? '' : 'none';
                });
            });

            panel.querySelectorAll('.admin-adjust-form').forEach((form) => {
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const row = e.target.closest('tr');
                    if (!row) return;
                    const userId = row.getAttribute('data-user-id');
                    const amount = Number(e.target.querySelector('.admin-adjust-amount').value);
                    const reason = e.target.querySelector('.admin-adjust-reason').value.trim();
                    if (!Number.isInteger(amount) || amount === 0 || !reason) {
                        this.toast('Enter a non-zero amount and reason.', 'error');
                        return;
                    }
                    try {
                        const out = await DB.adminTabsAdjustBalance(userId, amount, reason);
                        const user = this.users.find((x) => x.id === userId);
                        const name = user?.display_name || 'user';
                        const updated = out?.data || {};
                        const balanceCell = row.querySelector('.admin-balance');
                        if (balanceCell) balanceCell.textContent = Number(updated.tab_balance || 0).toLocaleString();
                        this.toast(`Adjusted ${name}'s tabs by ${amount}: ${reason}`, 'success');
                        e.target.reset();
                        e.target.style.display = 'none';
                    } catch (err) {
                        this.toast('Adjustment failed: ' + (err?.message || ''), 'error');
                    }
                });
            });
        } catch (err) {
            panel.innerHTML = '<p class="empty-state">Failed to load users.</p>';
        }
    },

    async renderSubmissionsPanel() {
        const panel = document.getElementById('admin-submissions');
        if (!panel) return;
        panel.innerHTML = `
            <div class="admin-panel-wrap">
                <p class="empty-state">Beer submissions now happen through the rating flow.</p>
                <p class="empty-state">This section will be used for Happy Hour deal submissions in the future.</p>
            </div>
        `;
    },

    async renderEconomyPanel() {
        const panel = document.getElementById('admin-economy');
        if (!panel) return;
        try {
            const [stats, usersOut, submissionsOut] = await Promise.all([
                DB.adminTabsGetStats(),
                DB.adminTabsGetUsers(),
                DB.adminTabsGetSubmissions('pending'),
            ]);
            const users = Array.isArray(usersOut?.data) ? usersOut.data : [];
            const profiles = users.map((u) => u.tabs_profile).filter(Boolean);
            const totalLifetime = profiles.reduce((sum, p) => sum + Number(p.lifetime_tabs_earned || 0), 0);
            const activeThisWeek = profiles.filter((p) => Number(p.ratings_this_week || 0) > 0).length;
            const avgPerUserWeekly = activeThisWeek > 0
                ? (profiles.reduce((sum, p) => sum + Number(p.ratings_this_week || 0), 0) / activeThisWeek).toFixed(2)
                : '0.00';
            const tierCounts = stats.distribution_by_tier || {};
            const tierText = Object.entries(tierCounts).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' • ');
            panel.innerHTML = `
                <div class="admin-stats-grid">
                    <div class="stat-card"><div class="stat-value">${Number(stats.tabs_in_circulation || 0).toLocaleString()}</div><div class="stat-label">Tabs in circulation</div></div>
                    <div class="stat-card"><div class="stat-value">${Number(totalLifetime || 0).toLocaleString()}</div><div class="stat-label">Total tabs ever earned</div></div>
                    <div class="stat-card"><div class="stat-value">${activeThisWeek}</div><div class="stat-label">Active users this week</div></div>
                    <div class="stat-card"><div class="stat-value">${Number(stats.active_seeders || 0)}</div><div class="stat-label">Seeders count</div></div>
                    <div class="stat-card"><div class="stat-value">${Array.isArray(submissionsOut?.data) ? submissionsOut.data.length : 0}</div><div class="stat-label">Pending submissions</div></div>
                    <div class="stat-card"><div class="stat-value">${avgPerUserWeekly}</div><div class="stat-label">Avg tabs per active user/week</div></div>
                </div>
                <div class="admin-economy-tier-breakdown">
                    <h3>Users by Tier</h3>
                    <p>${Utils.escapeHtml(tierText || 'No tier data yet.')}</p>
                </div>
            `;
        } catch (err) {
            panel.innerHTML = '<p class="empty-state">Failed to load economy stats.</p>';
        }
    },

    async renderChallengesPanel() {
        const panel = document.getElementById('admin-challenges');
        if (!panel) return;
        panel.innerHTML = '<p class="empty-state">Loading challenges…</p>';
        try {
            const out = await DB.adminGetChallenges({ limit: 100, offset: 0 });
            const list = Array.isArray(out?.data) ? out.data : [];
            panel.innerHTML = `
                <div class="admin-panel-wrap">
                    <div class="admin-table-actions">
                        <button type="button" class="btn btn-primary admin-create-challenge-btn">+ New Challenge</button>
                    </div>
                    <div class="admin-table-wrap">
                        <table class="admin-table">
                            <thead><tr><th>Week start</th><th>Title</th><th>Target</th><th>Reward</th><th>Actions</th></tr></thead>
                            <tbody>
                                ${list.map((c) => `
                                    <tr data-challenge-id="${Utils.escapeHtml(c.id)}">
                                        <td>${Utils.escapeHtml((c.week_start || '').slice(0, 10))}</td>
                                        <td>${Utils.escapeHtml(c.title || '')}</td>
                                        <td>${c.target_count ?? ''} ${Utils.escapeHtml(c.target_style || 'any')}</td>
                                        <td>${Utils.escapeHtml(c.reward_label || '')}</td>
                                        <td>
                                            <button type="button" class="btn btn-ghost btn-sm admin-edit-challenge-btn">Edit</button>
                                            <button type="button" class="btn btn-ghost btn-sm admin-delete-challenge-btn">Delete</button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div id="admin-challenge-modal" class="admin-modal" style="display:none;">
                    <div class="admin-modal-content">
                        <h3 class="admin-modal-title">Challenge</h3>
                        <form id="admin-challenge-form" class="admin-form">
                            <input type="hidden" id="admin-challenge-id" value="">
                            <div class="form-group">
                                <label for="admin-challenge-week-start">Week start (Monday date, UTC)</label>
                                <input type="date" id="admin-challenge-week-start" required>
                            </div>
                            <div class="form-group">
                                <label for="admin-challenge-title">Title</label>
                                <input type="text" id="admin-challenge-title" maxlength="200" required>
                            </div>
                            <div class="form-group">
                                <label for="admin-challenge-description">Description</label>
                                <textarea id="admin-challenge-description" rows="3" maxlength="1000" required></textarea>
                            </div>
                            <div class="form-group">
                                <label for="admin-challenge-target-count">Target count</label>
                                <input type="number" id="admin-challenge-target-count" min="1" required>
                            </div>
                            <div class="form-group">
                                <label for="admin-challenge-target-style">Target style (optional)</label>
                                <input type="text" id="admin-challenge-target-style" placeholder="e.g. IPA">
                            </div>
                            <div class="form-group">
                                <label for="admin-challenge-reward-label">Reward label</label>
                                <input type="text" id="admin-challenge-reward-label" required>
                            </div>
                            <div class="form-group">
                                <label for="admin-challenge-reward-badge-id">Reward badge ID (UUID, optional)</label>
                                <input type="text" id="admin-challenge-reward-badge-id" placeholder="uuid">
                            </div>
                            <div class="admin-modal-actions">
                                <button type="button" class="btn btn-ghost admin-modal-cancel">Cancel</button>
                                <button type="submit" class="btn btn-primary">Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            `;
            panel.querySelector('.admin-create-challenge-btn')?.addEventListener('click', () => this.openChallengeModal());
            panel.querySelectorAll('.admin-edit-challenge-btn').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    const id = e.target.closest('tr')?.getAttribute('data-challenge-id');
                    if (id) this.openChallengeModal(id);
                });
            });
            panel.querySelectorAll('.admin-delete-challenge-btn').forEach((btn) => {
                btn.addEventListener('click', async (e) => {
                    const row = e.target.closest('tr');
                    const id = row?.getAttribute('data-challenge-id');
                    if (!id || !window.confirm('Delete this challenge?')) return;
                    try {
                        await DB.adminDeleteChallenge(id);
                        this.toast('Challenge deleted', 'success');
                        this.renderChallengesPanel();
                    } catch (err) {
                        this.toast('Delete failed: ' + (err?.message || ''), 'error');
                    }
                });
            });
            panel.querySelector('#admin-challenge-form')?.addEventListener('submit', (e) => this.saveChallengeForm(e));
            panel.querySelector('.admin-modal-cancel')?.addEventListener('click', () => this.closeChallengeModal());
        } catch (err) {
            panel.innerHTML = '<p class="empty-state">Failed to load challenges.</p>';
        }
    },

    openChallengeModal(id = null) {
        const modal = document.getElementById('admin-challenge-modal');
        const form = document.getElementById('admin-challenge-form');
        if (!modal || !form) return;
        document.getElementById('admin-challenge-id').value = id || '';
        if (id) {
            DB.adminGetChallenge(id).then((c) => {
                if (!c) return;
                document.getElementById('admin-challenge-week-start').value = (c.week_start || '').slice(0, 10) || '';
                form.querySelector('#admin-challenge-title').value = c.title || '';
                form.querySelector('#admin-challenge-description').value = c.description || '';
                form.querySelector('#admin-challenge-target-count').value = c.target_count ?? '';
                form.querySelector('#admin-challenge-target-style').value = c.target_style || '';
                form.querySelector('#admin-challenge-reward-label').value = c.reward_label || '';
                form.querySelector('#admin-challenge-reward-badge-id').value = c.reward_badge_id || '';
                modal.style.display = '';
            }).catch(() => this.toast('Failed to load challenge', 'error'));
        } else {
            form.reset();
            document.getElementById('admin-challenge-id').value = '';
            modal.style.display = '';
        }
    },
    closeChallengeModal() {
        const modal = document.getElementById('admin-challenge-modal');
        if (modal) modal.style.display = 'none';
    },
    async saveChallengeForm(e) {
        e.preventDefault();
        const id = document.getElementById('admin-challenge-id')?.value?.trim() || null;
        const weekStartInput = document.getElementById('admin-challenge-week-start')?.value;
        if (!weekStartInput) { this.toast('Week start required', 'error'); return; }
        const week_start = weekStartInput + 'T00:00:00.000Z';
        const payload = {
            week_start,
            title: document.getElementById('admin-challenge-title')?.value?.trim() || '',
            description: document.getElementById('admin-challenge-description')?.value?.trim() || '',
            target_count: parseInt(document.getElementById('admin-challenge-target-count')?.value, 10) || 1,
            target_style: document.getElementById('admin-challenge-target-style')?.value?.trim() || null,
            reward_label: document.getElementById('admin-challenge-reward-label')?.value?.trim() || '',
            reward_badge_id: document.getElementById('admin-challenge-reward-badge-id')?.value?.trim() || null,
        };
        try {
            if (id) {
                await DB.adminUpdateChallenge(id, payload);
                this.toast('Challenge updated', 'success');
            } else {
                await DB.adminCreateChallenge(payload);
                this.toast('Challenge created', 'success');
            }
            this.closeChallengeModal();
            this.renderChallengesPanel();
        } catch (err) {
            this.toast('Save failed: ' + (err?.message || err?.error || ''), 'error');
        }
    },

    async renderAchievementsPanel() {
        const panel = document.getElementById('admin-achievements');
        if (!panel) return;
        panel.innerHTML = '<p class="empty-state">Loading achievements…</p>';
        try {
            const [achOut, catOut] = await Promise.all([DB.adminGetAchievements(), DB.adminGetAchievementCategories()]);
            const list = Array.isArray(achOut?.data) ? achOut.data : [];
            const categories = Array.isArray(catOut?.data) ? catOut.data : [];
            panel.innerHTML = `
                <div class="admin-panel-wrap">
                    <div class="admin-table-actions">
                        <button type="button" class="btn btn-primary admin-create-achievement-btn">+ New Achievement</button>
                    </div>
                    <div class="admin-table-wrap">
                        <table class="admin-table">
                            <thead><tr><th>Key</th><th>Name</th><th>Category</th><th>Active</th><th>Actions</th></tr></thead>
                            <tbody>
                                ${list.map((a) => `
                                    <tr data-achievement-id="${Utils.escapeHtml(a.id)}">
                                        <td><code>${Utils.escapeHtml(a.key || '')}</code></td>
                                        <td>${Utils.escapeHtml(a.name || '')}</td>
                                        <td>${Utils.escapeHtml(a.category_key || (a.achievement_categories && a.achievement_categories.name) || '')}</td>
                                        <td>${a.active !== false ? '✓' : '—'}</td>
                                        <td>
                                            <button type="button" class="btn btn-ghost btn-sm admin-edit-achievement-btn">Edit</button>
                                            ${a.active !== false ? '<button type="button" class="btn btn-ghost btn-sm admin-deactivate-achievement-btn">Deactivate</button>' : ''}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div id="admin-achievement-modal" class="admin-modal" style="display:none;">
                    <div class="admin-modal-content admin-modal-wide">
                        <h3 class="admin-modal-title">Achievement</h3>
                        <form id="admin-achievement-form" class="admin-form">
                            <input type="hidden" id="admin-achievement-id" value="">
                            <div class="form-group">
                                <label for="admin-achievement-key">Key (slug)</label>
                                <input type="text" id="admin-achievement-key" pattern="[a-z0-9_]+" required>
                            </div>
                            <div class="form-group">
                                <label for="admin-achievement-name">Name</label>
                                <input type="text" id="admin-achievement-name" maxlength="200" required>
                            </div>
                            <div class="form-group">
                                <label for="admin-achievement-description">Description</label>
                                <textarea id="admin-achievement-description" rows="2" required></textarea>
                            </div>
                            <div class="form-group">
                                <label for="admin-achievement-category">Category key</label>
                                <select id="admin-achievement-category">${categories.map((c) => `<option value="${Utils.escapeHtml(c.key)}">${Utils.escapeHtml(c.name || c.key)}</option>`).join('')}</select>
                            </div>
                            <div class="form-group">
                                <label for="admin-achievement-subtype">Subtype</label>
                                <select id="admin-achievement-subtype">
                                    <option value="checkin_count">checkin_count</option>
                                    <option value="total_ratings">total_ratings</option>
                                    <option value="unique_styles">unique_styles</option>
                                    <option value="unique_venues">unique_venues</option>
                                    <option value="review_min_len">review_min_len</option>
                                    <option value="stars_gte">stars_gte</option>
                                    <option value="stars_lte">stars_lte</option>
                                    <option value="price">price</option>
                                    <option value="cheers_given">cheers_given</option>
                                    <option value="cheers_received">cheers_received</option>
                                    <option value="streak_weeks">streak_weeks</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label for="admin-achievement-trigger">Trigger type</label>
                                <input type="text" id="admin-achievement-trigger" required placeholder="e.g. rating_submitted">
                            </div>
                            <div class="form-group">
                                <label for="admin-achievement-rules">Rules (JSON)</label>
                                <textarea id="admin-achievement-rules" rows="4" required placeholder='{"count": 5}'></textarea>
                            </div>
                            <div class="form-group">
                                <label for="admin-achievement-difficulty">Difficulty</label>
                                <select id="admin-achievement-difficulty"><option value="easy">easy</option><option value="medium">medium</option><option value="hard">hard</option></select>
                            </div>
                            <div class="form-group">
                                <label for="admin-achievement-reward-tabs">Reward tabs</label>
                                <input type="number" id="admin-achievement-reward-tabs" min="0" value="0">
                            </div>
                            <div class="form-group">
                                <label><input type="checkbox" id="admin-achievement-is-hidden"> Hidden</label>
                            </div>
                            <div class="admin-modal-actions">
                                <button type="button" class="btn btn-ghost admin-achievement-modal-cancel">Cancel</button>
                                <button type="submit" class="btn btn-primary">Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            `;
            panel.querySelector('.admin-create-achievement-btn')?.addEventListener('click', () => this.openAchievementModal(null, categories));
            panel.querySelectorAll('.admin-edit-achievement-btn').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    const id = e.target.closest('tr')?.getAttribute('data-achievement-id');
                    if (id) this.openAchievementModal(id, categories);
                });
            });
            panel.querySelectorAll('.admin-deactivate-achievement-btn').forEach((btn) => {
                btn.addEventListener('click', async (e) => {
                    const id = e.target.closest('tr')?.getAttribute('data-achievement-id');
                    if (!id || !window.confirm('Deactivate this achievement?')) return;
                    try {
                        await DB.adminDeactivateAchievement(id);
                        this.toast('Achievement deactivated', 'success');
                        this.renderAchievementsPanel();
                    } catch (err) {
                        this.toast('Failed: ' + (err?.message || ''), 'error');
                    }
                });
            });
            panel.querySelector('#admin-achievement-form')?.addEventListener('submit', (e) => this.saveAchievementForm(e));
            panel.querySelector('.admin-achievement-modal-cancel')?.addEventListener('click', () => this.closeAchievementModal());
        } catch (err) {
            panel.innerHTML = '<p class="empty-state">Failed to load achievements.</p>';
        }
    },
    openAchievementModal(id, categories) {
        const modal = document.getElementById('admin-achievement-modal');
        const form = document.getElementById('admin-achievement-form');
        if (!modal || !form) return;
        if (id) {
            DB.adminGetAchievement(id).then((a) => {
                if (!a) return;
                document.getElementById('admin-achievement-id').value = a.id || '';
                form.querySelector('#admin-achievement-key').value = a.key || '';
                form.querySelector('#admin-achievement-key').readOnly = true;
                form.querySelector('#admin-achievement-name').value = a.name || '';
                form.querySelector('#admin-achievement-description').value = a.description || '';
                form.querySelector('#admin-achievement-category').value = a.category_key || '';
                form.querySelector('#admin-achievement-subtype').value = a.subtype || 'total_ratings';
                form.querySelector('#admin-achievement-trigger').value = a.trigger_type || '';
                form.querySelector('#admin-achievement-rules').value = typeof a.rules === 'object' ? JSON.stringify(a.rules, null, 2) : (a.rules || '{}');
                form.querySelector('#admin-achievement-difficulty').value = a.difficulty || 'easy';
                form.querySelector('#admin-achievement-reward-tabs').value = a.reward_tabs ?? 0;
                form.querySelector('#admin-achievement-is-hidden').checked = !!a.is_hidden;
                modal.style.display = '';
            }).catch(() => this.toast('Failed to load achievement', 'error'));
        } else {
            document.getElementById('admin-achievement-id').value = '';
            form.querySelector('#admin-achievement-key').readOnly = false;
            form.reset();
            modal.style.display = '';
        }
    },
    closeAchievementModal() {
        const modal = document.getElementById('admin-achievement-modal');
        if (modal) modal.style.display = 'none';
    },
    async saveAchievementForm(e) {
        e.preventDefault();
        const id = document.getElementById('admin-achievement-id')?.value?.trim() || null;
        let rules;
        try {
            rules = JSON.parse(document.getElementById('admin-achievement-rules')?.value || '{}');
        } catch {
            this.toast('Invalid JSON in rules', 'error');
            return;
        }
        const payload = {
            key: document.getElementById('admin-achievement-key')?.value?.trim()?.toLowerCase() || '',
            name: document.getElementById('admin-achievement-name')?.value?.trim() || '',
            description: document.getElementById('admin-achievement-description')?.value?.trim() || '',
            category_key: document.getElementById('admin-achievement-category')?.value?.trim() || '',
            subtype: document.getElementById('admin-achievement-subtype')?.value?.trim() || '',
            trigger_type: document.getElementById('admin-achievement-trigger')?.value?.trim() || '',
            rules,
            difficulty: document.getElementById('admin-achievement-difficulty')?.value || 'easy',
            reward_tabs: parseInt(document.getElementById('admin-achievement-reward-tabs')?.value, 10) || 0,
            is_hidden: document.getElementById('admin-achievement-is-hidden')?.checked || false,
        };
        if (id) delete payload.key;
        try {
            if (id) {
                await DB.adminUpdateAchievement(id, payload);
                this.toast('Achievement updated', 'success');
            } else {
                await DB.adminCreateAchievement(payload);
                this.toast('Achievement created', 'success');
            }
            this.closeAchievementModal();
            this.renderAchievementsPanel();
        } catch (err) {
            this.toast('Save failed: ' + (err?.message || err?.error || ''), 'error');
        }
    },

    async renderFeaturedPanel() {
        const panel = document.getElementById('admin-featured');
        if (!panel) return;
        panel.innerHTML = '<p class="empty-state">Loading featured beers…</p>';
        try {
            const out = await DB.adminGetFeaturedBeers({ limit: 100, offset: 0 });
            const list = Array.isArray(out?.data) ? out.data : [];
            panel.innerHTML = `
                <div class="admin-panel-wrap">
                    <div class="admin-table-actions">
                        <button type="button" class="btn btn-primary admin-create-featured-btn">+ New Featured Beer</button>
                    </div>
                    <div class="admin-table-wrap">
                        <table class="admin-table">
                            <thead><tr><th>Week start</th><th>Beer</th><th>Brewery</th><th>Actions</th></tr></thead>
                            <tbody>
                                ${list.map((f) => `
                                    <tr data-featured-id="${Utils.escapeHtml(f.id)}">
                                        <td>${Utils.escapeHtml((f.week_start || '').slice(0, 10))}</td>
                                        <td>${Utils.escapeHtml(f.beer_name || '')}</td>
                                        <td>${Utils.escapeHtml(f.brewery || '')}</td>
                                        <td>
                                            <button type="button" class="btn btn-ghost btn-sm admin-edit-featured-btn">Edit</button>
                                            <button type="button" class="btn btn-ghost btn-sm admin-delete-featured-btn">Delete</button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div id="admin-featured-modal" class="admin-modal" style="display:none;">
                    <div class="admin-modal-content">
                        <h3 class="admin-modal-title">Featured Beer</h3>
                        <form id="admin-featured-form" class="admin-form">
                            <input type="hidden" id="admin-featured-id" value="">
                            <div class="form-group">
                                <label for="admin-featured-beer-name">Beer name *</label>
                                <input type="text" id="admin-featured-beer-name" required>
                            </div>
                            <div class="form-group">
                                <label for="admin-featured-brewery">Brewery</label>
                                <input type="text" id="admin-featured-brewery">
                            </div>
                            <div class="form-group">
                                <label for="admin-featured-style">Style</label>
                                <input type="text" id="admin-featured-style">
                            </div>
                            <div class="form-group">
                                <label for="admin-featured-week-start">Week start (ISO date)</label>
                                <input type="date" id="admin-featured-week-start" required>
                            </div>
                            <div class="form-group">
                                <label for="admin-featured-headline">Headline</label>
                                <input type="text" id="admin-featured-headline">
                            </div>
                            <div class="form-group">
                                <label for="admin-featured-body">Body</label>
                                <textarea id="admin-featured-body" rows="2"></textarea>
                            </div>
                            <div class="admin-modal-actions">
                                <button type="button" class="btn btn-ghost admin-featured-modal-cancel">Cancel</button>
                                <button type="submit" class="btn btn-primary">Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            `;
            panel.querySelector('.admin-create-featured-btn')?.addEventListener('click', () => this.openFeaturedModal());
            panel.querySelectorAll('.admin-edit-featured-btn').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    const id = e.target.closest('tr')?.getAttribute('data-featured-id');
                    if (id) this.openFeaturedModal(id);
                });
            });
            panel.querySelectorAll('.admin-delete-featured-btn').forEach((btn) => {
                btn.addEventListener('click', async (e) => {
                    const id = e.target.closest('tr')?.getAttribute('data-featured-id');
                    if (!id || !window.confirm('Remove this featured beer?')) return;
                    try {
                        await DB.adminDeleteFeaturedBeer(id);
                        this.toast('Featured beer removed', 'success');
                        this.renderFeaturedPanel();
                    } catch (err) {
                        this.toast('Delete failed: ' + (err?.message || ''), 'error');
                    }
                });
            });
            panel.querySelector('#admin-featured-form')?.addEventListener('submit', (e) => this.saveFeaturedForm(e));
            panel.querySelector('.admin-featured-modal-cancel')?.addEventListener('click', () => this.closeFeaturedModal());
        } catch (err) {
            panel.innerHTML = '<p class="empty-state">Failed to load featured beers.</p>';
        }
    },
    openFeaturedModal(id = null) {
        const modal = document.getElementById('admin-featured-modal');
        const form = document.getElementById('admin-featured-form');
        if (!modal || !form) return;
        if (id) {
            DB.adminGetFeaturedBeers({ limit: 500 }).then((out) => {
                const row = (out?.data || []).find((f) => f.id === id);
                if (!row) return;
                document.getElementById('admin-featured-id').value = row.id;
                form.querySelector('#admin-featured-beer-name').value = row.beer_name || '';
                form.querySelector('#admin-featured-brewery').value = row.brewery || '';
                form.querySelector('#admin-featured-style').value = row.style || '';
                form.querySelector('#admin-featured-week-start').value = (row.week_start || '').slice(0, 10) || '';
                form.querySelector('#admin-featured-headline').value = row.headline || '';
                form.querySelector('#admin-featured-body').value = row.body || '';
                modal.style.display = '';
            }).catch(() => this.toast('Failed to load', 'error'));
        } else {
            document.getElementById('admin-featured-id').value = '';
            form.reset();
            const monday = new Date();
            const day = monday.getUTCDay();
            const diff = day === 0 ? -6 : 1 - day;
            monday.setUTCDate(monday.getUTCDate() + diff);
            form.querySelector('#admin-featured-week-start').value = monday.toISOString().slice(0, 10);
            modal.style.display = '';
        }
    },
    closeFeaturedModal() {
        const modal = document.getElementById('admin-featured-modal');
        if (modal) modal.style.display = 'none';
    },
    async saveFeaturedForm(e) {
        e.preventDefault();
        const id = document.getElementById('admin-featured-id')?.value?.trim() || null;
        const weekStart = document.getElementById('admin-featured-week-start')?.value;
        if (!weekStart) { this.toast('Week start required', 'error'); return; }
        const payload = {
            beer_name: document.getElementById('admin-featured-beer-name')?.value?.trim() || '',
            brewery: document.getElementById('admin-featured-brewery')?.value?.trim() || null,
            style: document.getElementById('admin-featured-style')?.value?.trim() || null,
            week_start: new Date(weekStart + 'T00:00:00Z').toISOString(),
            headline: document.getElementById('admin-featured-headline')?.value?.trim() || null,
            body: document.getElementById('admin-featured-body')?.value?.trim() || null,
        };
        try {
            if (id) {
                await DB.adminUpdateFeaturedBeer(id, payload);
                this.toast('Featured beer updated', 'success');
            } else {
                await DB.adminCreateFeaturedBeer(payload);
                this.toast('Featured beer created', 'success');
            }
            this.closeFeaturedModal();
            this.renderFeaturedPanel();
        } catch (err) {
            this.toast('Save failed: ' + (err?.message || err?.error || ''), 'error');
        }
    },

    async renderPushNotificationsPanel() {
        const panel = document.getElementById('admin-push');
        if (!panel) return;
        panel.innerHTML = '<p class="empty-state">Loading push notification settings…</p>';
        try {
            const out = await DB.adminGetPushNotificationTypes();
            const list = Array.isArray(out?.data) ? out.data : [];
            panel.innerHTML = `
                <div class="admin-panel-wrap">
                    <p class="view-desc" style="margin-bottom: 1rem;">Enable or disable Expo push per notification type. New types are added via backend migrations only.</p>
                    <form id="admin-push-form" class="admin-form">
                        <div class="admin-table-wrap">
                            <table class="admin-table">
                                <thead><tr><th>Type</th><th>Label</th><th>Push enabled</th></tr></thead>
                                <tbody>
                                    ${list.map((row) => `
                                        <tr>
                                            <td><code>${Utils.escapeHtml(row.notification_type || '')}</code></td>
                                            <td>${Utils.escapeHtml(row.label || '')}</td>
                                            <td>
                                                <label>
                                                    <input type="checkbox" class="admin-push-toggle" data-type="${Utils.escapeHtml(row.notification_type || '')}" ${row.push_enabled !== false ? 'checked' : ''}>
                                                </label>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                        <div class="admin-table-actions" style="margin-top: 1rem;">
                            <button type="submit" class="btn btn-primary">Save changes</button>
                        </div>
                    </form>
                </div>
            `;
            panel.querySelector('#admin-push-form')?.addEventListener('submit', (e) => this.savePushNotificationsForm(e));
        } catch (err) {
            panel.innerHTML = '<p class="empty-state">Failed to load push notification settings.</p>';
        }
    },
    async savePushNotificationsForm(e) {
        e.preventDefault();
        const form = e.target;
        const toggles = {};
        form.querySelectorAll('.admin-push-toggle').forEach((input) => {
            const type = input.getAttribute('data-type');
            if (!type) return;
            toggles[type] = !!input.checked;
        });
        try {
            await DB.adminPatchPushNotificationTypes({ toggles });
            this.toast('Push notification settings saved', 'success');
            await this.renderPushNotificationsPanel();
        } catch (err) {
            this.toast('Save failed: ' + (err?.message || err?.error || ''), 'error');
        }
    },

    async renderCosmeticsPanel() {
        const panel = document.getElementById('admin-cosmetics');
        if (!panel) return;
        panel.innerHTML = '<p class="empty-state">Loading cosmetics…</p>';
        try {
            const out = await DB.adminGetCosmetics();
            const list = Array.isArray(out?.data) ? out.data : [];
            panel.innerHTML = `
                <div class="admin-panel-wrap">
                    <div class="admin-table-actions">
                        <button type="button" class="btn btn-primary admin-create-cosmetic-btn">+ New Cosmetic</button>
                    </div>
                    <div class="admin-table-wrap">
                        <table class="admin-table">
                            <thead><tr><th>Key</th><th>Name</th><th>Type</th><th>Rarity</th><th>Unlock</th><th>Active</th><th>Actions</th></tr></thead>
                            <tbody>
                                ${list.map((c) => `
                                    <tr data-cosmetic-id="${Utils.escapeHtml(c.id)}">
                                        <td><code>${Utils.escapeHtml(c.key || '')}</code></td>
                                        <td>${Utils.escapeHtml(c.name || '')}</td>
                                        <td>${Utils.escapeHtml(c.type || '')}</td>
                                        <td>${Utils.escapeHtml(c.rarity || '')}</td>
                                        <td>${Utils.escapeHtml(c.unlock_type || '')} ${c.tab_price != null ? '(' + c.tab_price + ')' : ''}</td>
                                        <td>${c.active !== false ? '✓' : '—'}</td>
                                        <td>
                                            <button type="button" class="btn btn-ghost btn-sm admin-edit-cosmetic-btn">Edit</button>
                                            ${c.active !== false ? '<button type="button" class="btn btn-ghost btn-sm admin-deactivate-cosmetic-btn">Deactivate</button>' : ''}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div id="admin-cosmetic-modal" class="admin-modal" style="display:none;">
                    <div class="admin-modal-content">
                        <h3 class="admin-modal-title">Cosmetic</h3>
                        <form id="admin-cosmetic-form" class="admin-form">
                            <input type="hidden" id="admin-cosmetic-id" value="">
                            <div class="form-group">
                                <label for="admin-cosmetic-key">Key (slug)</label>
                                <input type="text" id="admin-cosmetic-key" pattern="[a-z0-9_]+" required>
                            </div>
                            <div class="form-group">
                                <label for="admin-cosmetic-name">Name</label>
                                <input type="text" id="admin-cosmetic-name" required>
                            </div>
                            <div class="form-group">
                                <label for="admin-cosmetic-description">Description</label>
                                <textarea id="admin-cosmetic-description" rows="2" required></textarea>
                            </div>
                            <div class="form-group">
                                <label for="admin-cosmetic-type">Type</label>
                                <select id="admin-cosmetic-type"><option value="border">border</option><option value="title">title</option><option value="avatar">avatar</option></select>
                            </div>
                            <div class="form-group">
                                <label for="admin-cosmetic-rarity">Rarity</label>
                                <select id="admin-cosmetic-rarity"><option value="common">common</option><option value="rare">rare</option><option value="epic">epic</option><option value="legendary">legendary</option></select>
                            </div>
                            <div class="form-group">
                                <label for="admin-cosmetic-unlock-type">Unlock type</label>
                                <select id="admin-cosmetic-unlock-type"><option value="achievement">achievement</option><option value="purchase">purchase</option><option value="both">both</option></select>
                            </div>
                            <div class="form-group">
                                <label for="admin-cosmetic-tab-price">Tab price</label>
                                <input type="number" id="admin-cosmetic-tab-price" min="0" value="0">
                            </div>
                            <div class="form-group">
                                <label for="admin-cosmetic-achievement-key">Achievement key (optional)</label>
                                <input type="text" id="admin-cosmetic-achievement-key">
                            </div>
                            <div class="form-group">
                                <label><input type="checkbox" id="admin-cosmetic-active" checked> Active</label>
                            </div>
                            <div class="admin-modal-actions">
                                <button type="button" class="btn btn-ghost admin-cosmetic-modal-cancel">Cancel</button>
                                <button type="submit" class="btn btn-primary">Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            `;
            panel.querySelector('.admin-create-cosmetic-btn')?.addEventListener('click', () => this.openCosmeticModal());
            panel.querySelectorAll('.admin-edit-cosmetic-btn').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    const id = e.target.closest('tr')?.getAttribute('data-cosmetic-id');
                    if (id) this.openCosmeticModal(id);
                });
            });
            panel.querySelectorAll('.admin-deactivate-cosmetic-btn').forEach((btn) => {
                btn.addEventListener('click', async (e) => {
                    const id = e.target.closest('tr')?.getAttribute('data-cosmetic-id');
                    if (!id || !window.confirm('Deactivate this cosmetic?')) return;
                    try {
                        await DB.adminDeactivateCosmetic(id);
                        this.toast('Cosmetic deactivated', 'success');
                        this.renderCosmeticsPanel();
                    } catch (err) {
                        this.toast('Failed: ' + (err?.message || ''), 'error');
                    }
                });
            });
            panel.querySelector('#admin-cosmetic-form')?.addEventListener('submit', (e) => this.saveCosmeticForm(e));
            panel.querySelector('.admin-cosmetic-modal-cancel')?.addEventListener('click', () => this.closeCosmeticModal());
        } catch (err) {
            panel.innerHTML = '<p class="empty-state">Failed to load cosmetics.</p>';
        }
    },
    openCosmeticModal(id = null) {
        const modal = document.getElementById('admin-cosmetic-modal');
        const form = document.getElementById('admin-cosmetic-form');
        if (!modal || !form) return;
        if (id) {
            DB.adminGetCosmetics().then((out) => {
                const row = (out?.data || []).find((c) => c.id === id);
                if (!row) return;
                document.getElementById('admin-cosmetic-id').value = row.id || '';
                form.querySelector('#admin-cosmetic-key').value = row.key || '';
                form.querySelector('#admin-cosmetic-key').readOnly = true;
                form.querySelector('#admin-cosmetic-name').value = row.name || '';
                form.querySelector('#admin-cosmetic-description').value = row.description || '';
                form.querySelector('#admin-cosmetic-type').value = row.type || 'border';
                form.querySelector('#admin-cosmetic-rarity').value = row.rarity || 'common';
                form.querySelector('#admin-cosmetic-unlock-type').value = row.unlock_type || 'achievement';
                form.querySelector('#admin-cosmetic-tab-price').value = row.tab_price ?? 0;
                form.querySelector('#admin-cosmetic-achievement-key').value = row.achievement_key || '';
                form.querySelector('#admin-cosmetic-active').checked = row.active !== false;
                modal.style.display = '';
            }).catch(() => this.toast('Failed to load cosmetic', 'error'));
        } else {
            document.getElementById('admin-cosmetic-id').value = '';
            form.querySelector('#admin-cosmetic-key').readOnly = false;
            form.reset();
            modal.style.display = '';
        }
    },
    closeCosmeticModal() {
        const modal = document.getElementById('admin-cosmetic-modal');
        if (modal) modal.style.display = 'none';
    },
    async saveCosmeticForm(e) {
        e.preventDefault();
        const id = document.getElementById('admin-cosmetic-id')?.value?.trim() || null;
        const payload = {
            key: document.getElementById('admin-cosmetic-key')?.value?.trim()?.toLowerCase() || '',
            name: document.getElementById('admin-cosmetic-name')?.value?.trim() || '',
            description: document.getElementById('admin-cosmetic-description')?.value?.trim() || '',
            type: document.getElementById('admin-cosmetic-type')?.value || 'border',
            rarity: document.getElementById('admin-cosmetic-rarity')?.value || 'common',
            unlock_type: document.getElementById('admin-cosmetic-unlock-type')?.value || 'achievement',
            tab_price: parseInt(document.getElementById('admin-cosmetic-tab-price')?.value, 10) || 0,
            achievement_key: document.getElementById('admin-cosmetic-achievement-key')?.value?.trim() || null,
            active: document.getElementById('admin-cosmetic-active')?.checked !== false,
        };
        if (id) delete payload.key;
        try {
            if (id) {
                await DB.adminUpdateCosmetic(id, payload);
                this.toast('Cosmetic updated', 'success');
            } else {
                await DB.adminCreateCosmetic(payload);
                this.toast('Cosmetic created', 'success');
            }
            this.closeCosmeticModal();
            this.renderCosmeticsPanel();
        } catch (err) {
            this.toast('Save failed: ' + (err?.message || err?.error || ''), 'error');
        }
    },
};
