/* ============================================
   BeerBook — Main Application (Keycloak SSO)
   ============================================ */

const CHEERS_LIST = [
    { word: "Cheers", lang: "English" },
    { word: "Prost", lang: "German" },
    { word: "Salud", lang: "Spanish" },
    { word: "Santé", lang: "French" },
    { word: "Cin cin", lang: "Italian" },
    { word: "Skål", lang: "Swedish" },
    { word: "Saúde", lang: "Portuguese" },
    { word: "Na zdraví", lang: "Czech" },
    { word: "Kampai", lang: "Japanese" },
    { word: "Gānbēi", lang: "Mandarin Chinese" },
    { word: "건배", lang: "Korean" },
    { word: "За здоровье", lang: "Russian" },
    { word: "Budmo", lang: "Ukrainian" },
    { word: "Na zdrowie", lang: "Polish" },
    { word: "Egészségedre", lang: "Hungarian" },
    { word: "Şerefe", lang: "Turkish" },
    { word: "يحسلا", lang: "Arabic" },
    { word: "Mabuhay", lang: "Filipino" },
    { word: "Chúc sức khỏe", lang: "Vietnamese" },
    { word: "ชนแก้ว", lang: "Thai" },
    { word: "Chok dee", lang: "Thai (informal)" },
    { word: "Sláinte", lang: "Irish Gaelic" },
    { word: "Iechyd da", lang: "Welsh" },
    { word: "Tagay", lang: "Cebuano" },
    { word: "Fenékig", lang: "Hungarian (informal)" },
    { word: "Noroc", lang: "Romanian" },
    { word: "Živjeli", lang: "Croatian" },
    { word: "Nazdravlje", lang: "Serbian" },
    { word: "Наздраве", lang: "Bulgarian" },
    { word: "Terviseks", lang: "Estonian" },
    { word: "Priekā", lang: "Latvian" },
    { word: "Į sveikatą", lang: "Lithuanian" },
    { word: "Kippis", lang: "Finnish" },
    { word: "Skál", lang: "Icelandic" },
    { word: "Skál", lang: "Faroese" },
    { word: "Skål", lang: "Danish" },
    { word: "Skål", lang: "Norwegian" },
    { word: "Proost", lang: "Dutch" },
    { word: "Op uw gezondheid", lang: "Flemish" },
    { word: "Zum Wohl", lang: "Austrian German" },
    { word: "Gesondheid", lang: "Afrikaans" },
    { word: "Maisha marefu", lang: "Swahili" },
    { word: "Oogy wawa", lang: "Zulu" },
    { word: "Viva", lang: "Cape Verdean" },
    { word: "Txin txin", lang: "Basque" },
    { word: "Salut", lang: "Catalan" },
    { word: "Saude", lang: "Galician" },
    { word: "Υγεία", lang: "Greek" },
    { word: "לחיים", lang: "Hebrew" },
    { word: "Sawasdi", lang: "Lao" },
    { word: "Tā moko", lang: "Māori" },
    { word: "Okole maluna", lang: "Hawaiian" },
    { word: "Serefe", lang: "Kurdish" },
    { word: "Nuostabiai", lang: "Samoan" },
    { word: "Chimo", lang: "Inuit" },
    { word: "Biba", lang: "Papiamento" },
    { word: "Saluti", lang: "Corsican" },
    { word: "Arriba", lang: "Mexican Spanish (informal)" },
    { word: "Tim tim", lang: "Brazilian Portuguese" },
    { word: "Ura", lang: "Fijian" },
    { word: "Topa", lang: "Quechua" },
    { word: "Asikhulume", lang: "Xhosa" },
    { word: "Nkemcho", lang: "Igbo" },
    { word: "A wo nkwa", lang: "Akan" },
    { word: "Ogeni", lang: "Yoruba" },
    { word: "Bismillah", lang: "Hausa" },
    { word: "Fee sahtik", lang: "Lebanese Arabic" },
    { word: "Sherefe", lang: "Persian" },
    { word: "Salamati", lang: "Dari" },
    { word: "Tanshin", lang: "Mongolian" },
    { word: "Gom bui", lang: "Cantonese" },
    { word: "Ho̍k", lang: "Hokkien" },
    { word: "Manuia", lang: "Tongan" },
    { word: "Hauoli", lang: "Hawaiian (informal)" },
    { word: "Salute", lang: "Maltese" },
    { word: "Evviva", lang: "Sardinian" },
    { word: "Nā mua", lang: "Tahitian" },
    { word: "Chahiya", lang: "Nepali" },
    { word: "Subha kamana", lang: "Hindi" },
    { word: "Jai", lang: "Punjabi" },
    { word: "Cheeria", lang: "Sinhalese" },
    { word: "ဝမ်းသာပါ", lang: "Burmese" },
    { word: "សុខភាព", lang: "Khmer" },
    { word: "Sokhphiep", lang: "Khmer (romanized)" },
    { word: "Caipi", lang: "Guaraní" },
    { word: "Bersulang", lang: "Malay" },
    { word: "Sulang", lang: "Indonesian (informal)" },
    { word: "Mālama", lang: "Samoan" },
    { word: "Yam seng", lang: "Singaporean" },
    { word: "Tagay", lang: "Ilocano" },
    { word: "乾杯", lang: "Japanese (kanji)" },
    { word: "干杯", lang: "Chinese (simplified)" },
    { word: "Trăiască", lang: "Romanian (celebratory)" },
    { word: "Ahoj", lang: "Slovak" },
    { word: "Na zdravje", lang: "Slovenian" },
    { word: "Gëzuar", lang: "Albanian" },
    { word: "Gaudeamus", lang: "Latin" },
    { word: "Salus", lang: "Latin (classical)" },
];

function getRandomCheers() {
    let stored = sessionStorage.getItem('beerbook_cheers');
    if (stored) {
        return JSON.parse(stored);
    }
    const pick = CHEERS_LIST[Math.floor(Math.random() * CHEERS_LIST.length)];
    sessionStorage.setItem('beerbook_cheers', JSON.stringify(pick));
    return pick;
}

const STYLE_GUIDE = {
    'IPA': { desc: 'American-style India Pale Ale, hop-forward with citrus and pine.', abv: '5.5–7.5%' },
    'Double IPA': { desc: 'Stronger, more intense IPA with bold hop character.', abv: '7.5–10%' },
    'DIPA': { desc: 'Double IPA — bigger body and bitterness.', abv: '7.5–10%' },
    'Hazy IPA': { desc: 'Unfiltered, juicy IPA with low bitterness.', abv: '6–7%' },
    'NEIPA': { desc: 'New England IPA — hazy, soft, fruity.', abv: '6–7%' },
    'Pale Ale': { desc: 'Balanced ale with moderate hop and malt.', abv: '4.5–5.5%' },
    'Stout': { desc: 'Dark, roasty ale with coffee and chocolate notes.', abv: '4–6%' },
    'Imperial Stout': { desc: 'Strong, full-bodied dark ale.', abv: '8–12%' },
    'Porter': { desc: 'Dark malt-forward ale, less roasty than stout.', abv: '4.5–6%' },
    'Pilsner': { desc: 'Crisp, clean lager with subtle hop bitterness.', abv: '4.5–5.5%' },
    'Lager': { desc: 'Bottom-fermented, clean and refreshing.', abv: '4–5%' },
    'Wheat Beer': { desc: 'Light, often cloudy, with bready and fruity notes.', abv: '4–5.5%' },
    'Belgian': { desc: 'Yeast-driven, often fruity and spicy.', abv: '5–9%' },
    'Saison': { desc: 'Farmhouse-style, dry and refreshing.', abv: '5–7%' },
    'Sour': { desc: 'Tart, acidic beer styles.', abv: '4–6%' },
    'Amber Ale': { desc: 'Malty, caramel-forward American ale.', abv: '4.5–5.5%' },
    'Brown Ale': { desc: 'Nutty, toasty malt character.', abv: '4–5.5%' },
    'Red Ale': { desc: 'Copper-red, balanced malt and hops.', abv: '4.5–5.5%' },
    'Barleywine': { desc: 'Strong, sipping ale with rich malt.', abv: '8–12%' },
    'Kölsch': { desc: 'Crisp, clean hybrid ale from Cologne.', abv: '4.5–5%' },
    'Hefeweizen': { desc: 'German wheat beer with banana and clove.', abv: '4.5–5.5%' },
    'Bock': { desc: 'Strong German lager, malty and smooth.', abv: '6–7%' },
    'Gose': { desc: 'Tart, slightly salty German wheat beer.', abv: '4–5%' },
    'Other': { desc: 'Other or unspecified beer style.', abv: '—' }
};

const Tracking = {
    getSessionId() {
        try {
            let id = sessionStorage.getItem('bb_session_id');
            if (!id) {
                id = (crypto && typeof crypto.randomUUID === 'function') ? crypto.randomUUID() : Utils.uid();
                sessionStorage.setItem('bb_session_id', id);
            }
            return id;
        } catch (_) {
            return Utils.uid();
        }
    },

    _send(path, payload) {
        try {
            const apiBase = (window.BEERBOOK_CONFIG?.apiBaseUrl || '').replace(/\/+$/, '');
            if (!apiBase || !navigator.sendBeacon) return;
            const body = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            navigator.sendBeacon(`${apiBase}${path}`, body);
        } catch (_) {
            // Tracking must never block UX.
        }
    },

    trackClick({ targetType, targetId, targetName, destinationUrl, sourcePage, sourceBeerId, sourceBreweryId }) {
        this._send('/api/track/click', {
            target_type: targetType,
            target_id: targetId || null,
            target_name: targetName || null,
            destination_url: destinationUrl,
            source_page: sourcePage || window.location.pathname,
            source_beer_id: sourceBeerId || null,
            source_brewery_id: sourceBreweryId || null,
            referrer_path: window.location.pathname,
        });
    },

    trackPageView(pagePath) {
        this._send('/api/track/pageview', {
            page_path: pagePath || window.location.pathname,
            session_id: this.getSessionId(),
            referrer_url: document.referrer || null,
        });
    }
};

const App = {
    currentView: 'dashboard',
    isAdmin: false,
    adminState: { usersSort: 'last_active', usersSearchDebounce: null, activeTab: 'users' },
    allRatings: [],
    cheersCache: {},
    _demoCheersKey: 'beerbook_demo_cheers',
    _loadAllDataDebounceTimer: null,
    browseTab: 'community',
    catalogItems: [],
    catalogTotal: 0,
    catalogLimit: 30,
    catalogOffset: 0,
    catalogLoading: false,
    catalogHasMore: false,
    catalogStyles: [],
    catalogExpandedId: null,
    _browseStyleFilter: '',
    _browseSortBy: 'recent',
    _browseFiltersInitialized: false,
    _pendingPhotoFile: null,
    _pendingPhotoPreviewUrl: null,

    toast(message, type = 'info') {
        Utils.toast(message, type, 3000);
    },

    // ========== INIT ==========
    async init() {
        // #region agent log
        fetch('http://127.0.0.1:7669/ingest/dcf85816-3d9a-4023-99e0-099b9beddd82',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'7a1905'},body:JSON.stringify({sessionId:'7a1905',runId:'run2',hypothesisId:'H1',location:'app.js:init',message:'instrumented build loaded',data:{origin:window.location.origin,href:window.location.href},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        Charts.init();
        await DB.init();
        Tracking.trackPageView(window.location.pathname || '/');

        // Show config screen if not configured and not demo
        if (!DB.hasConfig()) {
            document.getElementById('setup-config').style.display = 'block';
            document.getElementById('login-card').style.display = 'none';
        }

        // Check session (handles OIDC callback too)
        const user = await DB.getSession();
        if (user) {
            this.enterApp();
        }

        this.bindEvents();
        this.setupInfiniteScroll();
        this.bindStyleTooltip();
        this.bindKeyboardShortcuts();
    },

    bindKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            const tag = document.activeElement?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

            switch (e.key) {
                case 'n':
                case 'N':
                    e.preventDefault();
                    this.navigate('rate');
                    break;
                case 'Escape':
                    e.preventDefault();
                    if (document.getElementById('beer-detail-modal')?.style.display === 'flex') {
                        this.closeBeerDetail();
                    } else if (document.getElementById('venue-modal')?.style.display === 'flex') {
                        typeof Venues !== 'undefined' && Venues.close && Venues.close();
                    } else if (document.getElementById('delete-modal')?.style.display === 'flex') {
                        this.closeDeleteModal();
                    } else if (document.getElementById('shortcuts-modal')?.style.display === 'flex') {
                        document.getElementById('shortcuts-modal').style.display = 'none';
                    } else if (this._previousView) {
                        this.navigate(this._previousView);
                    }
                    break;
                case '/':
                    e.preventDefault();
                    this.navigate('browse');
                    setTimeout(() => document.getElementById('search-input')?.focus(), 100);
                    break;
                case 'm':
                case 'M':
                    e.preventDefault();
                    this.navigate('map');
                    break;
                case 'e':
                case 'E':
                    e.preventDefault();
                    this.navigate('exchange');
                    break;
                case 'b':
                case 'B':
                    e.preventDefault();
                    this.navigate('browse');
                    break;
                case 'd':
                case 'D':
                    e.preventDefault();
                    this.navigate('dashboard');
                    break;
                case 'l':
                case 'L':
                    e.preventDefault();
                    this.navigate('leaderboard');
                    break;
                case '?':
                    e.preventDefault();
                    const sm = document.getElementById('shortcuts-modal');
                    if (sm) sm.style.display = sm.style.display === 'flex' ? 'none' : 'flex';
                    break;
                default:
                    break;
            }
        });
        document.getElementById('shortcuts-modal-close')?.addEventListener('click', () => {
            document.getElementById('shortcuts-modal').style.display = 'none';
        });
        document.getElementById('shortcuts-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'shortcuts-modal') e.target.style.display = 'none';
        });
    },

    bindStyleTooltip() {
        const popup = document.getElementById('style-tooltip');
        let hideTimer = null;
        let showTimer = null;
        const show = (el) => {
            const style = el?.dataset?.style;
            if (!style || !popup) return;
            const guide = STYLE_GUIDE[style] || { desc: 'Beer style.', abv: '—' };
            popup.innerHTML = `<strong>${Utils.escapeHtml(style)}</strong><br>${Utils.escapeHtml(guide.desc)}<br>ABV: ${Utils.escapeHtml(guide.abv)}`;
            popup.setAttribute('aria-hidden', 'false');
            popup.classList.add('visible');
            const rect = el.getBoundingClientRect();
            popup.style.left = `${rect.left + rect.width / 2}px`;
            popup.style.top = `${rect.top}px`;
            popup.style.transform = 'translate(-50%, -100%) translateY(-8px)';
        };
        const hide = () => {
            if (hideTimer) clearTimeout(hideTimer);
            if (showTimer) clearTimeout(showTimer);
            showTimer = null;
            hideTimer = null;
            if (popup) {
                popup.classList.remove('visible');
                popup.setAttribute('aria-hidden', 'true');
            }
        };
        document.body.addEventListener('mouseenter', (e) => {
            const el = e.target.closest('.style-tooltip[data-style]');
            if (!el) return;
            if (showTimer) clearTimeout(showTimer);
            showTimer = setTimeout(() => show(el), 200);
        }, true);
        document.body.addEventListener('mouseleave', (e) => {
            const el = e.target.closest('.style-tooltip[data-style]');
            const left = e.relatedTarget?.closest?.('.style-tooltip[data-style], #style-tooltip');
            if (el && !left) {
                if (hideTimer) clearTimeout(hideTimer);
                hideTimer = setTimeout(hide, 100);
            }
        }, true);
        document.body.addEventListener('mouseenter', (e) => {
            if (e.target.id === 'style-tooltip' || e.target.closest('#style-tooltip')) {
                if (hideTimer) clearTimeout(hideTimer);
                hideTimer = null;
            }
        }, true);
        document.body.addEventListener('mouseleave', (e) => {
            if (e.target.id === 'style-tooltip' || e.target.closest('#style-tooltip')) {
                const to = e.relatedTarget?.closest?.('.style-tooltip[data-style], #style-tooltip');
                if (!to) hide();
            }
        }, true);
        document.addEventListener('click', () => hide());
    },

    setupInfiniteScroll() {
        this.browseShownCount = 24;
        const browseSentinel = document.getElementById('browse-sentinel');
        const activitySentinel = document.getElementById('activity-sentinel');
        if (browseSentinel) {
            const browseObs = new IntersectionObserver((entries) => {
                if (!entries[0]?.isIntersecting) return;
                if (this.browseTab === 'catalog') {
                    if (this.catalogLoading || !this.catalogHasMore) return;
                    this.loadNextCatalogPage();
                    return;
                }
                const total = this._browseFilteredLength ?? 0;
                if ((this.browseShownCount || 24) >= total) return;
                this.browseShownCount = (this.browseShownCount || 24) + 24;
                this.renderBrowse();
            }, { rootMargin: '100px', threshold: 0 });
            browseObs.observe(browseSentinel);
            this._browseObserver = browseObs;
        }
        if (activitySentinel) {
            const activityObs = new IntersectionObserver((entries) => {
                if (!entries[0]?.isIntersecting) return;
                const items = this.activityItems || [];
                const showCount = (this.activityPage || 1) * 10;
                if (items.length <= showCount) return;
                this.loadMoreActivity();
            }, { rootMargin: '100px', threshold: 0 });
            activityObs.observe(activitySentinel);
            this._activityObserver = activityObs;
        }
    },

    // ========== EVENT BINDING ==========
    bindEvents() {
        // Config form
        document.getElementById('config-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const kcAuthority = document.getElementById('kc-authority').value.trim();
            const kcClientId = document.getElementById('kc-client-id').value.trim() || 'beerbook';

            if (!kcAuthority) {
                App.toast('Keycloak Realm URL is required', 'error');
                return;
            }

            DB.saveConfig(null, null, kcAuthority, kcClientId);
            await DB.init();

            document.getElementById('setup-config').style.display = 'none';
            document.getElementById('login-card').style.display = 'block';
            App.toast('Configuration saved!', 'success');
        });

        document.getElementById('skip-config')?.addEventListener('click', () => {
            DB.isDemo = true;
            document.getElementById('setup-config').style.display = 'none';
            document.getElementById('login-card').style.display = 'block';
        });

        document.getElementById('show-config')?.addEventListener('click', () => {
            document.getElementById('login-card').style.display = 'none';
            document.getElementById('setup-config').style.display = 'block';
        });

        // SSO buttons
        document.getElementById('sso-login')?.addEventListener('click', () => {
            DB.startLogin();
        });

        document.getElementById('sso-register')?.addEventListener('click', () => {
            DB.startRegistration();
        });

        // Demo login
        document.getElementById('demo-login')?.addEventListener('click', () => {
            DB.enterDemoMode();
            App.toast('Welcome to Demo Mode! Data saved locally.', 'info');
            this.enterApp();
        });

        // Logout
        document.getElementById('logout-btn')?.addEventListener('click', async () => {
            await DB.signOut();
            // If signOut didn't redirect (demo mode), show auth screen
            document.getElementById('app').style.display = 'none';
            document.getElementById('auth-screen').style.display = 'flex';
        });

        // Navigation
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => this.navigate(btn.dataset.view));
        });
        // Bottom tab nav (mobile)
        document.querySelectorAll('#bottom-tab-nav .tab-item').forEach(tab => {
            tab.addEventListener('click', () => this.navigate(tab.dataset.view));
        });
        // Desktop nav (desktop)
        document.querySelectorAll('.desktop-nav-link[data-view]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigate(link.dataset.view);
            });
        });

        // Track outbound external link clicks without blocking navigation.
        document.body.addEventListener('click', (e) => {
            const link = e.target.closest('a[href]');
            if (!link) return;
            const href = link.getAttribute('href') || '';
            if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
            let absolute;
            try {
                absolute = new URL(link.href, window.location.href);
            } catch (_) {
                return;
            }
            if (absolute.origin === window.location.origin) return;
            Tracking.trackClick({
                targetType: link.dataset.trackType || 'external',
                targetId: link.dataset.trackId || null,
                targetName: (link.dataset.trackName || link.textContent || '').trim() || null,
                destinationUrl: absolute.toString(),
                sourcePage: link.dataset.trackSource || this.currentView || window.location.pathname,
                sourceBeerId: link.dataset.trackBeerId || null,
                sourceBreweryId: link.dataset.trackBreweryId || null
            });
        });

        // Dashboard chart cards: accordion (one expanded at a time), lazy render on expand
        document.getElementById('dashboard-charts')?.addEventListener('click', (e) => {
            const card = e.target.closest('.chart-card');
            if (!card || card.classList.contains('chart-card--empty')) return;
            e.preventDefault();
            const chartId = card.dataset.chartId;
            if (!chartId) return;
            const wasExpanded = card.classList.contains('expanded');
            document.querySelectorAll('#dashboard-charts .chart-card.expanded').forEach(c => c.classList.remove('expanded'));
            if (!wasExpanded) {
                card.classList.add('expanded');
                Charts.renderChartIfNeeded(chartId, this.allRatings || []);
                setTimeout(() => { Charts.instances[chartId]?.resize(); }, 350);
            }
        });

        // Beer detail: delegate clicks on beer-name links
        document.body.addEventListener('click', (e) => {
            const link = e.target.closest('[data-beer-name]');
            if (link) {
                e.preventDefault();
                this.openBeerDetail(link.dataset.beerName, link.dataset.beerBrewery || '', link.dataset.beerStyle || '', link.dataset.beerId || null);
            }
        });
        document.getElementById('beer-detail-back')?.addEventListener('click', () => this.closeBeerDetail());

        // Cheers button delegation (for activity feed, browse, etc.)
        document.body.addEventListener('click', async (e) => {
            // Check if click is on cheers button or its children
            const btn = e.target.closest('.cheers-btn');
            if (!btn) return;
            
            // Verify it has the rating-id attribute
            const ratingId = btn.getAttribute('data-rating-id') || btn.dataset.ratingId;
            if (!ratingId) {
                console.warn('Cheers button clicked but no rating-id found', btn);
                return;
            }
            
            e.preventDefault();
            e.stopPropagation();
            
            await this.handleCheersClick(btn, ratingId);
        });

        // Hamburger menu (compact dropdown, icon swap)
        const menuToggle = document.getElementById('menu-toggle');
        const menuDropdown = document.getElementById('hamburger-menu');
        const hamIcon = menuToggle?.querySelector('.hamburger-icon');
        const closeIcon = menuToggle?.querySelector('.close-icon');
        if (menuToggle && menuDropdown) {
            menuToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = menuDropdown.style.display !== 'none';
                menuDropdown.style.display = isOpen ? 'none' : 'block';
                menuDropdown.setAttribute('aria-hidden', isOpen ? 'true' : 'false');
                if (hamIcon) hamIcon.style.display = isOpen ? '' : 'none';
                if (closeIcon) closeIcon.style.display = isOpen ? 'none' : '';
                menuToggle.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
            });
        }
        document.addEventListener('click', (e) => {
            if (menuToggle && menuDropdown && !menuToggle.contains(e.target) && !menuDropdown.contains(e.target)) {
                menuDropdown.style.display = 'none';
                menuDropdown.setAttribute('aria-hidden', 'true');
                if (hamIcon) hamIcon.style.display = '';
                if (closeIcon) closeIcon.style.display = 'none';
                if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
            }
        });
        document.querySelectorAll('.ham-link[data-view]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                menuDropdown.style.display = 'none';
                if (hamIcon) hamIcon.style.display = '';
                if (closeIcon) closeIcon.style.display = 'none';
                if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
                menuDropdown.setAttribute('aria-hidden', 'true');
                this.navigate(link.dataset.view);
            });
        });
        document.getElementById('ham-logout')?.addEventListener('click', (e) => {
            e.preventDefault();
            if (menuDropdown) menuDropdown.style.display = 'none';
            if (hamIcon) hamIcon.style.display = '';
            if (closeIcon) closeIcon.style.display = 'none';
            if (menuToggle) menuToggle.setAttribute('aria-expanded', 'false');
            document.getElementById('logout-btn')?.click();
        });

        // Star rating (Task 1: pulse, keyboard)
        const starContainer = document.getElementById('star-rating');
        if (starContainer) {
            const setStarValue = (val) => {
                const v = Math.max(1, Math.min(5, val));
                document.getElementById('beer-rating').value = v;
                document.getElementById('rating-label').textContent = Utils.ratingLabel(v);
                starContainer.querySelectorAll('.star').forEach(s => {
                    const active = parseInt(s.dataset.value) <= v;
                    s.classList.toggle('active', active);
                    if (active) {
                        s.classList.add('pulse');
                        setTimeout(() => s.classList.remove('pulse'), 150);
                    }
                });
            };
            starContainer.querySelectorAll('.star').forEach(star => {
                star.addEventListener('click', () => {
                    const val = parseInt(star.dataset.value);
                    setStarValue(val);
                });
                star.addEventListener('mouseenter', () => {
                    const val = parseInt(star.dataset.value);
                    starContainer.querySelectorAll('.star').forEach(s => {
                        s.classList.toggle('hover', parseInt(s.dataset.value) <= val);
                    });
                });
                star.addEventListener('mouseleave', () => {
                    starContainer.querySelectorAll('.star').forEach(s => s.classList.remove('hover'));
                });
            });
            starContainer.setAttribute('tabindex', '0');
            starContainer.addEventListener('keydown', (e) => {
                const current = parseInt(document.getElementById('beer-rating').value) || 0;
                if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    setStarValue(current + 1);
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    setStarValue(current - 1);
                }
            });
        }

        // Flavor sliders
        ['hoppy', 'malty', 'bitter', 'sweet', 'fruity'].forEach(flavor => {
            const slider = document.getElementById(`flavor-${flavor}`);
            const display = document.getElementById(`val-${flavor}`);
            if (slider && display) {
                slider.addEventListener('input', () => { display.textContent = slider.value; });
            }
        });

        // Rating form submit
        document.getElementById('rating-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const ratingVal = parseInt(document.getElementById('beer-rating').value);
            if (!ratingVal) { App.toast('Please select a star rating', 'error'); return; }

            const ygRaw = document.getElementById('yg-value')?.value;
            const ygInt = Math.max(0, Math.min(12, Math.round(parseFloat(ygRaw) || 0)));
            const ygVal = ygInt > 0 ? ygInt : null;
            const lat = document.getElementById('rating-lat').value ? parseFloat(document.getElementById('rating-lat').value) : null;
            const lng = document.getElementById('rating-lng').value ? parseFloat(document.getElementById('rating-lng').value) : null;
            const locationName = document.getElementById('rating-location-name').value.trim() || null;
            let venueId = document.getElementById('rating-venue-id').value || null;
            const venueType = document.getElementById('rating-venue-type')?.value || null;
            
            // Handle pending venue creation from Overpass selection
            const pendingVenueData = document.getElementById('rating-venue-id').getAttribute('data-pending-venue');
            if (pendingVenueData && !venueId && lat && lng) {
                try {
                    const venueData = JSON.parse(pendingVenueData);
                    const venue = await DB.createVenue({
                        name: venueData.name,
                        latitude: venueData.latitude,
                        longitude: venueData.longitude,
                        address: venueData.address || null,
                        venue_type: venueData.venue_type || venueType || null
                    });
                    venueId = venue && venue.id ? venue.id : null;
                } catch (err) {
                    console.warn('Failed to create venue from Overpass data:', err);
                }
            }

            let photoUrl = null;
            if (this._pendingPhotoFile) {
                try {
                    this.setLoadingText(e.target, 'Uploading photo...');
                    const up = await DB.uploadPhoto(this._pendingPhotoFile);
                    photoUrl = (up && up.url) ? up.url : null;
                } catch (photoErr) {
                    console.error('Photo upload failed:', photoErr);
                    App.toast('Photo upload failed — rating saved without photo', 'warning');
                }
            }

            const beerIdVal = document.getElementById('rating-beer-id')?.value?.trim() || null;
            const rating = {
                beerName: document.getElementById('beer-name').value.trim(),
                brewery: document.getElementById('beer-brewery').value.trim(),
                style: document.getElementById('beer-style').value,
                abv: parseFloat(document.getElementById('beer-abv').value) || null,
                rating: ratingVal,
                beer_id: beerIdVal || null,
                flavors: {
                    hoppy: parseInt(document.getElementById('flavor-hoppy').value) || 0,
                    malty: parseInt(document.getElementById('flavor-malty').value) || 0,
                    bitter: parseInt(document.getElementById('flavor-bitter').value) || 0,
                    sweet: parseInt(document.getElementById('flavor-sweet').value) || 0,
                    fruity: parseInt(document.getElementById('flavor-fruity').value) || 0,
                },
                notes: document.getElementById('beer-notes').value.trim(),
                yg_value: ygVal,
                latitude: lat,
                longitude: lng,
                location_name: locationName,
                venue_id: venueId,
                photo_url: photoUrl
            };

            try {
                this.setLoadingText(e.target, 'Saving rating...');
                const result = await DB.addRating(rating);
                if (window.TabBurst && Number(result?.tabsEarned) > 0) {
                    const submitBtn = e.submitter || e.target.querySelector('button[type="submit"]');
                    if (submitBtn) {
                        const rect = submitBtn.getBoundingClientRect();
                        TabBurst.fire(result.tabsEarned, {
                            x: rect.left + (rect.width / 2),
                            y: rect.top
                        });
                    } else {
                        TabBurst.fire(result.tabsEarned);
                    }
                }
                if (result && result.updated) {
                    App.toast(`Rating updated! (previously ${result.previous_rating} ★)`, 'success');
                } else {
                    App.toast(`Rated "${rating.beerName}" ${Utils.stars(ratingVal)}`, 'success');
                    if (typeof Tabs !== 'undefined' && Tabs && typeof Tabs.showRatingFeedback === 'function') {
                        await Tabs.showRatingFeedback(result);
                    }
                }

                const priceAmount = document.getElementById('price-amount').value.trim();
                const priceHappy = document.getElementById('price-happy-hour').checked;
                if (priceAmount && locationName && !DB.isDemo) {
                    const cents = Math.round(parseFloat(priceAmount.replace(/[^0-9.]/g, '')) * 100);
                    if (isNaN(cents) || cents < 1) {
                        App.toast('Please enter a valid price (e.g. 6.50)', 'error');
                    } else {
                        try {
                            if (!venueId) {
                                const venue = await DB.createVenue({
                                    name: locationName,
                                    latitude: lat,
                                    longitude: lng,
                                    venue_type: venueType
                                });
                                venueId = venue && venue.id ? venue.id : null;
                            }
                            if (venueId) {
                                await DB.addVenuePrice(venueId, { beer_name: rating.beerName, style: rating.style, price_cents: cents, is_happy_hour: priceHappy });
                                App.toast('Price logged', 'success');
                            }
                        } catch (err) {
                            App.toast('Price log failed: ' + err.message, 'error');
                        }
                    }
                }

                this.resetRatingForm(e.target);
                this.loadAllData();
            } catch (err) {
                App.toast('Failed to save: ' + err.message, 'error');
            } finally {
                this.setLoading(e.target, false);
            }
        });

        // Browse mode tabs
        document.querySelectorAll('.browse-tab').forEach((tabBtn) => {
            tabBtn.addEventListener('click', async () => {
                await this.setBrowseTab(tabBtn.dataset.tab || 'community');
            });
        });

        this.initBrowseFilters();

        // Beer autocomplete (Task 2)
        this.bindBeerAutocomplete();

        // Brewery autocomplete (Task 2)
        this.bindBreweryAutocomplete();

        // Location autocomplete (forward geocoding)
        this.bindLocationAutocomplete();

        // YG slider (Task 3) — beer glass system 0–12
        this.bindYgSlider();

        // Location (Task 4) — event delegation so click is always handled (e.g. when Rate view was hidden at init)
        document.getElementById('app')?.addEventListener('click', (e) => {
            if (!e.target.closest('#btn-add-location')) return;
            e.preventDefault();
            e.stopPropagation();
            this.captureLocation();
        });
        document.getElementById('location-chip-remove')?.addEventListener('click', () => this.clearLocation());
        document.getElementById('venue-chip-remove')?.addEventListener('click', () => this.clearVenue());
        document.getElementById('btn-custom-venue')?.addEventListener('click', () => {
            document.getElementById('venue-picker').style.display = 'none';
            document.getElementById('location-manual').focus();
        });
        const handleManualLocation = () => {
            const v = document.getElementById('location-manual').value.trim();
            if (v) {
                document.getElementById('rating-location-name').value = v;
                document.getElementById('rating-venue-id').value = '';
                document.getElementById('rating-venue-id').removeAttribute('data-pending-venue');
                document.getElementById('location-chip-text').textContent = '📍 ' + v;
                document.getElementById('location-chip').style.display = 'inline-flex';
                document.getElementById('venue-picker').style.display = 'none';
                this.togglePriceSection();
                this.updateVenueTypePicker();
            }
        };
        document.getElementById('location-manual')?.addEventListener('blur', handleManualLocation);
        document.getElementById('location-manual')?.addEventListener('change', handleManualLocation);
        document.querySelectorAll('.venue-type-opt').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.venue-type-opt').forEach((b) => b.classList.remove('selected'));
                btn.classList.add('selected');
                document.getElementById('rating-venue-type').value = btn.dataset.type;
            });
        });

        // Price log (Task 6)
        document.getElementById('price-log-toggle')?.addEventListener('click', () => {
            const fields = document.getElementById('price-log-fields');
            const expanded = document.getElementById('price-log-toggle').getAttribute('aria-expanded') === 'true';
            fields.style.display = expanded ? 'none' : 'block';
            document.getElementById('price-log-toggle').setAttribute('aria-expanded', !expanded);
        });

        // Photo (Task 5) — styled button triggers hidden file input
        const photoInput = document.getElementById('photo-input');
        if (photoInput) photoInput.addEventListener('change', (e) => this.handlePhotoSelect(e));
        document.getElementById('app')?.addEventListener('click', (e) => {
            if (e.target.id === 'btn-add-photo' || e.target.closest('#btn-add-photo')) {
                e.preventDefault();
                if (photoInput) photoInput.click();
            }
        });

        // Delete modal (Task 12)
        document.getElementById('delete-modal-cancel')?.addEventListener('click', () => this.closeDeleteModal());
        document.getElementById('delete-modal-confirm')?.addEventListener('click', () => this.confirmDeleteRating());

        // Leaderboard tabs (Task 13)
        document.querySelectorAll('.lb-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.renderLeaderboard(tab.dataset.period);
            });
        });

        // Activity load more (Task 10)
        document.getElementById('activity-load-more')?.addEventListener('click', () => this.loadMoreActivity());

        // Real-time subscription disabled - data only refreshes on user actions
        // This prevents excessive API calls and page flickering
        // Data reloads when:
        // 1. User first enters app (enterApp())
        // 2. User submits a rating (rating form submit handler)
        // 3. User deletes a rating (confirmDeleteRating)
        // DB.subscribeToRatings(() => this.loadAllData()); // Disabled - was causing constant refreshes
    },

    initBrowseFilters() {
        if (this._browseFiltersInitialized) return;
        this._browseFiltersInitialized = true;
        const overlay = document.getElementById('browse-filter-sheet');
        const openBtn = document.getElementById('btn-open-filters');
        const applyBtn = document.getElementById('btn-apply-filters');
        const sortLabel = document.getElementById('sort-label');
        const searchInput = document.getElementById('search-input');
        let searchTimeout;

        const openSheet = () => {
            if (this.browseTab !== 'community') return;
            overlay?.classList.add('open');
            document.body.style.overflow = 'hidden';
        };

        openBtn?.addEventListener('click', openSheet);
        sortLabel?.addEventListener('click', openSheet);

        overlay?.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('open');
                document.body.style.overflow = '';
            }
        });

        overlay?.querySelectorAll('.filter-sheet__options').forEach((group) => {
            group.querySelectorAll('.filter-sheet__opt').forEach((opt) => {
                opt.addEventListener('click', () => {
                    group.querySelectorAll('.filter-sheet__opt').forEach((o) => o.classList.remove('active'));
                    opt.classList.add('active');
                });
            });
        });

        applyBtn?.addEventListener('click', () => {
            const activeSort = overlay?.querySelector('[data-filter="sort"] .filter-sheet__opt.active');
            const activeStyle = overlay?.querySelector('[data-filter="style"] .filter-sheet__opt.active');
            this._browseSortBy = activeSort?.dataset.value || 'recent';
            this._browseStyleFilter = activeStyle?.dataset.value || '';

            const sortSelect = document.getElementById('sort-by');
            const styleSelect = document.getElementById('filter-style');
            if (sortSelect) sortSelect.value = this._browseSortBy;
            if (styleSelect) styleSelect.value = this._browseStyleFilter;
            if (sortLabel) sortLabel.textContent = (activeSort?.textContent || 'Most Recent').trim();

            if (overlay) overlay.classList.remove('open');
            document.body.style.overflow = '';
            this.browseShownCount = 24;
            this.renderBrowse();
        });

        searchInput?.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                if (this.browseTab === 'catalog') {
                    this.refreshCatalogBrowse();
                    return;
                }
                this.browseShownCount = 24;
                this.renderBrowse();
            }, 250);
        });
    },

    _mapStyleToDropdown(rawStyle) {
        if (!rawStyle) return '';
        
        const s = rawStyle.toLowerCase().trim();
        
        // Direct and partial match mapping
        // Order matters — check more specific patterns first
        const mappings = [
            // IPAs
            [/double\s*ipa|imperial\s*ipa|dipa/i, 'Double IPA'],
            [/hazy\s*ipa|new\s*england\s*ipa|neipa|juicy\s*ipa/i, 'Hazy IPA'],
            [/india\s*pale\s*ale|\bipa\b/i, 'IPA'],
            // Pale ales
            [/pale\s*ale/i, 'Pale Ale'],
            [/amber\s*ale/i, 'Amber Ale'],
            [/brown\s*ale/i, 'Brown Ale'],
            [/red\s*ale|irish\s*red/i, 'Red Ale'],
            [/cream\s*ale/i, 'Cream Ale'],
            [/scotch\s*ale|wee\s*heavy/i, 'Scotch Ale'],
            // Stouts & Porters
            [/imperial\s*stout|russian\s*imperial/i, 'Imperial Stout'],
            [/stout/i, 'Stout'],
            [/porter/i, 'Porter'],
            // Wheat & German
            [/hefeweizen|hefe/i, 'Hefeweizen'],
            [/berliner\s*weisse/i, 'Berliner Weisse'],
            [/wheat\s*beer|weizen|wit\b|white\s*ale/i, 'Wheat Beer'],
            [/kolsch|kölsch/i, 'Kolsch'],
            [/dunkel/i, 'Dunkel'],
            [/bock|doppelbock|maibock/i, 'Bock'],
            // Belgian
            [/saison|farmhouse/i, 'Saison'],
            [/belgian|abbey|dubbel|tripel|quad/i, 'Belgian'],
            // Sours
            [/gose/i, 'Gose'],
            [/sour|lambic|gueuze|flanders/i, 'Sour'],
            // Lagers & Pilsners
            [/pilsner|pils\b/i, 'Pilsner'],
            [/lager|helles|marzen|oktoberfest|vienna|czech|mexican\s*lager/i, 'Lager'],
            // Other
            [/barleywine|barley\s*wine/i, 'Barleywine'],
            [/cider/i, 'Cider'],
            [/mead/i, 'Mead'],
        ];

        for (const [pattern, value] of mappings) {
            if (pattern.test(rawStyle)) return value;
        }

        // If no match, try checking if rawStyle is already a valid dropdown value
        const styleSelect = document.getElementById('beer-style');
        if (styleSelect) {
            for (const opt of styleSelect.options) {
                if (opt.value && opt.value.toLowerCase() === s) return opt.value;
            }
        }

        return ''; // No match — leave dropdown on "Select style..."
    },

    bindBeerAutocomplete() {
        const input = document.getElementById('beer-name');
        const dropdown = document.getElementById('beer-autocomplete');
        const hintEl = document.getElementById('autocomplete-hint');
        const beerIdInput = document.getElementById('rating-beer-id');
        if (!input || !dropdown) return;
        let debounceTimer;
        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const q = input.value.trim();
            dropdown.setAttribute('aria-hidden', 'true');
            dropdown.innerHTML = '';
            if (hintEl) hintEl.style.display = 'none';
            if (beerIdInput) beerIdInput.value = '';
            if (q.length < 2) return;
            debounceTimer = setTimeout(async () => {
                if (DB.isDemo) {
                    const localList = await DB.searchBeers(q);
                    const localResults = (localList || []).slice(0, 10);
                    let externalResults = [];
                    if (localResults.length < 3 && q.length >= 3) {
                        externalResults = await DB.searchBeersExternal(q);
                    }
                    const query = q.toLowerCase();
                    externalResults.sort((a, b) => {
                        const aName = (a.beer_name || '').toLowerCase();
                        const bName = (b.beer_name || '').toLowerCase();
                        const aNameMatch = aName.includes(query);
                        const bNameMatch = bName.includes(query);
                        const aStartsWith = aName.startsWith(query);
                        const bStartsWith = bName.startsWith(query);
                        if (aStartsWith && !bStartsWith) return -1;
                        if (bStartsWith && !aStartsWith) return 1;
                        if (aNameMatch && !bNameMatch) return -1;
                        if (bNameMatch && !aNameMatch) return 1;
                        return 0;
                    });
                    const seen = new Set();
                    const normalized = (name) => (name || '').toLowerCase().trim();
                    const allResults = [];
                    if (localResults.length > 0) {
                        allResults.push({ type: 'group', label: 'From your crew' });
                        localResults.forEach(b => {
                            const name = normalized(b.beer_name || b.name || '');
                            if (!seen.has(name)) {
                                seen.add(name);
                                allResults.push({
                                    type: 'item',
                                    beer_name: b.beer_name || b.name || '',
                                    brewery: b.brewery || '',
                                    style: b.style || '',
                                    abv: b.abv || '',
                                    source: b.source || 'local',
                                    beer_id: b.id || b.beer_id || null,
                                    review_overall: b.review_overall != null ? Number(b.review_overall) : null,
                                    review_count: b.review_count != null ? Number(b.review_count) : 0
                                });
                            }
                        });
                    }
                    if (externalResults.length > 0) {
                        allResults.push({ type: 'group', label: 'From beer database' });
                        externalResults.forEach(b => {
                            const name = normalized(b.beer_name || '');
                            if (!seen.has(name)) {
                                seen.add(name);
                                allResults.push({
                                    type: 'item',
                                    beer_name: b.beer_name || '',
                                    brewery: b.brewery || '',
                                    style: b.style || '',
                                    abv: b.abv || '',
                                    source: b.source || 'openfoodfacts',
                                    beer_id: null,
                                    review_overall: null,
                                    review_count: 0
                                });
                            }
                        });
                    }
                    App._renderBeerAutocompleteDropdown(dropdown, allResults, false);
                    return;
                }
                const searchResults = await DB.searchBeers(q);
                if (hintEl && q.length >= 3 && (!searchResults || searchResults.length === 0)) {
                    hintEl.style.display = 'block';
                }
                if (!searchResults || searchResults.length === 0) return;
                const items = searchResults.map((r) => ({
                    type: 'item',
                    beer_name: r.beer_name || r.name || '',
                    brewery: r.brewery || r.brewery_name || '',
                    style: r.style || '',
                    abv: r.abv != null ? String(r.abv) : '',
                    beer_id: r.id || r.beer_id || null,
                    source: r.source || 'catalog',
                    review_overall: r.review_overall != null ? Number(r.review_overall) : null,
                    review_count: r.review_count != null ? Number(r.review_count) : 0,
                }));
                App._renderBeerAutocompleteDropdown(dropdown, items, false);
            }, 300);
        });
        input.addEventListener('blur', () => {
            setTimeout(() => {
                dropdown.innerHTML = '';
                dropdown.setAttribute('aria-hidden', 'true');
                if (hintEl) hintEl.style.display = 'none';
            }, 150);
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                dropdown.innerHTML = '';
                dropdown.setAttribute('aria-hidden', 'true');
                if (hintEl) hintEl.style.display = 'none';
            }
        });
    },

    _renderBeerAutocompleteDropdown(dropdown, allResults, isCatalog) {
        dropdown.innerHTML = allResults.map(item => {
            if (item.type === 'group') {
                return `<div class="autocomplete-group-label">${Utils.escapeHtml(item.label)}</div>`;
            }
            const breweryAndStyle = [item.brewery, item.style].filter(Boolean).map((part) => Utils.escapeHtml(part)).join(' · ');
            const ratingBadge = item.review_overall != null
                ? `<span class="autocomplete-rating">${Number(item.review_overall).toFixed(1)} / 5</span>`
                : '';
            const reviewCount = item.review_count
                ? `<span class="autocomplete-reviews">(${Number(item.review_count).toLocaleString()} reviews)</span>`
                : '';
            const label = `<span class="autocomplete-beer-info">
                <span class="autocomplete-beer-name">${Utils.escapeHtml(item.beer_name || '')}</span>
                <span class="autocomplete-beer-meta">${breweryAndStyle}</span>
            </span>${ratingBadge}${reviewCount}`;
            const beerId = item.beer_id || '';
            return `<div class="autocomplete-item" data-source="${Utils.escapeHtml(item.source || '')}" data-name="${Utils.escapeHtml(item.beer_name)}" data-brewery="${Utils.escapeHtml(item.brewery || '')}" data-style="${Utils.escapeHtml(item.style || '')}" data-abv="${Utils.escapeHtml(item.abv || '')}" data-beer-id="${Utils.escapeHtml(beerId)}">${label}</div>`;
        }).join('');
        if (!dropdown.children.length) return;
        dropdown.setAttribute('aria-hidden', 'false');
        dropdown.querySelectorAll('.autocomplete-item').forEach((el) => {
            el.addEventListener('click', () => {
                document.getElementById('beer-name').value = el.dataset.name || '';
                document.getElementById('beer-brewery').value = el.dataset.brewery || '';
                const beerIdInput = document.getElementById('rating-beer-id');
                if (beerIdInput) beerIdInput.value = el.dataset.beerId || '';
                const rawStyle = el.dataset.style || '';
                const mappedStyle = App._mapStyleToDropdown(rawStyle);
                if (mappedStyle) document.getElementById('beer-style').value = mappedStyle;
                const abv = el.dataset.abv;
                if (abv && parseFloat(abv) > 0) {
                    document.getElementById('beer-abv').value = parseFloat(abv).toFixed(1);
                } else if (mappedStyle) {
                    const guide = STYLE_GUIDE?.[mappedStyle];
                    if (guide && guide.abv) {
                        const match = guide.abv.match(/([\d.]+)[–-]([\d.]+)/);
                        if (match) {
                            const mid = ((parseFloat(match[1]) + parseFloat(match[2])) / 2).toFixed(1);
                            document.getElementById('beer-abv').value = mid;
                        }
                    }
                }
                dropdown.innerHTML = '';
                dropdown.setAttribute('aria-hidden', 'true');
                const hintEl = document.getElementById('autocomplete-hint');
                if (hintEl) hintEl.style.display = 'none';
                this._handleSelectedBeerExistingRatings(el.dataset.beerId || null, el.dataset.name || '');
            });
        });
    },

    _normalizedBeerName(name) {
        return String(name || '').toLowerCase().trim().replace(/\s+/g, ' ');
    },

    _applyExistingRatingToForm(existing) {
        if (!existing) return;
        const rating = Number(existing.rating) || 0;
        if (rating >= 1 && rating <= 5) {
            document.getElementById('beer-rating').value = rating;
            document.getElementById('rating-label').textContent = Utils.ratingLabel(rating);
            document.querySelectorAll('#star-rating .star').forEach((star) => {
                const active = Number(star.dataset.value) <= rating;
                star.classList.toggle('active', active);
            });
        }
        ['hoppy', 'malty', 'bitter', 'sweet', 'fruity'].forEach((flavor) => {
            const val = Number(existing[`flavor_${flavor}`]) || 0;
            const slider = document.getElementById(`flavor-${flavor}`);
            const readout = document.getElementById(`val-${flavor}`);
            if (slider) slider.value = String(val);
            if (readout) readout.textContent = String(val);
        });
        const notes = document.getElementById('beer-notes');
        if (notes) notes.value = existing.notes || '';
        if (typeof App._ygSetValue === 'function') {
            const yg = (existing.yg_value != null && Number(existing.yg_value) > 0) ? Number(existing.yg_value) : 0;
            App._ygSetValue(yg);
        }
    },

    _handleSelectedBeerExistingRatings(beerId, beerName) {
        const allRatings = this.allRatings || [];
        if (!allRatings.length) return;
        const currentVenueId = document.getElementById('rating-venue-id')?.value || null;
        const normalizedSelectedName = this._normalizedBeerName(beerName);
        const matchesBeer = (r) => {
            if (beerId && r.beer_id && String(r.beer_id) === String(beerId)) return true;
            return this._normalizedBeerName(r.beer_name) === normalizedSelectedName;
        };
        const beerMatches = allRatings.filter(matchesBeer);
        if (!beerMatches.length) return;

        const existingAtVenue = beerMatches.find((r) => {
            if (currentVenueId == null || currentVenueId === '') return !r.venue_id;
            return String(r.venue_id || '') === String(currentVenueId);
        }) || null;

        const otherVenueRatings = beerMatches.filter((r) => r !== existingAtVenue);
        if (existingAtVenue) {
            this._applyExistingRatingToForm(existingAtVenue);
            App.toast(`You rated this ${existingAtVenue.rating} ★ — submitting will update your rating`, 'info');
        } else if (otherVenueRatings.length > 0) {
            App.toast(`You've rated this at ${otherVenueRatings.length} other venue(s) — this will be a new rating`, 'info');
        }
    },

    bindBreweryAutocomplete() {
        const input = document.getElementById('beer-brewery');
        const dropdown = document.getElementById('brewery-autocomplete');
        if (!input || !dropdown) return;
        let debounceTimer;
        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const q = input.value.trim();
            dropdown.setAttribute('aria-hidden', 'true');
            dropdown.innerHTML = '';
            if (q.length < 2) return;
            debounceTimer = setTimeout(async () => {
                const list = await DB.searchBreweries(q);
                dropdown.innerHTML = (list.slice(0, 15) || []).map(b => {
                    const cityState = [b.city, b.state].filter(Boolean).join(', ');
                    const type = b.brewery_type ? b.brewery_type.charAt(0).toUpperCase() + b.brewery_type.slice(1) : '';
                    const label = `${Utils.escapeHtml(b.name || '')}${cityState ? ' — ' + Utils.escapeHtml(cityState) : ''}${type ? ' (' + Utils.escapeHtml(type) + ')' : ''}`;
                    return `<div class="autocomplete-item" data-name="${Utils.escapeHtml(b.name || '')}">${label}</div>`;
                }).join('');
                if (dropdown.children.length) {
                    dropdown.setAttribute('aria-hidden', 'false');
                    dropdown.querySelectorAll('.autocomplete-item').forEach((el) => {
                        el.addEventListener('click', () => {
                            document.getElementById('beer-brewery').value = el.dataset.name;
                            dropdown.innerHTML = '';
                            dropdown.setAttribute('aria-hidden', 'true');
                        });
                    });
                }
            }, 300);
        });
        input.addEventListener('blur', () => { setTimeout(() => { dropdown.innerHTML = ''; dropdown.setAttribute('aria-hidden', 'true'); }, 150); });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { dropdown.innerHTML = ''; dropdown.setAttribute('aria-hidden', 'true'); }
        });
    },

    bindLocationAutocomplete() {
        const input = document.getElementById('location-manual');
        const dropdown = document.getElementById('venue-suggestions');
        const picker = document.getElementById('venue-picker');
        if (!input || !dropdown) return;
        let debounceTimer;

        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const q = input.value.trim();
            dropdown.innerHTML = '';
            if (picker) picker.style.display = 'none';
            if (q.length < 3) return; // Need at least 3 chars for meaningful search

            debounceTimer = setTimeout(async () => {
                try {
                    // Forward geocode via Nominatim
                    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=1`;
                    const resp = await fetch(url, {
                        headers: { 'User-Agent': 'BeerBook/1.0' }
                    });
                    if (!resp.ok) return;
                    const results = await resp.json();
                    if (!results.length) {
                        dropdown.innerHTML = '<div class="venue-suggestion-item" style="opacity:0.6;pointer-events:none;">No results found</div>';
                        if (picker) picker.style.display = 'block';
                        return;
                    }

                    dropdown.innerHTML = results.map(r => {
                        const name = r.display_name || '';
                        // Shorten display: take first 2-3 parts of the comma-separated name
                        const shortName = name.split(',').slice(0, 3).map(s => s.trim()).join(', ');
                        return `<div class="venue-suggestion-item" 
                            data-lat="${r.lat}" 
                            data-lng="${r.lon}" 
                            data-name="${Utils.escapeHtml(shortName)}"
                            data-full-name="${Utils.escapeHtml(name)}">
                            📍 ${Utils.escapeHtml(shortName)}
                        </div>`;
                    }).join('');

                    if (picker) picker.style.display = 'block';

                    // Bind click handlers on results
                    dropdown.querySelectorAll('.venue-suggestion-item').forEach(el => {
                        if (el.style.pointerEvents === 'none') return; // skip "no results"
                        el.addEventListener('click', () => {
                            const lat = el.dataset.lat;
                            const lng = el.dataset.lng;
                            const locationName = el.dataset.name;

                            // Set hidden fields
                            document.getElementById('rating-lat').value = lat;
                            document.getElementById('rating-lng').value = lng;
                            document.getElementById('rating-location-name').value = locationName;
                            document.getElementById('rating-venue-id').value = '';
                            document.getElementById('rating-venue-id').removeAttribute('data-pending-venue');
                            document.getElementById('location-manual').value = locationName;

                            // Show chip
                            document.getElementById('location-chip-text').textContent = '📍 ' + locationName;
                            document.getElementById('location-chip').style.display = 'inline-flex';

                            // Hide dropdown
                            dropdown.innerHTML = '';
                            if (picker) picker.style.display = 'none';

                            // Show price section since we now have a location
                            App.togglePriceSection();
                            this.updateVenueTypePicker();
                            App.toast('Location set', 'success');
                        });
                    });
                } catch (err) {
                    console.warn('Location search failed:', err);
                }
            }, 500); // 500ms debounce to respect Nominatim rate limit
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.innerHTML = '';
                if (picker) picker.style.display = 'none';
            }
        });
    },

    bindYgSlider() {
        const ygValueInput = document.getElementById('yg-value');
        const ygTrack = document.getElementById('yg-track');
        const ygDisplay = document.getElementById('yg-display');
        const ygContext = document.getElementById('yg-context');
        const ygGlasses = document.getElementById('yg-glasses');
        const ygClearBtn = document.getElementById('yg-clear');
        if (!ygValueInput || !ygTrack || !ygDisplay || !ygContext || !ygGlasses) return;
        const hints = {
            0: 'Tap a glass to rate in YGs',
            1: 'Barely worth a YG 😬',
            2: 'Equal to a couple YGs',
            '3-4': 'Solid beer 👍',
            '5-6': 'Above average 🍺',
            '7-8': 'Premium territory 🔥',
            '9-10': 'This beer is Elite 🏆',
            '11-12': 'God tier. 🐐'
        };
        const getHint = (v) => {
            if (v <= 0) return hints[0];
            if (v === 1) return hints[1];
            if (v === 2) return hints[2];
            if (v <= 4) return hints['3-4'];
            if (v <= 6) return hints['5-6'];
            if (v <= 8) return hints['7-8'];
            if (v <= 10) return hints['9-10'];
            return hints['11-12'];
        };
        const updateDisplayFromValue = (v) => {
            ygContext.textContent = getHint(v);
            ygDisplay.textContent = v > 0 ? v + ' YG' : '';
        };
        let dragging = false;
        let hoverValue = null;
        const setValue = (val) => {
            const v = Math.max(0, Math.min(12, Math.round(Number(val)) || 0));
            ygValueInput.value = String(v);
            ygTrack.setAttribute('aria-valuenow', String(v));
            updateDisplayFromValue(v);
            if (ygClearBtn) ygClearBtn.style.display = v > 0 ? 'inline-flex' : 'none';
            const glassEls = ygGlasses.querySelectorAll('.yg-glass');
            glassEls.forEach((el, i) => {
                const revealed = i < v;
                const wasRevealed = el.classList.contains('revealed');
                el.classList.toggle('dimmed', !revealed);
                el.classList.toggle('revealed', revealed);
                if (revealed && !wasRevealed) {
                    el.classList.add('yg-glass-pop');
                    const t = setTimeout(() => el.classList.remove('yg-glass-pop'), 250);
                }
            });
        };
        const applyPreview = (n) => {
            const glassEls = ygGlasses.querySelectorAll('.yg-glass');
            glassEls.forEach((el, i) => {
                el.classList.toggle('yg-glass-preview', i < n);
            });
        };
        const clearPreview = () => {
            hoverValue = null;
            ygGlasses.querySelectorAll('.yg-glass').forEach((g) => g.classList.remove('yg-glass-preview'));
            updateDisplayFromValue(parseInt(ygValueInput.value, 10) || 0);
        };
        const getValueFromElement = (el) => {
            const glass = el?.closest?.('.yg-glass');
            if (!glass || !glass.dataset.value) return null;
            return parseInt(glass.dataset.value, 10);
        };
        const ensureTwelveGlasses = () => {
            if (ygGlasses.children.length === 12) return;
            ygGlasses.innerHTML = '';
            for (let i = 1; i <= 12; i++) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'yg-glass dimmed';
                btn.textContent = '🍺';
                btn.dataset.value = String(i);
                btn.setAttribute('aria-label', `${i} YG`);
                ygGlasses.appendChild(btn);
            }
        };
        ensureTwelveGlasses();
        setValue(ygValueInput.value || 0);

        ygGlasses.addEventListener('click', (e) => {
            const val = getValueFromElement(e.target);
            if (val != null) setValue(val);
        });
        ygGlasses.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            clearPreview();
            const val = getValueFromElement(e.target);
            if (val != null) { dragging = true; setValue(val); }
        });
        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            const el = document.elementFromPoint(e.clientX, e.clientY);
            const val = getValueFromElement(el);
            if (val != null) setValue(val);
        });
        document.addEventListener('mouseup', () => { dragging = false; });

        ygGlasses.addEventListener('touchstart', (e) => {
            const val = getValueFromElement(e.target);
            if (val != null) { dragging = true; setValue(val); }
        }, { passive: true });
        document.addEventListener('touchmove', (e) => {
            if (!dragging || !e.changedTouches?.[0]) return;
            const touch = e.changedTouches[0];
            const el = document.elementFromPoint(touch.clientX, touch.clientY);
            const val = getValueFromElement(el);
            if (val != null) { e.preventDefault(); setValue(val); }
        }, { passive: false });
        document.addEventListener('touchend', () => { dragging = false; }, { passive: true });

        ygGlasses.querySelectorAll('.yg-glass').forEach((glass) => {
            glass.addEventListener('mouseenter', () => {
                if (dragging) return;
                const n = getValueFromElement(glass);
                if (n == null) return;
                hoverValue = n;
                applyPreview(n);
                updateDisplayFromValue(n);
            });
        });
        ygGlasses.addEventListener('mouseleave', () => clearPreview());

        ygTrack.addEventListener('keydown', (e) => {
            const v = parseInt(ygValueInput.value, 10) || 0;
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                e.preventDefault();
                setValue(v + 1);
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                e.preventDefault();
                setValue(v - 1);
            }
        });

        if (ygClearBtn) ygClearBtn.addEventListener('click', (e) => { e.preventDefault(); setValue(0); });

        App._ygSetValue = setValue;
    },

    async captureLocation() {
        if (!navigator.geolocation) {
            App.toast('Geolocation not supported', 'error');
            return;
        }
        const btn = document.getElementById('btn-add-location');
        if (btn) btn.disabled = true;
        const options = { enableHighAccuracy: false, timeout: 15000, maximumAge: 0 };
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                document.getElementById('rating-lat').value = lat;
                document.getElementById('rating-lng').value = lng;
                
                // Show venue picker and query Overpass in parallel with Nominatim
                const venuePicker = document.getElementById('venue-picker');
                const venueSuggestions = document.getElementById('venue-suggestions');
                venuePicker.style.display = 'block';
                venueSuggestions.innerHTML = '<div class="venue-suggestion-skeleton"><div class="skeleton" style="height:40px;margin-bottom:6px;"></div><div class="skeleton" style="height:40px;margin-bottom:6px;"></div></div>';
                
                const [nominatimData, overpassVenues] = await Promise.all([
                    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, {
                        headers: { 'User-Agent': 'BeerBook/1.0' }
                    }).then(r => r.json()).catch(() => null),
                    DB.searchNearbyVenues(lat, lng, 200).catch(() => [])
                ]);
                
                const name = (nominatimData && nominatimData.display_name) ? nominatimData.display_name : `Location ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                document.getElementById('rating-location-name').value = name;
                document.getElementById('location-chip-text').textContent = '📍 ' + name;
                document.getElementById('location-chip').style.display = 'inline-flex';
                document.getElementById('location-manual').value = name;
                document.getElementById('rating-venue-id').value = '';
                document.getElementById('rating-venue-id').removeAttribute('data-pending-venue');

                // Auto-detect venue type from OSM data and preselect picker pill.
                const detectedType = this.detectVenueTypeFromOSM(nominatimData);
                if (detectedType) {
                    document.getElementById('rating-venue-type').value = detectedType;
                    document.querySelectorAll('.venue-type-opt').forEach((btn) => {
                        btn.classList.toggle('selected', btn.dataset.type === detectedType);
                    });
                }
                this.updateVenueTypePicker();
                
                // Render venue suggestions
                if (overpassVenues && overpassVenues.length > 0) {
                    const sortedVenues = overpassVenues
                        .map(v => ({
                            ...v,
                            distance: this._distanceMeters(lat, lng, v.latitude, v.longitude)
                        }))
                        .sort((a, b) => a.distance - b.distance);
                    
                    venueSuggestions.innerHTML = sortedVenues.map(v => {
                        const icon = this._venueIcon(v.type);
                        const distText = v.distance < 1000 ? `${Math.round(v.distance)}m away` : `${(v.distance / 1000).toFixed(1)} km away`;
                        const addressText = v.address ? ` · ${Utils.escapeHtml(v.address)}` : '';
                        const addressAttr = (v.address || '').replace(/"/g, '&quot;');
                        return `<div class="venue-suggestion" data-osm-id="${v.osm_id}" data-name="${Utils.escapeHtml(v.name)}" data-lat="${v.latitude}" data-lng="${v.longitude}" data-type="${Utils.escapeHtml(v.type)}" data-address="${addressAttr}">
                            <span class="venue-icon">${icon}</span>
                            <div class="venue-info">
                                <div class="venue-name">${Utils.escapeHtml(v.name)}</div>
                                <div class="venue-meta">${Utils.escapeHtml(v.type)} · ${distText}${addressText}</div>
                            </div>
                        </div>`;
                    }).join('');
                    
                    // Add click handlers (await async _selectVenue and catch errors)
                    venueSuggestions.querySelectorAll('.venue-suggestion').forEach(el => {
                        el.addEventListener('click', async () => {
                            try {
                                await this._selectVenue(el);
                            } catch (err) {
                                console.error('Venue selection failed:', err);
                                App.toast('Could not select venue', 'error');
                            }
                        });
                    });
                } else {
                    venueSuggestions.innerHTML = '<p class="empty-state">No nearby venues found</p>';
                }
                
                App.toast('Location captured', 'success');
                this.togglePriceSection();
                if (btn) btn.disabled = false;
            },
            (err) => {
                if (btn) btn.disabled = false;
                document.getElementById('location-manual')?.focus();
                const msg = err.code === 1 ? 'Location permission denied' : err.code === 2 ? 'Location unavailable' : err.code === 3 ? 'Location request timed out' : 'Could not get location';
                App.toast(msg + '. You can type a location manually.', 'info');
            },
            options
        );
    },

    _venueIcon(type) {
        switch(type) {
            case 'bar': case 'pub': return '🍺';
            case 'restaurant': return '🍽️';
            case 'biergarten': return '🌿';
            case 'brewery': return '🏭';
            case 'cafe': return '☕';
            default: return '📍';
        }
    },

    detectVenueTypeFromOSM(nominatimData) {
        if (!nominatimData) return null;

        const cls = (nominatimData.class || '').toLowerCase();
        const type = (nominatimData.type || '').toLowerCase();

        if (cls === 'amenity' && ['bar', 'pub', 'nightclub', 'biergarten'].includes(type)) {
            return 'bar';
        }

        if (cls === 'amenity' && ['restaurant', 'cafe', 'fast_food'].includes(type)) {
            return 'restaurant';
        }

        if (type === 'brewery' || (cls === 'craft' && type === 'brewery')) {
            return 'brewery';
        }

        const name = (nominatimData.display_name || '').toLowerCase();
        if (name.includes('brewing') || name.includes('brewery') || name.includes('brewhouse')) {
            return 'brewery';
        }
        if (name.includes(' bar,') || name.includes(' pub,') || name.includes('taproom') || name.includes('tavern') || name.includes('taphouse')) {
            return 'bar';
        }
        if (name.includes('restaurant') || name.includes('grill') || name.includes('bistro') || name.includes('kitchen')) {
            return 'restaurant';
        }

        return null;
    },

    _distanceMeters(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    },

    async _selectVenue(el) {
        const osmId = el.dataset.osmId;
        const name = el.dataset.name;
        const lat = parseFloat(el.dataset.lat);
        const lng = parseFloat(el.dataset.lng);
        
        // Check if a DAW venue exists within 100m
        let venueId = null;
        try {
            if (!DB.isDemo) {
                const venuesRes = await DB._api('GET', `/api/venues?lat=${lat}&lng=${lng}&radius=100`);
                if (venuesRes && venuesRes.data && venuesRes.data.length > 0) {
                    venueId = venuesRes.data[0].id;
                }
            }
        } catch (e) {
            console.warn('Venue matching failed:', e);
        }
        
        // Store venue data for creation on submit if no match (use data-address for clean address)
        if (!venueId) {
            const address = el.dataset.address || '';
            const detectedType = this.detectVenueTypeFromOSM({
                class: 'amenity',
                type: el.dataset.type || ''
            });
            document.getElementById('rating-venue-id').setAttribute('data-pending-venue', JSON.stringify({
                name,
                latitude: lat,
                longitude: lng,
                address: address || null,
                venue_type: detectedType
            }));
        } else {
            document.getElementById('rating-venue-id').value = venueId;
            document.getElementById('rating-venue-id').removeAttribute('data-pending-venue');
        }
        
        // Show selected venue chip
        const venueType = el.dataset.type || 'venue';
        const icon = this._venueIcon(venueType);
        document.getElementById('venue-chip-text').textContent = `${icon} ${name}`;
        document.getElementById('venue-chip').style.display = 'inline-flex';
        
        // Hide venue picker
        document.getElementById('venue-picker').style.display = 'none';
        this.updateVenueTypePicker();
    },

    clearLocation() {
        document.getElementById('rating-lat').value = '';
        document.getElementById('rating-lng').value = '';
        document.getElementById('rating-location-name').value = '';
        document.getElementById('rating-venue-id').value = '';
        document.getElementById('rating-venue-id').removeAttribute('data-pending-venue');
        document.getElementById('location-manual').value = '';
        document.getElementById('location-chip').style.display = 'none';
        document.getElementById('venue-picker').style.display = 'none';
        document.getElementById('venue-chip').style.display = 'none';
        document.getElementById('rating-venue-type').value = '';
        document.querySelectorAll('.venue-type-opt').forEach((b) => b.classList.remove('selected'));
        this.updateVenueTypePicker();
        this.togglePriceSection();
    },

    clearVenue() {
        document.getElementById('rating-venue-id').value = '';
        document.getElementById('rating-venue-id').removeAttribute('data-pending-venue');
        document.getElementById('venue-chip').style.display = 'none';
        const lat = document.getElementById('rating-lat').value;
        const lng = document.getElementById('rating-lng').value;
        if (lat && lng) {
            document.getElementById('venue-picker').style.display = 'block';
        }
        this.updateVenueTypePicker();
    },

    updateVenueTypePicker() {
        const picker = document.getElementById('venue-type-picker');
        if (!picker) return;
        const hasLocation = !!document.getElementById('rating-location-name').value;
        const hasVenueId = !!document.getElementById('rating-venue-id').value;
        picker.style.display = (hasLocation && !hasVenueId) ? 'block' : 'none';
    },

    togglePriceSection() {
        const hasLocation = !!document.getElementById('rating-location-name').value;
        document.getElementById('price-log-section').style.display = hasLocation ? 'block' : 'none';
    },

    handlePhotoSelect(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            App.toast('Photo must be under 5MB', 'error');
            return;
        }
        const previewEl = document.getElementById('photo-preview');
        if (!previewEl) return;
        const progressEl = document.getElementById('upload-progress');
        if (this._pendingPhotoPreviewUrl) {
            URL.revokeObjectURL(this._pendingPhotoPreviewUrl);
            this._pendingPhotoPreviewUrl = null;
        }
        this._pendingPhotoFile = null;
        if (progressEl) progressEl.style.display = 'none';

        const sourceUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(sourceUrl);
            const w = img.width;
            const h = img.height;
            const showPreview = () => {
                if (this._pendingPhotoPreviewUrl) URL.revokeObjectURL(this._pendingPhotoPreviewUrl);
                this._pendingPhotoPreviewUrl = URL.createObjectURL(this._pendingPhotoFile);
                previewEl.innerHTML = `<img src="${this._pendingPhotoPreviewUrl}" alt="Preview"><button type="button" class="photo-remove">Remove photo</button>`;
                previewEl.querySelector('.photo-remove')?.addEventListener('click', () => {
                    if (this._pendingPhotoPreviewUrl) {
                        URL.revokeObjectURL(this._pendingPhotoPreviewUrl);
                        this._pendingPhotoPreviewUrl = null;
                    }
                    this._pendingPhotoFile = null;
                    previewEl.innerHTML = '';
                    document.getElementById('photo-input').value = '';
                    if (progressEl) progressEl.style.display = 'none';
                });
            };

            const targetWidth = w > 1200 ? 1200 : w;
            const targetHeight = Math.round((targetWidth * h) / w);
            const c = document.createElement('canvas');
            c.width = targetWidth;
            c.height = targetHeight;
            const ctx = c.getContext('2d');
            if (!ctx) {
                App.toast('Could not process photo', 'error');
                return;
            }
            ctx.drawImage(img, 0, 0, c.width, c.height);
            c.toBlob((blob) => {
                if (!blob) {
                    App.toast('Could not process photo', 'error');
                    return;
                }
                this._pendingPhotoFile = new File([blob], 'photo.jpg', { type: 'image/jpeg' });
                showPreview();
            }, 'image/jpeg', 0.8);
        };
        img.onerror = () => {
            URL.revokeObjectURL(sourceUrl);
            App.toast('Could not read photo', 'error');
        };
        img.src = sourceUrl;
    },

    closeDeleteModal() {
        document.getElementById('delete-modal').style.display = 'none';
        this._deleteRatingId = null;
    },

    closeBeerDetail() {
        const modal = document.getElementById('beer-detail-modal');
        if (modal) modal.style.display = 'none';
    },

    async getCheersForRating(ratingId) {
        if (this.cheersCache[ratingId]) return this.cheersCache[ratingId];
        if (DB.isDemo) {
            const raw = Utils.storage.get(this._demoCheersKey) || {};
            const entry = raw[ratingId] || { count: 0, userIds: [] };
            const youCheered = DB.currentUser && entry.userIds && entry.userIds.includes(DB.currentUser.id);
            const out = { count: entry.count || 0, youCheered: !!youCheered };
            this.cheersCache[ratingId] = out;
            return out;
        }
        const data = await DB.getRatingCheers(ratingId);
        const youCheered = !!(DB.currentUser && data.users && data.users.some(u => (u.id || u) === DB.currentUser.id));
        const out = { count: data.count || 0, youCheered };
        this.cheersCache[ratingId] = out;
        return out;
    },

    async handleCheersClick(btn, ratingId) {
        const loggedIn = !!(DB.currentUser && DB.currentUser.id);
        if (!loggedIn || btn.getAttribute('data-disabled') === 'true' || btn.dataset.disabled === 'true') {
            this.toast('Sign in to cheers', 'info');
            return;
        }
        
        // Optimistic UI update
        const currentData = this.cheersCache[ratingId] || { count: 0, youCheered: false };
        const newYouCheered = !currentData.youCheered;
        const newCount = newYouCheered ? currentData.count + 1 : Math.max(0, currentData.count - 1);
        
        // Update UI immediately (optimistic)
        this.setCheersOnCard(ratingId, newCount, newYouCheered);
        this.cheersCache[ratingId] = { count: newCount, youCheered: newYouCheered };
        
        // Animation
        btn.classList.add('cheers-pop');
        setTimeout(() => btn.classList.remove('cheers-pop'), 300);
        
        try {
            // Use the server response directly — no need for separate GET that might trigger re-renders
            const result = await DB.toggleCheers(ratingId);
            const serverCount = result.count ?? newCount;
            const serverYouCheered = result.action === 'added';
            // Update with server response (more accurate than optimistic update)
            this.setCheersOnCard(ratingId, serverCount, serverYouCheered);
            this.cheersCache[ratingId] = { count: serverCount, youCheered: serverYouCheered };
        } catch (err) {
            console.error('Cheers toggle failed:', err);
            // Revert optimistic update on error
            this.setCheersOnCard(ratingId, currentData.count, currentData.youCheered);
            this.cheersCache[ratingId] = currentData;
            this.toast('Cheers update failed', 'error');
        }
    },

    setCheersOnCard(ratingId, count, youCheered) {
        document.querySelectorAll(`.cheers-btn[data-rating-id="${ratingId}"]`).forEach(btn => {
            const span = btn.querySelector('.cheers-count');
            if (span) span.textContent = count;
            btn.title = youCheered ? `You and ${Math.max(0, count - 1)} others` : `${count} cheers`;
            btn.classList.toggle('cheered', youCheered);
        });
    },

    async fillCheersForCards(ratingIds) {
        if (!ratingIds.length) return;
        const loggedIn = !!(DB.currentUser && DB.currentUser.id);
        for (const id of ratingIds) {
            try {
                const data = await this.getCheersForRating(id);
                this.setCheersOnCard(id, data.count, data.youCheered);
            } catch (_) {}
        }
    },

    cheersButtonHtml(ratingId) {
        const loggedIn = !!(DB.currentUser && DB.currentUser.id);
        return `<button type="button" class="cheers-btn" data-rating-id="${Utils.escapeHtml(ratingId)}" ${!loggedIn ? 'data-disabled="true" title="Sign in to cheers"' : 'title="Cheers"'}><span class="cheers-icon">🍻</span> <span class="cheers-count">0</span></button>`;
    },

    async openBeerDetail(beerName, brewery, style, beerId) {
        if (!beerName) return;
        const modal = document.getElementById('beer-detail-modal');
        const body = document.getElementById('beer-detail-body');
        if (!modal || !body) return;
        body.innerHTML = '<p class="loading-state">Loading…</p>';
        modal.style.display = 'flex';

        let catalogBeer = null;
        if (beerId && !DB.isDemo) {
            try {
                catalogBeer = await DB.getCatalogBeer(beerId);
            } catch (_) {}
        }

        let beer = null;
        let crossRates = null;
        if (DB.isDemo) {
            const ratings = (this.allRatings || []).filter(r => (r.beer_name || '').toLowerCase() === (beerName || '').toLowerCase());
            if (ratings.length) {
                const r0 = ratings[0];
                const sum = ratings.reduce((s, r) => s + (r.rating || 0), 0);
                const ygVals = ratings.map(r => r.yg_value).filter(v => v != null && v > 0);
                const avgYg = ygVals.length ? (ygVals.reduce((a, b) => a + b, 0) / ygVals.length).toFixed(1) : null;
                beer = {
                    beer_name: r0.beer_name,
                    brewery: r0.brewery || brewery || '',
                    style: r0.style || style || '',
                    abv: r0.abv,
                    avg_rating: (sum / ratings.length).toFixed(1),
                    review_count: ratings.length,
                    avg_yg: avgYg,
                    ratings
                };
            }
        } else {
            beer = await DB.getBeerDetail(beerName);
            if (beer && beer.beer_name) crossRates = await DB.getBeerCrossRates(beerName);
        }

        if (!beer || !beer.beer_name) {
            body.innerHTML = '<p class="empty-state">Beer not found.</p>';
            return;
        }

        const name = Utils.escapeHtml(beer.beer_name);
        const brew = Utils.escapeHtml(beer.brewery || '');
        const st = Utils.escapeHtml(beer.style || '');
        const abv = beer.abv != null ? `${beer.abv}% ABV` : '';
        const avgRating = beer.avg_rating ?? (beer.ratings && beer.ratings.length ? (beer.ratings.reduce((s, r) => s + (r.rating || 0), 0) / beer.ratings.length).toFixed(1) : '—');
        const reviewCount = beer.review_count != null ? beer.review_count : ((beer.ratings && beer.ratings.length) || 0);
        const communityOverall = catalogBeer && catalogBeer.review_overall != null
            ? Number(catalogBeer.review_overall)
            : null;
        const communityReviewCount = catalogBeer && catalogBeer.review_count != null
            ? Number(catalogBeer.review_count)
            : 0;
        const avgYg = beer.avg_yg ?? (beer.ratings && beer.ratings.length ? (() => {
            const yg = beer.ratings.map(r => r.yg_value).filter(v => v != null && v > 0);
            return yg.length ? (yg.reduce((a, b) => a + b, 0) / yg.length).toFixed(1) : null;
        })() : null);

        const isBaseline = (beer.beer_name || '').toLowerCase().includes('yuengling') && (beer.beer_name || '').toLowerCase().includes('golden');
        let ygContext = '';
        if (isBaseline) {
            ygContext = 'This IS the baseline. 1.0 YG.';
        } else if (avgYg) {
            ygContext = `Worth ${avgYg} YGs.`;
            if (crossRates && crossRates.equivalent) ygContext += ` That's equivalent to ${Utils.escapeHtml(crossRates.equivalent)}.`;
        }

        const ratingsList = (beer.ratings || []).slice(0, 20).map(r => {
            const ygBadge = (r.yg_value != null && r.yg_value > 0) ? ` <span class="yg-badge-pill">${r.yg_value} YG</span>` : '';
            return `<div class="beer-detail-rating" data-rating-id="${Utils.escapeHtml(r.id)}"><span class="beer-detail-rating-stars">${Utils.stars(r.rating)}</span>${ygBadge} — ${Utils.escapeHtml(r.user_name || 'Anonymous')} · ${Utils.timeAgo(r.created_at)}${r.notes ? ` — ${Utils.escapeHtml(Utils.truncate(r.notes, 60))}` : ''} <span class="beer-detail-rating-cheers">${this.cheersButtonHtml(r.id)}</span></div>`;
        }).join('');
        const myRatingsForBeer = (beer.ratings || []).filter((r) => String(r.user_id || '') === String(DB.currentUser?.id || ''));
        const myRatingsHtml = myRatingsForBeer.length ? (() => {
            const avg = (myRatingsForBeer.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / myRatingsForBeer.length).toFixed(1);
            const rows = myRatingsForBeer.slice(0, 10).map((r) => {
                const venueName = r.location_name || 'General';
                let dateLabel = '';
                if (r.created_at) {
                    const d = new Date(r.created_at);
                    if (!Number.isNaN(d.getTime())) dateLabel = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                }
                return `<div class="venue-rating-item">
                    <span class="user-venue-name">${Utils.escapeHtml(venueName)}</span>
                    <span class="venue-score">${Utils.escapeHtml(String(r.rating || 0))} ★</span>
                    <span class="venue-date">${Utils.escapeHtml(dateLabel || '')}</span>
                </div>`;
            }).join('');
            return `<div class="user-beer-ratings">
                <div class="user-avg-rating">
                    <span class="user-avg-score">Your Avg: ${avg} / 5</span>
                    <span class="user-avg-label">across ${myRatingsForBeer.length} venue${myRatingsForBeer.length !== 1 ? 's' : ''}</span>
                </div>
                <div class="venue-ratings-list">${rows}</div>
            </div>`;
        })() : '';

        const catalogInfoHtml = (catalogBeer && (catalogBeer.description || catalogBeer.review_overall != null || catalogBeer.abv != null || catalogBeer.style)) ? (() => {
            const parts = [];
            if (catalogBeer.description) parts.push(`<p class="catalog-desc">${Utils.escapeHtml(catalogBeer.description)}</p>`);
            const stats = [];
            if (catalogBeer.abv != null) stats.push(`<span>ABV: ${Utils.escapeHtml(String(catalogBeer.abv))}%</span>`);
            if (catalogBeer.style) stats.push(`<span>Style: ${Utils.escapeHtml(catalogBeer.style)}</span>`);
            if (stats.length) parts.push(`<div class="catalog-stats">${stats.join('')}</div>`);
            if (parts.length === 0) return '';
            return `<div class="catalog-info"><span class="catalog-badge">📖 From BeerBook Catalog</span>${parts.join('')}</div>`;
        })() : '';
        const communityRatingHtml = communityOverall != null
            ? `<div class="community-rating">
                <span class="community-rating-score">${communityOverall.toFixed(2)} / 5</span>
                <span class="community-rating-label">Community Avg${communityReviewCount ? ` · ${communityReviewCount.toLocaleString()} reviews` : ''}</span>
            </div>`
            : '';

        body.innerHTML = `
            <h2 class="beer-detail-name">${name}</h2>
            ${brew ? `<div class="beer-detail-brewery">${brew}</div>` : ''}
            <div class="beer-detail-meta">
                ${st ? `<span class="style-tooltip" data-style="${Utils.escapeHtml(beer.style || '')}">${st}</span>` : ''}
                ${abv ? `<span>${abv}</span>` : ''}
            </div>
            ${communityRatingHtml}
            ${catalogInfoHtml}
            <div class="beer-detail-stats">
                <span>${avgRating} ★ avg</span>
                <span>${reviewCount} review${reviewCount !== 1 ? 's' : ''}</span>
                ${avgYg ? `<span>${avgYg} YG avg</span>` : ''}
            </div>
            ${myRatingsHtml}
            ${ygContext ? `<p class="beer-detail-yg-context">${ygContext}</p>` : ''}
            <div class="beer-detail-ratings">
                <h4>Ratings</h4>
                ${ratingsList || '<p class="empty-state">No ratings yet.</p>'}
            </div>
            <button type="button" class="btn btn-primary" id="beer-detail-rate-btn">Rate This Beer</button>
        `;

        const rateBtn = document.getElementById('beer-detail-rate-btn');
        if (rateBtn) {
            rateBtn.addEventListener('click', () => {
                this.closeBeerDetail();
                this.prefillRateFormFromBeer({
                    id: beerId || null,
                    name: beer.beer_name,
                    brewery_name: beer.brewery || '',
                    style: beer.style || '',
                    abv: beer.abv ?? null,
                });
            });
        }
        this.fillCheersForCards((beer.ratings || []).slice(0, 20).map(r => r.id));

        // Add direct click handlers to cheers buttons inside modal (stopPropagation blocks delegation)
        body.querySelectorAll('.cheers-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const ratingId = btn.getAttribute('data-rating-id') || btn.dataset.ratingId;
                if (ratingId) {
                    await this.handleCheersClick(btn, ratingId);
                }
            });
        });

        modal.querySelector('.modal-content-beer-detail')?.addEventListener('click', (e) => e.stopPropagation());
        modal.addEventListener('click', (e) => { if (e.target === modal) this.closeBeerDetail(); });
    },

    confirmDeleteRating() {
        const id = this._deleteRatingId;
        this.closeDeleteModal();
        if (!id) return;
        DB.deleteRating(id).then(() => {
            App.toast('Rating deleted', 'success');
            this.allRatings = this.allRatings.filter(r => r.id !== id);
            this.renderRecentReviews();
            this.renderBrowse();
            this.renderLeaderboard();
            this.renderProfile();
            const card = document.querySelector(`[data-rating-id="${id}"]`);
            if (card) {
                card.style.animation = 'fadeOut 0.3s ease-out forwards';
                setTimeout(() => card.remove(), 300);
            }
        }).catch(err => App.toast('Delete failed: ' + err.message, 'error'));
    },

    loadMoreActivity() {
        this.activityPage = (this.activityPage || 1) + 1;
        this.renderActivityFeed(this.activityItems, this.activityPage * 10);
    },

    // ========== APP ENTRY ==========
    async enterApp() {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        if (typeof DB.hydrateCurrentUserProfile === 'function') {
            await DB.hydrateCurrentUserProfile();
        }
        this.setupAdminAccess();
        if (typeof Tabs !== 'undefined' && Tabs && typeof Tabs.init === 'function') {
            Tabs.init();
        }
        if (typeof Admin !== 'undefined' && Admin && typeof Admin.init === 'function') {
            Admin.init();
        }

        const greeting = document.getElementById('user-greeting');
        if (greeting && DB.currentUser) {
            const name = (DB.currentUser.display_name || '').trim() || 'Beer Lover';
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

        this.initBrowseFilters();
        await this.loadAllData();
        this.navigate('dashboard');
        Tracking.trackPageView('/dashboard');
    },

    // ========== DATA LOADING ==========
    async loadAllData(options = {}) {
        const opts = { force: false, ...options };
        // Debounce rapid calls - if called multiple times quickly, only execute once
        if (this._loadAllDataDebounceTimer) {
            clearTimeout(this._loadAllDataDebounceTimer);
        }
        return new Promise((resolve, reject) => {
            this._loadAllDataDebounceTimer = setTimeout(async () => {
                this._loadAllDataDebounceTimer = null;
                try {
                    await this._loadAllDataInternal(opts);
                    resolve();
                } catch (err) {
                    reject(err);
                }
            }, 100); // 100ms debounce - prevents rapid successive calls
        });
    },
    
    async _loadAllDataInternal(options = {}) {
        if (this._loadingAllData) return;
        this._loadingAllData = true;
        const { force = false } = options;
        this.activityPage = 0;
        this.activityItems = [];
        const period = document.querySelector('.lb-tab.active')?.dataset.period || 'alltime';
        try {
            const stats = await DB.getStats();
            this.allRatings = stats.ratings || [];
            if (typeof this.refreshSocialGraph === 'function') {
                if (force || !this._socialGraphLoaded) {
                    await this.refreshSocialGraph({ force });
                    this._socialGraphLoaded = true;
                }
            }

            document.getElementById('stat-beers').textContent = stats.totalBeers ?? 0;
            document.getElementById('stat-avg').textContent = stats.avgRating ?? '0.0';
            document.getElementById('stat-users').textContent = stats.totalUsers ?? 0;
            document.getElementById('stat-reviews').textContent = stats.totalReviews ?? 0;

            const ygValues = (this.allRatings || []).map(r => r.yg_value).filter(v => v != null && Number.isFinite(v));
            document.getElementById('stat-avg-yg').textContent = ygValues.length ? (ygValues.reduce((a, b) => a + b, 0) / ygValues.length).toFixed(1) : '—';

            const [venuesCount, botw] = await Promise.all([DB.getVenuesCount(), DB.getBeerOfTheWeek()]);
            document.getElementById('stat-venues').textContent = venuesCount ?? 0;
            const botwEl = document.getElementById('stat-botw');
            const botwName = (botw && (botw.beer_name || botw.name)) ? (botw.beer_name || botw.name) : '—';
            if (botwEl) botwEl.textContent = botwName;
            const botwTile = document.getElementById('stat-tile-botw');
            if (botwTile) botwTile.setAttribute('data-empty', botwName === '—' ? 'true' : 'false');

            Charts.renderDashboard(this.allRatings);
            this.renderRecentReviews();
            this.populateStyleFilter();
            this.renderBrowse();
            this.renderLeaderboard(period);
            this.renderProfile();
            if (typeof Tabs !== 'undefined' && Tabs) {
                if (typeof Tabs.renderDashboardWidget === 'function') await Tabs.renderDashboardWidget();
                if (typeof Tabs.refreshNotifications === 'function') await Tabs.refreshNotifications();
                if (typeof Tabs.renderTabsLeaderboard === 'function') await Tabs.renderTabsLeaderboard();
                if (typeof Tabs.renderProfileTabsSection === 'function') await Tabs.renderProfileTabsSection();
                if (typeof Tabs.renderMySubmissions === 'function') await Tabs.renderMySubmissions();
            }

            const activityRes = await DB.getActivity();
            this.activityItems = (activityRes && activityRes.data) ? activityRes.data : [];
            this.renderActivityFeed(this.activityItems, 10);
            this.activityPage = 1;
        } catch (err) {
            console.error('Failed to load data:', err);
            App.toast('Failed to load data', 'error');
        } finally {
            this._loadingAllData = false;
        }
    },

    setupAdminAccess() {
        this.isAdmin = !DB.isDemo && !!(DB.currentUser && DB.currentUser.isAdmin);
        const navAdmin = document.getElementById('nav-admin');
        const hamAdmin = document.getElementById('ham-admin');
        const viewAdmin = document.getElementById('view-admin');
        if (navAdmin) navAdmin.style.display = this.isAdmin ? '' : 'none';
        if (hamAdmin) hamAdmin.style.display = this.isAdmin ? '' : 'none';
        if (viewAdmin) viewAdmin.style.display = this.isAdmin ? '' : 'none';
        if (!this.isAdmin && this.currentView === 'admin') {
            this.navigate('dashboard');
        }
    },

    setAdminTab(tabName) {
        if (!this.isAdmin) return;
        const tab = ['users', 'referrals', 'traffic'].includes(tabName) ? tabName : 'users';
        this.adminState.activeTab = tab;
        document.querySelectorAll('.admin-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
        document.querySelectorAll('.admin-tab-content').forEach((content) => {
            content.style.display = content.id === `admin-tab-${tab}` ? '' : 'none';
        });
        if (tab === 'users') this.renderAdminUsers();
        if (tab === 'referrals') this.renderAdminReferrals();
        if (tab === 'traffic') this.renderAdminTraffic();
    },

    async renderAdminDashboard() {
        if (!this.isAdmin) return;
        if (typeof Admin !== 'undefined' && Admin && typeof Admin.renderDashboard === 'function') {
            await Admin.renderDashboard();
            return;
        }
        await this.renderAdminStats();
        this.setAdminTab(this.adminState.activeTab || 'users');
    },

    async renderAdminStats() {
        const container = document.getElementById('admin-stats');
        if (!container) return;
        try {
            const stats = await DB.adminGetStats();
            container.innerHTML = `
                <div class="stat-card"><div class="stat-value">${stats.total_users ?? 0}</div><div class="stat-label">Users</div></div>
                <div class="stat-card"><div class="stat-value">${stats.total_ratings ?? 0}</div><div class="stat-label">Ratings</div></div>
                <div class="stat-card"><div class="stat-value">${stats.mau ?? 0}</div><div class="stat-label">MAU</div></div>
                <div class="stat-card"><div class="stat-value">${stats.wau ?? 0}</div><div class="stat-label">WAU</div></div>
                <div class="stat-card"><div class="stat-value">${stats.dau ?? 0}</div><div class="stat-label">DAU</div></div>
                <div class="stat-card"><div class="stat-value">${stats.total_referral_clicks ?? 0}</div><div class="stat-label">Referral Clicks</div></div>
                <div class="stat-card"><div class="stat-value">${stats.new_users_this_week ?? 0}</div><div class="stat-label">New Users (7d)</div></div>
                <div class="stat-card"><div class="stat-value">${stats.ratings_this_week ?? 0}</div><div class="stat-label">Ratings (7d)</div></div>
            `;
        } catch (err) {
            container.innerHTML = '<p class="empty-state">Failed to load admin stats.</p>';
        }
    },

    async renderAdminUsers() {
        if (!this.isAdmin) return;
        const table = document.getElementById('admin-users-table');
        if (!table) return;
        const sort = document.getElementById('admin-user-sort')?.value || 'last_active';
        const search = document.getElementById('admin-user-search')?.value || '';
        try {
            const out = await DB.adminGetUsers({ sort, search, limit: 50, offset: 0 });
            const rows = Array.isArray(out?.data) ? out.data : [];
            table.innerHTML = `
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>User</th><th>Email</th><th>Ratings</th><th>Styles</th>
                            <th>Venues</th><th>Avg Rating</th><th>Last Active</th><th>Joined</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map((u) => `
                            <tr>
                                <td>${Utils.escapeHtml(u.display_name || '—')}</td>
                                <td>${Utils.escapeHtml(u.email || '—')}</td>
                                <td>${u.total_ratings ?? 0}</td>
                                <td>${u.unique_styles ?? 0}</td>
                                <td>${u.unique_venues ?? 0}</td>
                                <td>${u.avg_rating ?? '—'}</td>
                                <td>${u.last_active ? Utils.timeAgo(u.last_active) : 'Never'}</td>
                                <td>${u.created_at ? Utils.formatDate(u.created_at) : '—'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } catch (err) {
            table.innerHTML = '<p class="empty-state">Failed to load users.</p>';
        }
    },

    async renderAdminReferrals() {
        if (!this.isAdmin) return;
        const type = document.getElementById('admin-referral-type')?.value || '';
        const from = document.getElementById('admin-referral-from')?.value || '';
        const to = document.getElementById('admin-referral-to')?.value || '';
        const summaryEl = document.getElementById('admin-referral-summary');
        const topEl = document.getElementById('admin-referral-top');
        const logEl = document.getElementById('admin-referral-log');
        if (!summaryEl || !topEl || !logEl) return;

        try {
            const [summary, log] = await Promise.all([
                DB.adminGetReferralSummary({ target_type: type, from, to }),
                DB.adminGetReferrals({ target_type: type, from, to, limit: 100, offset: 0 }),
            ]);
            const byType = summary.by_target_type || {};
            summaryEl.innerHTML = `
                <div class="admin-stats-grid">
                    <div class="stat-card"><div class="stat-value">${summary.total_clicks ?? 0}</div><div class="stat-label">Total Clicks</div></div>
                    <div class="stat-card"><div class="stat-value">${byType.brewery?.clicks ?? 0}</div><div class="stat-label">Brewery Clicks</div></div>
                    <div class="stat-card"><div class="stat-value">${byType.venue?.clicks ?? 0}</div><div class="stat-label">Venue Clicks</div></div>
                    <div class="stat-card"><div class="stat-value">${byType.external?.clicks ?? 0}</div><div class="stat-label">External Clicks</div></div>
                </div>
            `;
            topEl.innerHTML = `
                <h3>Top Breweries by Clicks</h3>
                <table class="admin-table">
                    <thead><tr><th>Brewery</th><th>Clicks</th><th>Unique Users</th></tr></thead>
                    <tbody>
                        ${(summary.top_breweries || []).map((b) => `<tr><td>${Utils.escapeHtml(b.target_name || 'Unknown')}</td><td>${b.clicks}</td><td>${b.unique_users}</td></tr>`).join('')}
                    </tbody>
                </table>
                <h3>Top Venues by Clicks</h3>
                <table class="admin-table">
                    <thead><tr><th>Venue</th><th>Clicks</th><th>Unique Users</th></tr></thead>
                    <tbody>
                        ${(summary.top_venues || []).map((v) => `<tr><td>${Utils.escapeHtml(v.target_name || 'Unknown')}</td><td>${v.clicks}</td><td>${v.unique_users}</td></tr>`).join('')}
                    </tbody>
                </table>
            `;
            const logRows = Array.isArray(log?.data) ? log.data : [];
            logEl.innerHTML = `
                <h3>Recent Referral Clicks</h3>
                <table class="admin-table">
                    <thead><tr><th>Time</th><th>Type</th><th>Target</th><th>Destination</th><th>User</th></tr></thead>
                    <tbody>
                        ${logRows.map((r) => `<tr>
                            <td>${r.created_at ? Utils.formatDate(r.created_at) : '—'}</td>
                            <td>${Utils.escapeHtml(r.target_type || 'external')}</td>
                            <td>${Utils.escapeHtml(r.target_name || r.target_id || '—')}</td>
                            <td><a href="${Utils.escapeHtml(r.destination_url || '#')}" target="_blank" rel="noopener">Open</a></td>
                            <td>${Utils.escapeHtml(r.user_id || 'guest')}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            `;
        } catch (err) {
            summaryEl.innerHTML = '<p class="empty-state">Failed to load referral analytics.</p>';
            topEl.innerHTML = '';
            logEl.innerHTML = '';
        }
    },

    async renderAdminTraffic() {
        if (!this.isAdmin) return;
        const from = document.getElementById('admin-referral-from')?.value || '';
        const to = document.getElementById('admin-referral-to')?.value || '';
        const statsEl = document.getElementById('admin-traffic-stats');
        const pagesEl = document.getElementById('admin-traffic-pages');
        if (!statsEl || !pagesEl) return;
        try {
            const traffic = await DB.adminGetTraffic({ from, to });
            statsEl.innerHTML = `
                <div class="admin-stats-grid">
                    <div class="stat-card"><div class="stat-value">${traffic.total_views ?? 0}</div><div class="stat-label">Views</div></div>
                    <div class="stat-card"><div class="stat-value">${traffic.unique_sessions ?? 0}</div><div class="stat-label">Sessions</div></div>
                    <div class="stat-card"><div class="stat-value">${traffic.unique_users ?? 0}</div><div class="stat-label">Users</div></div>
                </div>
            `;
            pagesEl.innerHTML = `
                <h3>Top Pages</h3>
                <table class="admin-table">
                    <thead><tr><th>Path</th><th>Views</th><th>Unique Users</th></tr></thead>
                    <tbody>
                        ${(traffic.top_pages || []).map((p) => `<tr><td>${Utils.escapeHtml(p.page_path)}</td><td>${p.views}</td><td>${p.unique_users}</td></tr>`).join('')}
                    </tbody>
                </table>
            `;
        } catch (err) {
            statsEl.innerHTML = '<p class="empty-state">Failed to load traffic analytics.</p>';
            pagesEl.innerHTML = '';
        }
    },

    // ========== NAVIGATION ==========
    navigate(viewId) {
        if (viewId === 'admin' && !this.isAdmin) {
            if (this.currentView !== 'dashboard') {
                this.navigate('dashboard');
            }
            return;
        }
        this._previousView = this.currentView;
        this.currentView = viewId;
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

        const view = document.getElementById(`view-${viewId}`);
        const btn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
        const hamburgerBtn = document.querySelector(`.ham-link[data-view="${viewId}"]`);
        const desktopNavLink = document.querySelector(`.desktop-nav-link[data-view="${viewId}"]`);

        if (view) { view.classList.add('active'); view.style.animation = 'none'; view.offsetHeight; view.style.animation = ''; }
        if (btn) btn.classList.add('active');
        document.querySelectorAll('.ham-link[data-view]').forEach(b => b.classList.remove('active'));
        if (hamburgerBtn) hamburgerBtn.classList.add('active');
        // Sync bottom tab nav active state
        document.querySelectorAll('#bottom-tab-nav .tab-item').forEach(t => t.classList.remove('active'));
        const bottomTab = document.querySelector(`#bottom-tab-nav .tab-item[data-view="${viewId}"]`);
        if (bottomTab) bottomTab.classList.add('active');
        // Sync desktop nav active state
        document.querySelectorAll('.desktop-nav-link[data-view]').forEach(link => link.classList.remove('active'));
        if (desktopNavLink) desktopNavLink.classList.add('active');

        if (viewId === 'dashboard' || viewId === 'profile') {
            setTimeout(() => { Object.values(Charts.instances).forEach(c => c.resize()); }, 100);
        }
        if (viewId === 'exchange' && typeof Exchange !== 'undefined' && typeof Exchange.load === 'function') {
            setTimeout(() => Exchange.load(), 50);
        }
        if (viewId === 'map' && typeof MapView !== 'undefined' && typeof MapView.onShow === 'function') {
            setTimeout(() => MapView.onShow(), 100);
        }
        if (viewId === 'browse') {
            this.renderBrowse();
            if (this.browseTab === 'catalog' && !this.catalogItems.length && !this.catalogLoading) {
                this.refreshCatalogBrowse();
            }
        }
        if (viewId === 'rate') {
            try {
                const breweryName = sessionStorage.getItem('beerbook_rate_brewery_name');
                if (breweryName) {
                    const breweryInput = document.getElementById('beer-brewery');
                    if (breweryInput) breweryInput.value = breweryName;
                    sessionStorage.removeItem('beerbook_rate_brewery_name');
                }
            } catch (_) {}
        }
        if (viewId === 'admin' && this.isAdmin) {
            this.renderAdminDashboard();
        }
        Tracking.trackPageView(`/${viewId}`);
    },

    // ========== RENDERS ==========
    renderRecentReviews() {
        const container = document.getElementById('recent-reviews');
        const recent = this.allRatings.slice(0, 5);
        const currentUserId = DB.currentUser && DB.currentUser.id;
        if (!recent.length) {
            container.innerHTML = '<p class="empty-state cta-empty">🍺 No beers rated yet. Be the first to crack one open!</p><button type="button" class="btn btn-primary" data-view="rate">Rate a Beer</button>';
            container.querySelector('.btn')?.addEventListener('click', () => this.navigate('rate'));
            return;
        }
        container.innerHTML = recent.map(r => {
            const canDelete = currentUserId && r.user_id === currentUserId;
            const ygBadge = (r.yg_value != null && r.yg_value > 0) ? ` <span class="yg-badge-pill">${r.yg_value} YG</span>` : '';
            const beerIdAttr = (r.beer_id) ? ` data-beer-id="${Utils.escapeHtml(r.beer_id)}"` : '';
            return `<div class="review-card" data-rating-id="${r.id}" data-user-id="${Utils.escapeHtml(r.user_id || '')}" data-user-name="${Utils.escapeHtml(r.user_name || 'Anonymous')}">
                <div class="review-rating">${this.ratingEmoji(r.rating)}</div>
                <div class="review-content">
                    <div class="review-beer-name"><span class="beer-name-link" data-beer-name="${Utils.escapeHtml(r.beer_name)}" data-beer-brewery="${Utils.escapeHtml(r.brewery || '')}" data-beer-style="${Utils.escapeHtml(r.style || '')}"${beerIdAttr} role="button" tabindex="0">${Utils.escapeHtml(r.beer_name)}</span></div>
                    <div class="review-meta">${Utils.escapeHtml(r.brewery || '')}${r.brewery && r.style ? ' · ' : ''}${r.style ? `<span class="style-tooltip" data-style="${Utils.escapeHtml(r.style)}">${Utils.escapeHtml(r.style)}</span>` : ''}${r.abv ? ` · ${r.abv}%` : ''}</div>
                    <div class="review-stars">${Utils.stars(r.rating)}${ygBadge}</div>
                    ${r.notes ? `<div class="review-notes">${Utils.escapeHtml(Utils.truncate(r.notes, 150))}</div>` : ''}
                    <div class="review-user">— ${Utils.escapeHtml(r.user_name || 'Anonymous')} · ${Utils.timeAgo(r.created_at)}</div>
                </div>
                <div class="review-actions">
                    ${this.cheersButtonHtml(r.id)}
                    ${canDelete ? `<button type="button" class="review-delete" aria-label="Delete rating" data-rating-id="${r.id}">🗑️</button>` : ''}
                </div>
            </div>`;
        }).join('');
        this.fillCheersForCards(recent.map(r => r.id));
        container.querySelectorAll('.review-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                this._deleteRatingId = btn.dataset.ratingId;
                document.getElementById('delete-modal-message').textContent = `Delete your rating of ${Utils.escapeHtml(this.allRatings.find(x => x.id === btn.dataset.ratingId)?.beer_name || 'this beer')}? This can't be undone.`;
                document.getElementById('delete-modal').style.display = 'flex';
            });
        });
    },

    async setBrowseTab(tab) {
        const nextTab = tab === 'catalog' ? 'catalog' : 'community';
        if (this.browseTab === nextTab) return;
        this.browseTab = nextTab;
        this.catalogExpandedId = null;
        this.setCatalogSortOptions();
        const filterBtn = document.getElementById('btn-open-filters');
        const sortChip = document.getElementById('sort-label');
        const overlay = document.getElementById('browse-filter-sheet');
        if (overlay) overlay.classList.remove('open');
        document.body.style.overflow = '';
        if (filterBtn) filterBtn.style.display = this.browseTab === 'community' ? '' : 'none';
        if (sortChip) sortChip.style.display = this.browseTab === 'community' ? '' : 'none';
        if (this.browseTab === 'catalog') {
            await this.ensureCatalogStyles();
            this.populateStyleFilter();
            await this.refreshCatalogBrowse();
        } else {
            this.populateStyleFilter();
            this.browseShownCount = 24;
            this.renderBrowse();
        }
    },

    setCatalogSortOptions() {
        const select = document.getElementById('sort-by');
        if (!select) return;
        const current = select.value;
        if (this.browseTab === 'catalog') {
            select.innerHTML = `
                <option value="name_asc">Name A-Z</option>
                <option value="abv_desc">ABV (High to Low)</option>
                <option value="abv_asc">ABV (Low to High)</option>
                <option value="review_overall_desc">Expert Rating</option>
                <option value="review_count_desc">Review Count</option>
            `;
            const allowed = new Set(['name_asc', 'abv_desc', 'abv_asc', 'review_overall_desc', 'review_count_desc']);
            select.value = allowed.has(current) ? current : 'name_asc';
        } else {
            select.innerHTML = `
                <option value="recent">Most Recent</option>
                <option value="highest">Highest Rated</option>
                <option value="lowest">Lowest Rated</option>
                <option value="name">Alphabetical</option>
            `;
            const allowed = new Set(['recent', 'highest', 'lowest', 'name']);
            select.value = allowed.has(current) ? current : 'recent';
        }
    },

    async ensureCatalogStyles() {
        if (this.catalogStyles.length || DB.isDemo) return;
        try {
            this.catalogStyles = await DB.getCatalogStyles();
        } catch (e) {
            console.warn('Failed to load catalog styles', e);
            this.catalogStyles = [];
        }
    },

    getCatalogSortParams() {
        const sortBy = document.getElementById('sort-by')?.value || 'name_asc';
        switch (sortBy) {
            case 'abv_desc': return { sort: 'abv', order: 'desc' };
            case 'abv_asc': return { sort: 'abv', order: 'asc' };
            case 'review_overall_desc': return { sort: 'review_overall', order: 'desc' };
            case 'review_count_desc': return { sort: 'review_count', order: 'desc' };
            default: return { sort: 'name', order: 'asc' };
        }
    },

    async refreshCatalogBrowse() {
        if (this.browseTab !== 'catalog') return;
        this.catalogItems = [];
        this.catalogOffset = 0;
        this.catalogTotal = 0;
        this.catalogHasMore = false;
        this.catalogExpandedId = null;
        await this.loadNextCatalogPage(true);
    },

    async loadNextCatalogPage(reset = false) {
        if (this.catalogLoading || this.browseTab !== 'catalog') return;
        if (DB.isDemo) {
            this.catalogItems = [];
            this.catalogTotal = 0;
            this.catalogHasMore = false;
            this.renderBrowse();
            return;
        }
        const loadingEl = document.getElementById('browse-loading');
        this.catalogLoading = true;
        if (loadingEl) loadingEl.style.display = 'block';
        try {
            const search = (document.getElementById('search-input')?.value || '').trim();
            const style = (document.getElementById('filter-style')?.value || '').trim();
            const { sort, order } = this.getCatalogSortParams();
            const out = await DB.browseCatalog({
                limit: this.catalogLimit,
                offset: this.catalogOffset,
                sort,
                order,
                style,
                q: search,
            });
            const rows = Array.isArray(out?.data) ? out.data : [];
            if (reset) {
                this.catalogItems = rows;
            } else {
                this.catalogItems = this.catalogItems.concat(rows);
            }
            this.catalogOffset += rows.length;
            this.catalogTotal = out?.pagination?.total ?? this.catalogItems.length;
            this.catalogHasMore = this.catalogOffset < this.catalogTotal;
            this.renderBrowse();
        } catch (err) {
            console.error('Catalog browse failed:', err);
            App.toast('Failed to load catalog beers', 'error');
        } finally {
            this.catalogLoading = false;
            if (loadingEl) loadingEl.style.display = 'none';
        }
    },

    renderBrowse() {
        document.querySelectorAll('.browse-tab').forEach((tabBtn) => {
            const active = (tabBtn.dataset.tab || 'community') === this.browseTab;
            tabBtn.classList.toggle('active', active);
            tabBtn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        const filterBtn = document.getElementById('btn-open-filters');
        const sortChip = document.getElementById('sort-label');
        if (filterBtn) filterBtn.style.display = this.browseTab === 'community' ? '' : 'none';
        if (sortChip) {
            const labels = {
                recent: 'Most Recent',
                highest: 'Highest Rated',
                lowest: 'Lowest Rated',
                name: 'Alphabetical',
            };
            sortChip.style.display = this.browseTab === 'community' ? '' : 'none';
            sortChip.textContent = labels[this._browseSortBy] || 'Most Recent';
        }
        const sortOpts = document.querySelectorAll('#browse-filter-sheet [data-filter="sort"] .filter-sheet__opt');
        sortOpts.forEach((opt) => {
            opt.classList.toggle('active', opt.dataset.value === (this._browseSortBy || 'recent'));
        });
        const communityGrid = document.getElementById('beer-feed');
        const catalogGrid = document.getElementById('catalog-grid');
        if (communityGrid) communityGrid.style.display = this.browseTab === 'community' ? '' : 'none';
        if (catalogGrid) catalogGrid.style.display = this.browseTab === 'catalog' ? 'grid' : 'none';
        if (this.browseTab === 'catalog') {
            this.renderCatalogBrowse();
            return;
        }
        this.renderCommunityBrowse();
    },

    renderCommunityBrowse() {
        const container = document.getElementById('beer-feed');
        if (!container) return;

        const hiddenStyleSelect = document.getElementById('filter-style');
        const hiddenSortSelect = document.getElementById('sort-by');
        let filtered = [...(this.allRatings || [])];

        const query = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
        if (query) {
            filtered = filtered.filter((r) =>
                (r.beer_name || '').toLowerCase().includes(query) ||
                (r.brewery || '').toLowerCase().includes(query) ||
                (r.style || '').toLowerCase().includes(query)
            );
        }

        const styleFilter = this._browseStyleFilter || hiddenStyleSelect?.value || '';
        if (styleFilter) {
            filtered = filtered.filter((r) => r.style === styleFilter);
        }

        const sortBy = this._browseSortBy || hiddenSortSelect?.value || 'recent';
        switch (sortBy) {
            case 'highest':
                filtered.sort((a, b) => b.rating - a.rating);
                break;
            case 'lowest':
                filtered.sort((a, b) => a.rating - b.rating);
                break;
            case 'name':
                filtered.sort((a, b) => (a.beer_name || '').localeCompare(b.beer_name || ''));
                break;
            case 'recent':
            default:
                filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }

        this._browseFilteredLength = filtered.length;
        if (!filtered.length) {
            if (!this.allRatings?.length) {
                container.innerHTML = '<p class="empty-state cta-empty">🍺 No beers rated yet. Be the first!</p><button type="button" class="btn btn-primary" data-view="rate">Rate a Beer</button>';
                container.querySelector('.btn')?.addEventListener('click', () => this.navigate('rate'));
            } else {
                container.innerHTML = '<p class="empty-state">No beers match your search.</p>';
            }
            const sentinel = document.getElementById('browse-sentinel');
            if (sentinel) sentinel.style.display = 'none';
            return;
        }

        const showCount = this.browseShownCount || 24;
        const visibleRatings = filtered.slice(0, showCount);
        container.innerHTML = visibleRatings.map((r, i) => {
            const initials = Utils.initials(r.user_name || 'Anonymous') || '🍺';
            const avatarColors = [
                'linear-gradient(135deg, #F4B223 0%, #FF9F1C 100%)',
                'linear-gradient(135deg, #48BB78 0%, #3BA894 100%)',
                'linear-gradient(135deg, #E87461 0%, #D4527A 100%)',
                'linear-gradient(135deg, #7C6CF0 0%, #5A4BD1 100%)',
                'linear-gradient(135deg, #60A5FA 0%, #3B82F6 100%)',
                'linear-gradient(135deg, #F6AD55 0%, #ED8936 100%)',
            ];
            const colorIdx = (r.user_name || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % avatarColors.length;
            const beerIdAttr = (r.beer_id) ? ` data-beer-id="${Utils.escapeHtml(r.beer_id)}"` : '';
            const venueTypeRaw = (r.venue?.venue_type || r.venue_type || r.venue?.brewery_type || r.brewery_type || '').toString().toLowerCase();
            let venuePillHtml = '';
            if (venueTypeRaw) {
                let pillClass = 'venue-type-pill--bar';
                let pillLabel = 'Bar';
                if (['micro', 'regional', 'large', 'nano'].includes(venueTypeRaw) || (venueTypeRaw.includes('brew') && !venueTypeRaw.includes('pub'))) {
                    pillClass = 'venue-type-pill--brewery';
                    pillLabel = 'Brewery';
                } else if (
                    ['brewpub', 'bar'].includes(venueTypeRaw) ||
                    venueTypeRaw.includes('pub') ||
                    venueTypeRaw.includes('taproom') ||
                    venueTypeRaw.includes('beergarden')
                ) {
                    pillClass = 'venue-type-pill--bar';
                    pillLabel = 'Bar';
                } else if (venueTypeRaw.includes('restaurant') || venueTypeRaw.includes('dining')) {
                    pillClass = 'venue-type-pill--restaurant';
                    pillLabel = 'Restaurant';
                }
                venuePillHtml = `<span class="venue-type-pill ${pillClass}">${pillLabel}</span>`;
            }

            const venueHtml = r.location_name ? `
                <div class="rating-card__venue">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"/>
                        <circle cx="12" cy="10" r="3"/>
                    </svg>
                    <span class="rating-card__venue-name">${Utils.escapeHtml(r.location_name)}</span>
                    ${venuePillHtml}
                </div>
            ` : '';

            const ygHtml = (r.yg_value != null && r.yg_value > 0)
                ? `<span class="rating-card__tag rating-card__tag--yg">${Number(r.yg_value)} YG</span>`
                : '';
            const cheersCount = Number(r.cheers_count || 0);

            return `
                <div class="rating-card" data-user-id="${Utils.escapeHtml(r.user_id || '')}" data-user-name="${Utils.escapeHtml(r.user_name || 'Anonymous')}" style="animation-delay: ${Math.min(i * 0.07, 0.35)}s">
                    <div class="rating-card__header">
                        <div class="rating-card__avatar" style="background: ${avatarColors[colorIdx]}">${Utils.escapeHtml(initials)}</div>
                        <div class="rating-card__user-info">
                            <div class="rating-card__username">${Utils.escapeHtml(r.user_name || 'Anonymous')}</div>
                            <div class="rating-card__time">${Utils.timeAgo(r.created_at)}</div>
                        </div>
                        <div class="rating-card__score">
                            <span class="rating-card__score-value">${Number(r.rating || 0) % 1 === 0 ? String(Number(r.rating || 0)) : Number(r.rating || 0).toFixed(1)}</span>
                            <span class="rating-card__score-max">/5</span>
                        </div>
                    </div>
                    ${r.photo_url ? `<img class="rating-card__photo" src="${Utils.escapeHtml(r.photo_url)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
                    <div class="rating-card__body">
                        <div class="rating-card__beer-name"><span class="beer-name-link" data-beer-name="${Utils.escapeHtml(r.beer_name || '')}" data-beer-brewery="${Utils.escapeHtml(r.brewery || '')}" data-beer-style="${Utils.escapeHtml(r.style || '')}"${beerIdAttr} role="button" tabindex="0">${Utils.escapeHtml(r.beer_name || 'Unknown Beer')}</span></div>
                        ${r.brewery ? `<div class="rating-card__brewery">${Utils.escapeHtml(r.brewery)}</div>` : ''}
                        <div class="rating-card__tags">
                            ${r.style ? `<span class="rating-card__tag rating-card__tag--style style-tooltip" data-style="${Utils.escapeHtml(r.style)}">${Utils.escapeHtml(r.style)}</span>` : ''}
                            ${r.abv ? `<span class="rating-card__tag rating-card__tag--abv">${Utils.escapeHtml(String(r.abv))}% ABV</span>` : ''}
                            ${ygHtml}
                        </div>
                        <div class="rating-card__stars">${Utils.stars(r.rating)}</div>
                        ${r.notes ? `<div class="beer-card-notes">${Utils.escapeHtml(Utils.truncate(r.notes, 100))}</div>` : ''}
                        ${venueHtml}
                    </div>
                    <div class="rating-card__footer">
                        <button type="button" class="rating-card__action cheers-btn" data-rating-id="${Utils.escapeHtml(r.id)}">
                            🍻 <span class="cheers-count">${cheersCount || ''}</span>
                        </button>
                        <button type="button" class="rating-card__action" aria-label="Comments">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>
                            </svg>
                        </button>
                        <button type="button" class="rating-card__action" aria-label="Share">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/>
                                <circle cx="18" cy="19" r="3"/>
                                <path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98"/>
                            </svg>
                            Share
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        this.fillCheersForCards(visibleRatings.map((r) => r.id).filter(Boolean));
        const sentinel = document.getElementById('browse-sentinel');
        if (sentinel) sentinel.style.display = filtered.length > showCount ? 'block' : 'none';
    },

    _catalogFlavorPercent(rawValue) {
        const value = Number(rawValue);
        if (!Number.isFinite(value) || value <= 0) return 0;
        if (value <= 5) return Math.round((value / 5) * 100);
        if (value <= 10) return Math.round((value / 10) * 100);
        if (value <= 100) return Math.round(value);
        if (value <= 200) return Math.round(value / 2);
        return 100;
    },

    _catalogFlavorRows(flavors, maxItems = 4) {
        const entries = Object.entries(flavors || {})
            .map(([name, raw]) => ({ name, raw, pct: this._catalogFlavorPercent(raw) }))
            .filter(x => x.pct > 0)
            .sort((a, b) => b.pct - a.pct)
            .slice(0, maxItems);
        if (!entries.length) return '<div class="catalog-flavor-empty">No flavor profile available</div>';
        return entries.map((entry) => {
            const label = entry.name.charAt(0).toUpperCase() + entry.name.slice(1);
            return `<div class="catalog-flavor-row">
                <div class="catalog-flavor-track"><span class="catalog-flavor-fill" style="width:${entry.pct}%"></span></div>
                <span class="catalog-flavor-label">${Utils.escapeHtml(label)} ${Math.round(entry.pct / 20)}</span>
            </div>`;
        }).join('');
    },

    renderCatalogBrowse() {
        const container = document.getElementById('catalog-grid');
        const sentinel = document.getElementById('browse-sentinel');
        if (!container) return;
        const items = this.catalogItems || [];
        if (!items.length) {
            container.innerHTML = this.catalogLoading
                ? '<p class="empty-state">Loading catalog…</p>'
                : '<p class="empty-state">No catalog beers match your filters.</p>';
            if (sentinel) sentinel.style.display = 'none';
            return;
        }
        container.innerHTML = items.map((beer) => {
            const detailOpen = this.catalogExpandedId === beer.id;
            const expert = beer?.reviews?.overall ?? beer.review_overall;
            const reviewCount = beer?.reviews?.count ?? beer.review_count ?? 0;
            const ibuRange = (beer.ibu_min != null || beer.ibu_max != null)
                ? `${beer.ibu_min != null ? beer.ibu_min : '—'}-${beer.ibu_max != null ? beer.ibu_max : '—'}`
                : null;
            const detailReviews = beer.reviews || {};
            return `<article class="catalog-card${detailOpen ? ' is-open' : ''}" data-catalog-id="${Utils.escapeHtml(beer.id)}">
                <div class="catalog-card-title">📚 ${Utils.escapeHtml(beer.name || 'Unknown Beer')}</div>
                <div class="catalog-card-subtitle">${Utils.escapeHtml(beer.brewery_name || 'Unknown Brewery')}${beer.abv != null ? ` · ${Utils.escapeHtml(String(beer.abv))}%` : ''}</div>
                <div class="catalog-card-meta">
                    ${beer.style ? `<span class="beer-card-tag style-tooltip" data-style="${Utils.escapeHtml(beer.style)}">${Utils.escapeHtml(beer.style)}</span>` : ''}
                    ${ibuRange ? `<span class="catalog-ibu">IBU: ${Utils.escapeHtml(ibuRange)}</span>` : ''}
                </div>
                ${beer.description ? `<div class="catalog-card-description">${Utils.escapeHtml(beer.description)}</div>` : ''}
                <div class="catalog-flavors">${this._catalogFlavorRows(beer.flavors, 4)}</div>
                <div class="catalog-card-footer">
                    <span class="catalog-score">⭐ ${expert != null ? Utils.escapeHtml(String(expert)) : '—'} expert avg · ${Number(reviewCount || 0).toLocaleString()} reviews</span>
                    <button type="button" class="btn btn-ghost btn-sm catalog-rate-btn" data-catalog-id="${Utils.escapeHtml(beer.id)}">Rate →</button>
                </div>
                ${detailOpen ? `<div class="catalog-card-detail">
                    ${beer.description ? `<p class="catalog-detail-description">${Utils.escapeHtml(beer.description)}</p>` : ''}
                    <div class="catalog-detail-grid">
                        <div><strong>IBU:</strong> ${ibuRange ? Utils.escapeHtml(ibuRange) : '—'}</div>
                        <div><strong>Aroma:</strong> ${detailReviews.aroma ?? '—'}</div>
                        <div><strong>Appearance:</strong> ${detailReviews.appearance ?? '—'}</div>
                        <div><strong>Palate:</strong> ${detailReviews.palate ?? '—'}</div>
                        <div><strong>Taste:</strong> ${detailReviews.taste ?? '—'}</div>
                        <div><strong>Overall:</strong> ${detailReviews.overall ?? '—'}</div>
                    </div>
                    <div class="catalog-flavors catalog-flavors-all">${this._catalogFlavorRows(beer.flavors, 11)}</div>
                    <button type="button" class="btn btn-primary btn-sm catalog-detail-rate-btn" data-catalog-id="${Utils.escapeHtml(beer.id)}">Rate This Beer</button>
                </div>` : ''}
            </article>`;
        }).join('');

        container.querySelectorAll('.catalog-card').forEach((cardEl) => {
            cardEl.addEventListener('click', (e) => {
                if (e.target.closest('.catalog-rate-btn') || e.target.closest('.catalog-detail-rate-btn')) return;
                const id = cardEl.dataset.catalogId;
                this.catalogExpandedId = this.catalogExpandedId === id ? null : id;
                this.renderCatalogBrowse();
            });
        });
        container.querySelectorAll('.catalog-rate-btn, .catalog-detail-rate-btn').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const id = btn.dataset.catalogId;
                const beer = (this.catalogItems || []).find((b) => b.id === id);
                if (!beer) return;
                this.prefillRateFormFromBeer(beer);
            });
        });

        if (sentinel) sentinel.style.display = this.catalogHasMore ? 'block' : 'none';
    },

    renderLeaderboard(period = 'alltime') {
        let ratings = this.allRatings || [];
        if (period === 'weekly') {
            const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
            ratings = ratings.filter(r => new Date(r.created_at).getTime() >= since);
        } else if (period === 'monthly') {
            const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
            ratings = ratings.filter(r => new Date(r.created_at).getTime() >= since);
        }

        const userCounts = Utils.countBy(ratings, 'user_name');
        const topReviewers = Object.entries(userCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
        document.getElementById('lb-reviewers').innerHTML = topReviewers.length
            ? topReviewers.map(([name, count], i) => `<div class="lb-row"><span class="lb-rank">${i < 3 ? ['🥇','🥈','🥉'][i] : (i+1)}</span><span class="lb-name">${Utils.escapeHtml(name)}</span><span class="lb-value">${count} reviews</span></div>`).join('')
            : '<p class="empty-state">No data yet</p>';

        const beerMap = {};
        ratings.forEach(r => { const k = r.beer_name; if (!beerMap[k]) beerMap[k] = { sum: 0, count: 0 }; beerMap[k].sum += r.rating; beerMap[k].count++; });
        const topBeers = Object.entries(beerMap).map(([name, { sum, count }]) => ({ name, avg: sum / count, count })).sort((a, b) => b.avg - a.avg || b.count - a.count).slice(0, 10);
        document.getElementById('lb-beers').innerHTML = topBeers.length
            ? topBeers.map((b, i) => `<div class="lb-row"><span class="lb-rank">${i < 3 ? ['🥇','🥈','🥉'][i] : (i+1)}</span><span class="lb-name">${Utils.escapeHtml(b.name)}</span><span class="lb-value">${b.avg.toFixed(1)} ★</span></div>`).join('')
            : '<p class="empty-state">No data yet</p>';

        const styleMap = {};
        ratings.forEach(r => { if (!r.style) return; if (!styleMap[r.style]) styleMap[r.style] = { sum: 0, count: 0 }; styleMap[r.style].sum += r.rating; styleMap[r.style].count++; });
        const topStyles = Object.entries(styleMap).map(([style, { sum, count }]) => ({ style, avg: sum / count, count })).sort((a, b) => b.avg - a.avg).slice(0, 10);
        document.getElementById('lb-styles').innerHTML = topStyles.length
            ? topStyles.map((s, i) => `<div class="lb-row"><span class="lb-rank">${i < 3 ? ['🥇','🥈','🥉'][i] : (i+1)}</span><span class="lb-name">${Utils.escapeHtml(s.style)}</span><span class="lb-value">${s.avg.toFixed(1)} ★ (${s.count})</span></div>`).join('')
            : '<p class="empty-state">No data yet</p>';

        const mostReviewed = Object.entries(beerMap).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
        document.getElementById('lb-popular').innerHTML = mostReviewed.length
            ? mostReviewed.map(([name, { count }], i) => `<div class="lb-row"><span class="lb-rank">${i < 3 ? ['🥇','🥈','🥉'][i] : (i+1)}</span><span class="lb-name">${Utils.escapeHtml(name)}</span><span class="lb-value">${count} reviews</span></div>`).join('')
            : '<p class="empty-state">No data yet</p>';

        const lbCheers = document.getElementById('lb-cheers');
        if (lbCheers) {
            let mostCheered = [];
            if (DB.isDemo) {
                const raw = Utils.storage.get(this._demoCheersKey) || {};
                const byCount = [];
                for (const [ratingId, entry] of Object.entries(raw)) {
                    const c = entry && (entry.count || entry.userIds?.length || 0);
                    if (c > 0) {
                        const r = (this.allRatings || []).find(x => x.id === ratingId);
                        byCount.push({ ratingId, count: c, beerName: r ? r.beer_name : ratingId });
                    }
                }
                mostCheered = byCount.sort((a, b) => b.count - a.count).slice(0, 10);
            }
            lbCheers.innerHTML = mostCheered.length
                ? mostCheered.map((c, i) => `<div class="lb-row"><span class="lb-rank">${i < 3 ? ['🥇','🥈','🥉'][i] : (i+1)}</span><span class="lb-name">${Utils.escapeHtml(c.beerName)}</span><span class="lb-value">🍻 ${c.count}</span></div>`).join('')
                : '<p class="empty-state">No data yet</p>';
        }
    },

    renderActivityFeed(items, showCount = 10) {
        const container = document.getElementById('activity-feed');
        const skeleton = document.getElementById('activity-skeleton');
        const loadMoreBtn = document.getElementById('activity-load-more');
        if (!container) return;
        if (skeleton) skeleton.innerHTML = '';
        const list = (items || []).slice(0, showCount);
        if (!items || items.length === 0) {
            container.innerHTML = '<p class="empty-state">📋 No activity yet. Rate a beer to get things started!</p>';
            if (loadMoreBtn) loadMoreBtn.style.display = 'none';
            return;
        }
        container.innerHTML = list.map(item => {
            if (item.type === 'venue') {
                return `<div class="activity-item">
                    <div class="activity-avatar">📍</div>
                    <div class="activity-body">
                        <div class="activity-text">${Utils.escapeHtml(item.name || 'Venue')} discovered</div>
                        <div class="activity-meta">${Utils.timeAgo(item.created_at)}</div>
                    </div>
                </div>`;
            }
            const name = item.user_name || 'Someone';
            const initials = Utils.initials(name) || '🍺';
            const ygBadge = (item.yg_value != null && item.yg_value > 0) ? ` <span class="yg-badge-pill">${Number(item.yg_value)} YG</span>` : '';
            const cheers = (item.cheers_count > 0) ? ` · 🍻 ${item.cheers_count} cheers` : '';
            const beerName = item.beer_name || '';
            const beerIdAttr = item.beer_id ? ` data-beer-id="${Utils.escapeHtml(item.beer_id)}"` : '';
            const beerLink = beerName ? `<span class="beer-name-link" data-beer-name="${Utils.escapeHtml(beerName)}" data-beer-brewery="${Utils.escapeHtml(item.brewery || '')}" data-beer-style="${Utils.escapeHtml(item.style || '')}"${beerIdAttr} role="button" tabindex="0">${Utils.escapeHtml(beerName)}</span>` : '';
            const cheersBtn = item.id ? `<div class="activity-cheers">${this.cheersButtonHtml(item.id)}</div>` : '';
            return `<div class="activity-item" data-user-id="${Utils.escapeHtml(item.user_id || '')}" data-user-name="${Utils.escapeHtml(name)}">
                <div class="activity-avatar">${Utils.escapeHtml(initials)}</div>
                <div class="activity-body">
                    <div class="activity-text">${Utils.escapeHtml(name)} rated ${beerLink} ${Utils.stars(item.rating || 0)}${ygBadge}${item.location_name ? ' at ' + Utils.escapeHtml(item.location_name) : ''}</div>
                    ${item.notes ? `<div class="activity-notes">"${Utils.escapeHtml(Utils.truncate(item.notes, 80))}"</div>` : ''}
                    <div class="activity-meta">${Utils.timeAgo(item.created_at)}${cheersBtn}</div>
                </div>
            </div>`;
        }).join('');
        const ratingIds = list.filter(i => i.id).map(i => i.id);
        this.fillCheersForCards(ratingIds);
        const hasMore = (items.length || 0) > showCount;
        if (loadMoreBtn) loadMoreBtn.style.display = hasMore ? 'block' : 'none';
        const activitySentinel = document.getElementById('activity-sentinel');
        if (activitySentinel) activitySentinel.style.display = hasMore ? 'block' : 'none';
    },

    async renderProfile() {
        if (!DB.currentUser) return;
        document.getElementById('profile-name').textContent = DB.currentUser.display_name;
        document.getElementById('profile-email').textContent = DB.currentUser.email;
        document.getElementById('profile-avatar').textContent = Utils.initials(DB.currentUser.display_name) || '🍺';

        const myRatings = this.allRatings.filter(r => r.user_id === DB.currentUser.id);
        document.getElementById('pstat-total').textContent = myRatings.length;
        document.getElementById('badge-count').textContent = `${myRatings.length} reviews`;

        if (myRatings.length) {
            document.getElementById('pstat-avg').textContent = Utils.average(myRatings.map(r => r.rating)).toFixed(1);
            const styleCounts = Utils.countBy(myRatings, 'style');
            const favStyle = Object.entries(styleCounts).sort((a, b) => b[1] - a[1])[0];
            document.getElementById('pstat-fav').textContent = favStyle ? favStyle[0] : '—';
            Charts.renderMyRatings(myRatings);
        }

        const container = document.getElementById('my-reviews');
        if (!myRatings.length) {
            container.innerHTML = '<p class="empty-state cta-empty">🍺 No beers rated yet. Be the first to crack one open!</p><button type="button" class="btn btn-primary" data-view="rate">Rate a Beer</button>';
            container.querySelector('.btn')?.addEventListener('click', () => this.navigate('rate'));
            return;
        }
        container.innerHTML = myRatings.map(r => {
            const ygBadge = (r.yg_value != null && r.yg_value > 0) ? ` <span class="yg-badge-pill">${r.yg_value} YG</span>` : '';
            const beerIdAttr = (r.beer_id) ? ` data-beer-id="${Utils.escapeHtml(r.beer_id)}"` : '';
            return `<div class="review-card" data-rating-id="${r.id}" data-user-id="${Utils.escapeHtml(r.user_id || '')}" data-user-name="${Utils.escapeHtml(r.user_name || 'Anonymous')}">
                <div class="review-rating">${this.ratingEmoji(r.rating)}</div>
                <div class="review-content">
                    <div class="review-beer-name"><span class="beer-name-link" data-beer-name="${Utils.escapeHtml(r.beer_name)}" data-beer-brewery="${Utils.escapeHtml(r.brewery || '')}" data-beer-style="${Utils.escapeHtml(r.style || '')}"${beerIdAttr} role="button" tabindex="0">${Utils.escapeHtml(r.beer_name)}</span></div>
                    <div class="review-meta">${Utils.escapeHtml(r.brewery || '')}${r.brewery && r.style ? ' · ' : ''}${r.style ? `<span class="style-tooltip" data-style="${Utils.escapeHtml(r.style)}">${Utils.escapeHtml(r.style)}</span>` : ''}</div>
                    <div class="review-stars">${Utils.stars(r.rating)}${ygBadge}</div>
                    ${r.notes ? `<div class="review-notes">${Utils.escapeHtml(r.notes)}</div>` : ''}
                    <div class="review-user">${Utils.timeAgo(r.created_at)}</div>
                </div>
                <div class="review-actions">
                    ${this.cheersButtonHtml(r.id)}
                    <button type="button" class="review-delete" aria-label="Delete rating" data-rating-id="${r.id}">🗑️</button>
                </div>
            </div>`;
        }).join('');
        this.fillCheersForCards(myRatings.map(r => r.id));
        container.querySelectorAll('.review-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                this._deleteRatingId = btn.dataset.ratingId;
                const beerName = this.allRatings.find(x => x.id === btn.dataset.ratingId)?.beer_name || 'this beer';
                document.getElementById('delete-modal-message').textContent = `Delete your rating of ${Utils.escapeHtml(beerName)}? This can't be undone.`;
                document.getElementById('delete-modal').style.display = 'flex';
            });
        });
    },

    // ========== HELPERS ==========
    populateStyleFilter() {
        const hiddenSelect = document.getElementById('filter-style');
        if (this.browseTab === 'catalog') {
            if (!hiddenSelect) return;
            const styles = [...new Set((this.catalogStyles || []).filter(Boolean))].sort();
            const current = hiddenSelect.value;
            hiddenSelect.innerHTML = '<option value="">All Styles</option>' +
                styles.map((s) => `<option value="${Utils.escapeHtml(s)}">${Utils.escapeHtml(s)}</option>`).join('');
            hiddenSelect.value = styles.includes(current) ? current : '';
            return;
        }

        const container = document.getElementById('filter-style-options');
        if (!container) return;

        const styles = [...new Set(
            (this.allRatings || [])
                .map((r) => r.style)
                .filter(Boolean)
        )].sort();

        const activeStyle = styles.includes(this._browseStyleFilter) ? this._browseStyleFilter : '';
        this._browseStyleFilter = activeStyle;
        if (hiddenSelect) {
            hiddenSelect.innerHTML = '<option value="">All Styles</option>' +
                styles.map((s) => `<option value="${Utils.escapeHtml(s)}">${Utils.escapeHtml(s)}</option>`).join('');
            hiddenSelect.value = activeStyle;
        }

        container.innerHTML = '<button class="filter-sheet__opt' + (activeStyle ? '' : ' active') + '" data-value="">All Styles</button>' +
            styles.map((s) =>
                `<button class="filter-sheet__opt${s === activeStyle ? ' active' : ''}" data-value="${Utils.escapeHtml(s)}">${Utils.escapeHtml(s)}</button>`
            ).join('');

        container.querySelectorAll('.filter-sheet__opt').forEach((opt) => {
            opt.addEventListener('click', () => {
                container.querySelectorAll('.filter-sheet__opt').forEach((o) => o.classList.remove('active'));
                opt.classList.add('active');
            });
        });
    },

    prefillRateFormFromBeer(beer) {
        if (!beer) return;
        const name = beer.name || beer.beer_name || '';
        const brewery = beer.brewery_name || beer.brewery || '';
        const rawStyle = beer.style || '';
        const mappedStyle = this._mapStyleToDropdown(rawStyle);
        const abv = (beer.abv != null && Number.isFinite(Number(beer.abv))) ? Number(beer.abv).toFixed(1) : '';
        const beerId = beer.id || beer.beer_id || '';

        const beerInput = document.getElementById('beer-name');
        const breweryInput = document.getElementById('beer-brewery');
        const styleInput = document.getElementById('beer-style');
        const abvInput = document.getElementById('beer-abv');
        const beerIdInput = document.getElementById('rating-beer-id');

        if (beerInput) beerInput.value = name;
        if (breweryInput) breweryInput.value = brewery;
        if (styleInput) {
            if (mappedStyle) {
                styleInput.value = mappedStyle;
            } else {
                const direct = Array.from(styleInput.options).some((opt) => opt.value === rawStyle);
                styleInput.value = direct ? rawStyle : 'Other';
            }
        }
        if (abvInput) abvInput.value = abv;
        if (beerIdInput) beerIdInput.value = beerId;
        this.navigate('rate');
    },

    ratingEmoji(rating) {
        if (rating >= 5) return '🤩';
        if (rating >= 4) return '😍';
        if (rating >= 3) return '😊';
        if (rating >= 2) return '😐';
        return '😞';
    },

    setLoading(form, loading) {
        const btn = form.querySelector('button[type="submit"]');
        if (!btn) return;
        const text = btn.querySelector('.btn-text');
        const loader = btn.querySelector('.btn-loader');
        if (text) text.style.display = loading ? 'none' : '';
        if (loader) loader.style.display = loading ? '' : 'none';
        btn.disabled = loading;
    },

    setLoadingText(form, text) {
        const btn = form.querySelector('button[type="submit"]');
        if (!btn) return;
        const textEl = btn.querySelector('.btn-text');
        const loader = btn.querySelector('.btn-loader');
        if (textEl) textEl.style.display = 'none';
        if (loader) { loader.style.display = ''; loader.textContent = text; }
        btn.disabled = true;
    },

    resetRatingForm(form) {
        form.reset();
        document.getElementById('beer-rating').value = '';
        document.getElementById('rating-label').textContent = 'Select a rating';
        document.querySelectorAll('#star-rating .star').forEach(s => s.classList.remove('active'));
        ['hoppy', 'malty', 'bitter', 'sweet', 'fruity'].forEach(f => {
            const el = document.getElementById(`val-${f}`);
            if (el) el.textContent = '0';
        });
        if (typeof App._ygSetValue === 'function') App._ygSetValue(0);
        const beerIdInput = document.getElementById('rating-beer-id');
        if (beerIdInput) beerIdInput.value = '';
        this.clearLocation();
        document.getElementById('venue-chip').style.display = 'none';
        document.getElementById('price-amount').value = '';
        document.getElementById('price-happy-hour').checked = false;
        document.getElementById('price-log-fields').style.display = 'none';
        document.getElementById('price-log-toggle').setAttribute('aria-expanded', 'false');
        document.getElementById('rating-venue-type').value = '';
        document.querySelectorAll('.venue-type-opt').forEach((b) => b.classList.remove('selected'));
        const picker = document.getElementById('venue-type-picker');
        if (picker) picker.style.display = 'none';
        if (this._pendingPhotoPreviewUrl) {
            URL.revokeObjectURL(this._pendingPhotoPreviewUrl);
            this._pendingPhotoPreviewUrl = null;
        }
        this._pendingPhotoFile = null;
        document.getElementById('photo-preview').innerHTML = '';
        document.getElementById('photo-input').value = '';
        const progressEl = document.getElementById('upload-progress');
        if (progressEl) {
            progressEl.style.display = 'none';
            progressEl.textContent = '';
        }
    }
};

// ========== BOOT ==========
document.addEventListener('DOMContentLoaded', () => App.init());
