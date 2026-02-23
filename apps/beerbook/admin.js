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
        this.activeView = ['users', 'submissions', 'economy'].includes(view) ? view : 'users';
        document.querySelectorAll('#admin-tabs .admin-tab').forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-admin-view') === this.activeView);
        });
        const panels = {
            users: document.getElementById('admin-users'),
            submissions: document.getElementById('admin-submissions'),
            economy: document.getElementById('admin-economy'),
        };
        Object.entries(panels).forEach(([key, panel]) => {
            if (!panel) return;
            panel.style.display = key === this.activeView ? '' : 'none';
            panel.classList.toggle('active', key === this.activeView);
        });
        if (this.activeView === 'users') this.renderUsersPanel();
        if (this.activeView === 'submissions') this.renderSubmissionsPanel();
        if (this.activeView === 'economy') this.renderEconomyPanel();
    },

    async renderDashboard() {
        if (!DB.currentUser || !DB.currentUser.isAdmin) return;
        await this.renderUsersPanel();
        await this.renderSubmissionsPanel();
        await this.renderEconomyPanel();
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
};
