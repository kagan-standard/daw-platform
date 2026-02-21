/* ============================================
   BeerBook — User profile modal (other users)
   Opens when clicking a username anywhere in the app.
   ============================================ */

const Profiles = {
    init() {
        document.getElementById('profile-modal-back')?.addEventListener('click', () => this.close());
        document.getElementById('profile-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'profile-modal') this.close();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.getElementById('profile-modal')?.style.display === 'flex') this.close();
        });
        document.getElementById('app')?.addEventListener('click', (e) => {
            const el = e.target.closest('[data-user-id]');
            if (!el || el.closest('#profile-modal')) return;
            e.preventDefault();
            const userId = el.getAttribute('data-user-id');
            const userName = el.getAttribute('data-user-name') || el.textContent?.trim() || 'User';
            if (userId) this.open(userId, userName);
        });
    },

    close() {
        const modal = document.getElementById('profile-modal');
        if (modal) modal.style.display = 'none';
        Charts.destroy('profileDist');
        Charts.destroy('profileStyle');
        Charts.destroy('profileMonthly');
        Charts.destroy('profileFlavor');
    },

    async open(userId, displayName) {
        const modal = document.getElementById('profile-modal');
        const body = document.getElementById('profile-modal-body');
        if (!modal || !body) return;
        modal.style.display = 'flex';
        body.innerHTML = '<div class="profile-modal-skeleton"><p>Loading profile…</p></div>';

        const isDemo = DB.isDemo;
        let profile = null;
        let stats = null;
        let recentRatings = [];
        let mapData = [];
        let portfolio = { ratings: [], total_portfolio_value: 0 };

        if (isDemo) {
            const ratings = (App.allRatings || []).filter((r) => r.user_id === userId);
            const first = ratings[0];
            profile = first ? { id: userId, display_name: first.user_name || displayName } : { id: userId, display_name: displayName };
            stats = this._deriveStats(ratings);
            recentRatings = ratings.slice(0, 10);
            mapData = ratings.filter((r) => r.latitude != null && r.longitude != null);
            portfolio = { ratings: ratings.filter((r) => r.yg_value != null).slice(0, 20), total_portfolio_value: ratings.reduce((s, r) => s + (Number(r.yg_value) || 0), 0) };
        } else {
            try {
                [profile, stats, recentRatings, mapData, portfolio] = await Promise.all([
                    DB.getUserProfile(userId).catch(() => null),
                    DB.getUserStats(userId).catch(() => null),
                    DB.getUserRatings(userId).then((list) => (list && list.slice) ? list.slice(0, 10) : []),
                    DB.getMapUser(userId).catch(() => []),
                    DB.getExchangePortfolio(userId).catch(() => ({ ratings: [], total_portfolio_value: 0 }))
                ]);
            } catch (err) {
                console.error('Profile load error:', err);
            }
            if (!profile && recentRatings.length) {
                profile = { id: userId, display_name: recentRatings[0].user_name || displayName };
            }
            if (!profile) profile = { id: userId, display_name: displayName };
            if (!stats && recentRatings.length) stats = this._deriveStats(recentRatings);
        }

        const name = (profile && profile.display_name) ? profile.display_name : displayName;
        const totalRatings = (stats && stats.total_ratings) != null ? stats.total_ratings : recentRatings.length;
        const totalStyles = (stats && stats.total_styles) != null ? stats.total_styles : new Set(recentRatings.map((r) => r.style)).size;
        const venueCount = new Set(mapData.map((r) => r.venue_id || r.location_name).filter(Boolean)).size;
        const avgRating = (stats && stats.avg_rating) != null ? stats.avg_rating : (recentRatings.length ? recentRatings.reduce((s, r) => s + (Number(r.rating) || 0), 0) / recentRatings.length : 0);
        const avgYg = (stats && stats.avg_yg_value) != null ? stats.avg_yg_value : 0;
        const totalYg = (stats && stats.total_yg_portfolio) != null ? stats.total_yg_portfolio : (portfolio.total_portfolio_value || 0);
        const favStyle = (stats && stats.most_rated_style) || (recentRatings.length ? Utils.countBy(recentRatings, 'style') : {});
        const favStyleName = typeof favStyle === 'string' ? favStyle : (Object.entries(favStyle || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || '—');
        const joinDate = (profile && profile.created_at) ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : null;
        const isOwn = userId === DB.currentUser?.id;
        const followStatus = !isOwn ? await DB.getFollowStatus(userId).catch(() => ({ is_following: false })) : { is_following: false };
        const followersOut = await DB.getFollowers(userId, 25, 0).catch(() => ({ data: [] }));
        const followingOut = await DB.getFollowing(userId, 25, 0).catch(() => ({ data: [] }));
        const followers = Array.isArray(followersOut?.data) ? followersOut.data : [];
        const following = Array.isArray(followingOut?.data) ? followingOut.data : [];
        const followerCount = Number(stats?.follower_count || followers.length || 0);
        const followingCount = Number(stats?.following_count || following.length || 0);
        const crewCount = Number(stats?.crew_count || 0);

        body.innerHTML = `
            <div class="profile-modal-inner">
                <div class="profile-modal-header">
                    <div class="profile-modal-avatar">${Utils.initials(name) || '🍺'}</div>
                    <div class="profile-modal-info">
                        <h2 id="profile-modal-title" class="profile-modal-name">${Utils.escapeHtml(name)}</h2>
                        ${joinDate ? `<p class="profile-modal-joined">Member since ${joinDate}</p>` : ''}
                        <p class="profile-modal-counts">${totalRatings} ratings · ${followerCount} followers · ${followingCount} following · ${crewCount} crews</p>
                        ${isOwn ? '' : `<button type="button" class="btn btn-ghost btn-sm follow-mini-btn ${followStatus.is_following ? 'is-following' : ''}" data-follow-user-id="${Utils.escapeHtml(userId)}">${followStatus.is_following ? 'Following' : 'Follow'}</button>`}
                    </div>
                </div>
                <div class="profile-stats-row">
                    <div class="profile-stat-box"><span class="profile-stat-num">${avgRating.toFixed(1)}</span><span class="profile-stat-label">Avg★</span></div>
                    <div class="profile-stat-box"><span class="profile-stat-num">${avgYg.toFixed(1)}</span><span class="profile-stat-label">Avg YG</span></div>
                    <div class="profile-stat-box"><span class="profile-stat-num">${totalYg.toFixed(1)}</span><span class="profile-stat-label">YG Tot</span></div>
                    <div class="profile-stat-box"><span class="profile-stat-num">${Utils.escapeHtml(favStyleName)}</span><span class="profile-stat-label">Fav</span></div>
                </div>
                ${(portfolio.ratings && portfolio.ratings.length) ? `
                <section class="profile-section">
                    <h3>📈 YG Portfolio</h3>
                    <ul class="profile-portfolio-list">
                        ${portfolio.ratings.slice(0, 10).map((r) => `
                            <li>${Utils.escapeHtml(r.beer_name || '')} ${Utils.stars(r.rating || 0)} ${Number(r.yg_value) || 0} YG</li>
                        `).join('')}
                    </ul>
                    <p class="profile-portfolio-total">Total: ${(portfolio.total_portfolio_value || 0).toFixed(1)} YGs</p>
                </section>
                ` : ''}
                ${recentRatings.length >= 3 ? `
                <div class="profile-charts-grid">
                    <div class="profile-chart-wrap"><canvas id="profile-chart-flavor"></canvas></div>
                    <div class="profile-chart-wrap"><canvas id="profile-chart-style"></canvas></div>
                    <div class="profile-chart-wrap"><canvas id="profile-chart-dist"></canvas></div>
                    <div class="profile-chart-wrap"><canvas id="profile-chart-monthly"></canvas></div>
                </div>
                ` : ''}
                ${mapData.length ? `
                <section class="profile-section">
                    <h3>🗺️ Beer Trail</h3>
                    <ul class="profile-trail-list">
                        ${mapData.slice(0, 15).map((r) => `<li>${Utils.escapeHtml(r.beer_name || '')} at ${Utils.escapeHtml(r.location_name || 'Unknown')}</li>`).join('')}
                    </ul>
                </section>
                ` : ''}
                <section class="profile-section">
                    <h3>Recent Ratings</h3>
                    <div id="profile-recent-ratings" class="profile-recent-ratings"></div>
                </section>
                <section class="profile-section">
                    <h3>Following</h3>
                    <div class="profile-recent-ratings">
                        ${following.length ? following.map((u) => `<div class="profile-rating-card"><span>${Utils.escapeHtml(u.display_name || 'Beer Lover')}</span></div>`).join('') : '<p class="empty-state">Not following anyone yet.</p>'}
                    </div>
                </section>
                <section class="profile-section">
                    <h3>Followers</h3>
                    <div class="profile-recent-ratings">
                        ${followers.length ? followers.map((u) => `<div class="profile-rating-card"><span>${Utils.escapeHtml(u.display_name || 'Beer Lover')}</span></div>`).join('') : '<p class="empty-state">No followers yet.</p>'}
                    </div>
                </section>
            </div>
        `;

        const recentContainer = document.getElementById('profile-recent-ratings');
        if (recentContainer) {
            recentContainer.innerHTML = recentRatings.length
                ? recentRatings.map((r) => `
                    <div class="profile-rating-card">
                        <span class="profile-rating-beer">${Utils.escapeHtml(r.beer_name)}</span>
                        <span class="profile-rating-stars">${Utils.stars(r.rating || 0)}</span>
                        ${r.yg_value != null ? `<span class="profile-rating-yg">${r.yg_value} YG</span>` : ''}
                        <span class="profile-rating-meta">${Utils.timeAgo(r.created_at)}</span>
                    </div>
                `).join('')
                : '<p class="empty-state">No ratings yet.</p>';
        }

        if (recentRatings.length >= 3) {
            setTimeout(() => {
                Charts.renderProfileFlavorRadar(recentRatings, 'profile-chart-flavor');
                Charts.renderProfileStyleDoughnut(recentRatings, 'profile-chart-style');
                Charts.renderProfileDistribution(recentRatings, 'profile-chart-dist');
                Charts.renderProfileMonthly(recentRatings, 'profile-chart-monthly');
            }, 50);
        }
    },

    _deriveStats(ratings) {
        if (!ratings || !ratings.length) return { total_ratings: 0, total_styles: 0, avg_rating: 0, avg_yg_value: 0, total_yg_portfolio: 0, most_rated_style: null };
        const totalRatings = ratings.length;
        const styles = new Set(ratings.map((r) => r.style));
        const avgRating = ratings.reduce((s, r) => s + (Number(r.rating) || 0), 0) / totalRatings;
        const withYg = ratings.filter((r) => r.yg_value != null);
        const avgYg = withYg.length ? withYg.reduce((s, r) => s + (Number(r.yg_value) || 0), 0) / withYg.length : 0;
        const totalYg = withYg.reduce((s, r) => s + (Number(r.yg_value) || 0), 0);
        const styleCounts = Utils.countBy(ratings, 'style');
        const mostRated = Object.entries(styleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
        return {
            total_ratings: totalRatings,
            total_styles: styles.size,
            avg_rating: Math.round(avgRating * 100) / 100,
            avg_yg_value: Math.round(avgYg * 100) / 100,
            total_yg_portfolio: Math.round(totalYg * 100) / 100,
            most_rated_style: mostRated
        };
    }
};

document.addEventListener('DOMContentLoaded', () => Profiles.init());
