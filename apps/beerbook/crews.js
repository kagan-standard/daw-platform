(function () {
    if (typeof App === 'undefined' || typeof DB === 'undefined') return;

    function escape(v) {
        return Utils.escapeHtml(String(v || ''));
    }

    function ensureCrewTabInLeaderboard() {
        const tabs = document.querySelector('.leaderboard-tabs');
        if (!tabs || tabs.querySelector('[data-period="crew"]')) return;
        const crewBtn = document.createElement('button');
        crewBtn.type = 'button';
        crewBtn.className = 'lb-tab';
        crewBtn.dataset.period = 'crew';
        crewBtn.textContent = 'My Crew';
        tabs.appendChild(crewBtn);

        const crewSelect = document.createElement('select');
        crewSelect.id = 'leaderboard-crew-select';
        crewSelect.className = 'filter-select';
        crewSelect.style.display = 'none';
        tabs.insertAdjacentElement('afterend', crewSelect);

        crewBtn.addEventListener('click', () => {
            document.querySelectorAll('.lb-tab').forEach((t) => t.classList.remove('active'));
            crewBtn.classList.add('active');
            crewSelect.style.display = '';
            renderCrewScopedLeaderboard();
        });
        crewSelect.addEventListener('change', renderCrewScopedLeaderboard);
    }

    function populateLeaderboardCrewSelect() {
        const select = document.getElementById('leaderboard-crew-select');
        if (!select) return;
        const crews = App.socialGraph?.myCrews || [];
        select.innerHTML = crews.length
            ? crews.map((c) => `<option value="${escape(c.id)}">${escape(c.name || 'Crew')}</option>`).join('')
            : '<option value="">No crews</option>';
    }

    function renderCrewScopedLeaderboard() {
        const select = document.getElementById('leaderboard-crew-select');
        const crewId = select?.value || '';
        const crew = (App.socialGraph?.myCrews || []).find((c) => c.id === crewId);
        const ids = new Set(Array.isArray(crew?.member_user_ids) ? crew.member_user_ids : []);
        const original = App.allRatings;
        App.allRatings = (original || []).filter((r) => ids.has(r.user_id));
        App.renderLeaderboard('alltime');
        App.allRatings = original;
    }

    async function refreshCrewsView() {
        const listEl = document.getElementById('crews-list');
        if (!listEl) return;
        const out = await DB.getCrews().catch(() => ({ data: [] }));
        const crews = Array.isArray(out?.data) ? out.data : [];
        if (!crews.length) {
            listEl.innerHTML = '<p class="empty-state">No crews yet. Create one or join with a code.</p>';
            return;
        }
        listEl.innerHTML = crews.map((crew) => {
            const role = crew.my_role || 'member';
            const count = crew.member_count || (crew.member_user_ids || []).length || 0;
            return `
                <article class="crew-card" data-crew-id="${escape(crew.id)}">
                    <div class="crew-card-title">🍻 ${escape(crew.name || 'Crew')}</div>
                    <div class="crew-card-meta">${count}/50 members · ${escape(role)}</div>
                    <div class="crew-card-actions">
                        <button type="button" class="btn btn-ghost btn-sm crew-open-btn" data-crew-id="${escape(crew.id)}">Open</button>
                    </div>
                </article>
            `;
        }).join('');
    }

    async function openCrewDetail(crewId) {
        const detailEl = document.getElementById('crew-detail');
        if (!detailEl) return;
        const detail = await DB.getCrewDetail(crewId).catch(() => null);
        if (!detail) {
            Utils.toast('Failed to load crew detail', 'error');
            return;
        }
        detailEl.style.display = '';
        const isOwner = detail.my_role === 'owner';
        const members = Array.isArray(detail.members) ? detail.members : [];
        detailEl.innerHTML = `
            <div class="crew-detail-card">
                <button type="button" class="btn btn-ghost btn-sm" id="crew-detail-back">← Back</button>
                <h3>${escape(detail.name || 'Crew')}</h3>
                <p>${members.length} members · Invite code: <strong>${escape(detail.invite_code || '')}</strong></p>
                <p>${detail.stats?.total_ratings || 0} ratings · avg ${detail.stats?.avg_rating || 0}★</p>
                <div class="crew-members-list">
                    ${members.map((m) => `
                        <div class="crew-member-row">
                            <span>${m.role === 'owner' ? '👑' : '🍺'} ${escape(m.profile?.display_name || m.user_id)}</span>
                            <span>${m.rating_count || 0} ratings</span>
                            ${(isOwner && m.user_id !== DB.currentUser?.id) ? `<button type="button" class="btn btn-ghost btn-sm crew-remove-member-btn" data-crew-id="${escape(detail.id)}" data-user-id="${escape(m.user_id)}">Remove</button>` : ''}
                        </div>
                    `).join('')}
                </div>
                <div class="crew-detail-actions">
                    ${isOwner ? '<button type="button" class="btn btn-ghost btn-sm" id="crew-rename-btn">Rename</button>' : ''}
                    ${isOwner ? '<button type="button" class="btn btn-ghost btn-sm" id="crew-regenerate-btn">Regenerate Code</button>' : ''}
                    ${isOwner ? '<button type="button" class="btn btn-ghost btn-sm" id="crew-delete-btn">Delete Crew</button>' : ''}
                    <button type="button" class="btn btn-ghost btn-sm" id="crew-leave-btn">Leave Crew</button>
                </div>
            </div>
        `;

        document.getElementById('crew-detail-back')?.addEventListener('click', () => {
            detailEl.style.display = 'none';
        });
        document.getElementById('crew-leave-btn')?.addEventListener('click', async () => {
            await DB.removeCrewMember(detail.id, DB.currentUser.id).catch((e) => Utils.toast(e.message, 'error'));
            detailEl.style.display = 'none';
            await App.refreshSocialGraph();
            await refreshCrewsView();
            App.renderRecentReviews();
            App.renderBrowse();
            App.renderActivityFeed(App.activityItems || [], (App.activityPage || 1) * 10);
        });
        document.getElementById('crew-rename-btn')?.addEventListener('click', async () => {
            const name = window.prompt('New crew name', detail.name || '');
            if (!name) return;
            await DB.updateCrew(detail.id, name).catch((e) => Utils.toast(e.message, 'error'));
            await App.refreshSocialGraph();
            await refreshCrewsView();
            openCrewDetail(detail.id);
        });
        document.getElementById('crew-regenerate-btn')?.addEventListener('click', async () => {
            if (!window.confirm('Old invite code will stop working. Continue?')) return;
            const out = await DB.regenerateCrewCode(detail.id).catch((e) => ({ error: e.message }));
            if (out?.invite_code) Utils.toast(`New invite code: ${out.invite_code}`, 'success');
            openCrewDetail(detail.id);
        });
        document.getElementById('crew-delete-btn')?.addEventListener('click', async () => {
            if (!window.confirm('Delete this crew and remove all members?')) return;
            await DB.deleteCrew(detail.id).catch((e) => Utils.toast(e.message, 'error'));
            detailEl.style.display = 'none';
            await App.refreshSocialGraph();
            await refreshCrewsView();
        });
        detailEl.querySelectorAll('.crew-remove-member-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const userId = btn.getAttribute('data-user-id');
                if (!window.confirm('Remove this member?')) return;
                await DB.removeCrewMember(detail.id, userId).catch((e) => Utils.toast(e.message, 'error'));
                openCrewDetail(detail.id);
            });
        });
    }

    function wireCrewButtons() {
        document.getElementById('create-crew-btn')?.addEventListener('click', async () => {
            const name = window.prompt('Crew name (max 50 chars)');
            if (!name) return;
            const crew = await DB.createCrew(name).catch((e) => {
                Utils.toast(e.message || 'Create crew failed', 'error');
                return null;
            });
            if (!crew) return;
            Utils.toast(`Share this code: ${crew.invite_code}`, 'success');
            await App.refreshSocialGraph();
            await refreshCrewsView();
            populateLeaderboardCrewSelect();
        });
        document.getElementById('join-crew-btn')?.addEventListener('click', async () => {
            const code = window.prompt('Enter 6-character invite code');
            if (!code) return;
            const joined = await DB.joinCrew(code).catch((e) => {
                const msg = e?.message || 'Invalid invite code';
                Utils.toast(msg, 'error');
                return null;
            });
            if (!joined) return;
            Utils.toast('Joined crew!', 'success');
            await App.refreshSocialGraph();
            await refreshCrewsView();
            openCrewDetail(joined.id);
            populateLeaderboardCrewSelect();
        });
        document.getElementById('crews-list')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.crew-open-btn');
            if (!btn) return;
            openCrewDetail(btn.getAttribute('data-crew-id'));
        });
    }

    function handleJoinDeepLink() {
        const params = new URLSearchParams(window.location.search);
        const joinCode = (params.get('join') || '').trim().toUpperCase();
        if (joinCode) {
            sessionStorage.setItem('beerbook_pending_join_code', joinCode);
        }
    }

    async function consumePendingJoinCode() {
        const code = sessionStorage.getItem('beerbook_pending_join_code');
        if (!code || !DB.currentUser) return;
        const joined = await DB.joinCrew(code).catch(() => null);
        sessionStorage.removeItem('beerbook_pending_join_code');
        if (joined) {
            Utils.toast('Crew invite accepted', 'success');
            await App.refreshSocialGraph();
            await refreshCrewsView();
            openCrewDetail(joined.id);
        } else {
            Utils.toast('Invalid invite code', 'error');
        }
    }

    const _enterApp = App.enterApp.bind(App);
    App.enterApp = async function patchedEnterAppForCrews() {
        await _enterApp();
        ensureCrewTabInLeaderboard();
        populateLeaderboardCrewSelect();
        await refreshCrewsView();
        await consumePendingJoinCode();
    };

    const _navigate = App.navigate.bind(App);
    App.navigate = function patchedNavigate(viewId) {
        _navigate(viewId);
        if (viewId === 'crews') {
            refreshCrewsView();
        }
    };

    handleJoinDeepLink();
    wireCrewButtons();
})();
