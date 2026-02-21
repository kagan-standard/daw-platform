(function () {
    if (typeof App === 'undefined' || typeof DB === 'undefined') return;

    App.socialGraph = {
        crewMemberIds: new Set(),
        followingIds: new Set(),
        myCrews: [],
        selectedCrewId: null,
        activeFeedFilter: 'all'
    };

    App.refreshSocialGraph = async function refreshSocialGraph() {
        if (!DB.currentUser) return this.socialGraph;
        try {
            const [crewsOut, followingOut] = await Promise.all([
                DB.getCrews().catch(() => ({ data: [] })),
                DB.getFollowing(DB.currentUser.id, 500, 0).catch(() => ({ data: [] }))
            ]);
            const crews = Array.isArray(crewsOut?.data) ? crewsOut.data : [];
            const following = Array.isArray(followingOut?.data) ? followingOut.data : [];
            const crewMemberIds = new Set();
            crews.forEach((crew) => {
                const ids = Array.isArray(crew.member_user_ids) ? crew.member_user_ids : [];
                ids.forEach((id) => crewMemberIds.add(id));
            });
            this.socialGraph.myCrews = crews;
            this.socialGraph.crewMemberIds = crewMemberIds;
            this.socialGraph.followingIds = new Set(following.map((u) => u.id).filter(Boolean));
            if (!this.socialGraph.selectedCrewId && crews[0]) {
                this.socialGraph.selectedCrewId = crews[0].id;
            }
        } catch (err) {
            console.warn('Failed to refresh social graph:', err?.message || err);
        }
        return this.socialGraph;
    };

    App.getSocialTier = function getSocialTier(userId) {
        const me = DB.currentUser?.id;
        if (!userId || userId === me) return 'global';
        if (this.socialGraph.crewMemberIds.has(userId)) return 'crew';
        if (this.socialGraph.followingIds.has(userId)) return 'following';
        return 'global';
    };

    App.getSelectedCrewMemberSet = function getSelectedCrewMemberSet() {
        const selectedId = this.socialGraph.selectedCrewId;
        const crew = this.socialGraph.myCrews.find((c) => c.id === selectedId);
        return new Set(Array.isArray(crew?.member_user_ids) ? crew.member_user_ids : []);
    };

    App.applyFeedPrioritization = function applyFeedPrioritization(items, getUserId) {
        const feed = this.socialGraph.activeFeedFilter || 'all';
        const crewSet = this.getSelectedCrewMemberSet();
        let list = Array.isArray(items) ? [...items] : [];
        if (feed === 'crew') {
            list = list.filter((x) => crewSet.has(getUserId(x)));
        } else if (feed === 'following') {
            list = list.filter((x) => this.socialGraph.followingIds.has(getUserId(x)));
        }
        list.sort((a, b) => {
            const tierRank = { crew: 0, following: 1, global: 2 };
            const ta = this.getSocialTier(getUserId(a));
            const tb = this.getSocialTier(getUserId(b));
            if (tierRank[ta] !== tierRank[tb]) return tierRank[ta] - tierRank[tb];
            return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        });
        return list;
    };

    App.decorateSocialCards = function decorateSocialCards() {
        const cards = document.querySelectorAll('.review-card, .beer-card, .activity-item');
        cards.forEach((card) => {
            const userId = card.getAttribute('data-user-id');
            card.classList.remove('review-card--crew', 'review-card--following');
            const tier = this.getSocialTier(userId);
            if (tier === 'crew') card.classList.add('review-card--crew');
            if (tier === 'following') card.classList.add('review-card--following');
            if (!userId || userId === DB.currentUser?.id) return;
            if (card.querySelector('.follow-mini-btn')) return;
            const following = this.socialGraph.followingIds.has(userId);
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `follow-mini-btn ${following ? 'is-following' : ''}`;
            btn.setAttribute('data-follow-user-id', userId);
            btn.textContent = following ? 'Following' : 'Follow';
            const target = card.querySelector('.review-actions, .activity-meta, .beer-card-footer');
            if (target) target.appendChild(btn);
        });
    };

    App.renderFeedFilters = function renderFeedFilters() {
        const mountPoints = [
            { parent: document.querySelector('.activity-feed-section'), id: 'activity-feed-filters' },
            { parent: document.getElementById('view-browse'), id: 'browse-feed-filters' }
        ];
        mountPoints.forEach(({ parent, id }) => {
            if (!parent || parent.querySelector(`#${id}`)) return;
            const el = document.createElement('div');
            el.id = id;
            el.className = 'social-feed-filters';
            el.innerHTML = `
                <button type="button" class="social-feed-tab active" data-feed="all">All</button>
                <button type="button" class="social-feed-tab" data-feed="crew">Crew</button>
                <button type="button" class="social-feed-tab" data-feed="following">Following</button>
                <select class="filter-select social-crew-select" style="display:none;"></select>
            `;
            parent.insertBefore(el, parent.firstChild.nextSibling);
        });
        this.refreshCrewSelectors();
    };

    App.refreshCrewSelectors = function refreshCrewSelectors() {
        document.querySelectorAll('.social-crew-select').forEach((select) => {
            const crews = this.socialGraph.myCrews || [];
            select.innerHTML = crews.length
                ? crews.map((c) => `<option value="${Utils.escapeHtml(c.id)}">${Utils.escapeHtml(c.name || 'Crew')}</option>`).join('')
                : '<option value="">No crews</option>';
            if (this.socialGraph.selectedCrewId) select.value = this.socialGraph.selectedCrewId;
            select.style.display = (this.socialGraph.activeFeedFilter === 'crew' && crews.length > 1) ? '' : 'none';
        });
    };

    const _renderRecentReviews = App.renderRecentReviews.bind(App);
    App.renderRecentReviews = function patchedRenderRecentReviews() {
        this.allRatings = this.applyFeedPrioritization(this.allRatings, (r) => r.user_id);
        _renderRecentReviews();
        this.decorateSocialCards();
    };

    const _renderCommunityBrowse = App.renderCommunityBrowse.bind(App);
    App.renderCommunityBrowse = function patchedRenderCommunityBrowse() {
        this.allRatings = this.applyFeedPrioritization(this.allRatings, (r) => r.user_id);
        _renderCommunityBrowse();
        this.decorateSocialCards();
    };

    const _renderActivityFeed = App.renderActivityFeed.bind(App);
    App.renderActivityFeed = function patchedRenderActivityFeed(items, showCount = 10) {
        const ratingItems = (items || []).filter((i) => i.type === 'rating');
        const venueItems = (items || []).filter((i) => i.type === 'venue');
        const ranked = this.applyFeedPrioritization(ratingItems, (r) => r.user_id).concat(venueItems);
        _renderActivityFeed(ranked, showCount);
        this.decorateSocialCards();
    };

    const _renderProfile = App.renderProfile.bind(App);
    App.renderProfile = async function patchedRenderProfile() {
        await _renderProfile();
        const me = DB.currentUser?.id;
        if (!me) return;
        const stats = await DB.getUserStats(me).catch(() => null);
        const header = document.querySelector('.profile-badges');
        if (header && stats) {
            let social = document.getElementById('profile-social-counts');
            if (!social) {
                social = document.createElement('span');
                social.className = 'badge';
                social.id = 'profile-social-counts';
                header.appendChild(social);
            }
            social.textContent = `${stats.follower_count || 0} followers · ${stats.following_count || 0} following · ${stats.crew_count || 0} crews`;
        }
    };

    document.addEventListener('click', async (e) => {
        const followBtn = e.target.closest('.follow-mini-btn');
        if (followBtn) {
            e.preventDefault();
            const userId = followBtn.getAttribute('data-follow-user-id');
            if (!userId) return;
            try {
                const out = await DB.toggleFollow(userId);
                followBtn.classList.toggle('is-following', !!out.following);
                followBtn.textContent = out.following ? 'Following' : 'Follow';
                await App.refreshSocialGraph();
                App.decorateSocialCards();
                if (typeof App.loadAllData === 'function') App.loadAllData();
            } catch (err) {
                Utils.toast(err?.message || 'Follow failed', 'error');
            }
            return;
        }
        const feedTab = e.target.closest('.social-feed-tab');
        if (feedTab) {
            document.querySelectorAll('.social-feed-tab').forEach((t) => t.classList.remove('active'));
            document.querySelectorAll(`.social-feed-tab[data-feed="${feedTab.dataset.feed}"]`).forEach((t) => t.classList.add('active'));
            App.socialGraph.activeFeedFilter = feedTab.dataset.feed || 'all';
            App.refreshCrewSelectors();
            App.renderRecentReviews();
            App.renderBrowse();
            App.renderActivityFeed(App.activityItems || [], (App.activityPage || 1) * 10);
            return;
        }
    });

    document.addEventListener('change', (e) => {
        const select = e.target.closest('.social-crew-select');
        if (!select) return;
        App.socialGraph.selectedCrewId = select.value || null;
        App.renderRecentReviews();
        App.renderBrowse();
        App.renderActivityFeed(App.activityItems || [], (App.activityPage || 1) * 10);
    });

    window.addEventListener('focus', () => {
        App.refreshSocialGraph().then(() => {
            App.decorateSocialCards();
            App.refreshCrewSelectors();
        });
    });

    const _enterApp = App.enterApp.bind(App);
    App.enterApp = async function patchedEnterApp() {
        await _enterApp();
        await this.refreshSocialGraph();
        this.renderFeedFilters();
        this.refreshCrewSelectors();
        this.decorateSocialCards();
    };
})();
