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

const App = {
    currentView: 'dashboard',
    allRatings: [],
    cheersCache: {},
    _demoCheersKey: 'beerbook_demo_cheers',
    _loadAllDataDebounceTimer: null,

    toast(message, type = 'info') {
        Utils.toast(message, type, 3000);
    },

    // ========== INIT ==========
    async init() {
        Charts.init();
        await DB.init();

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
            
            // Handle pending venue creation from Overpass selection
            const pendingVenueData = document.getElementById('rating-venue-id').getAttribute('data-pending-venue');
            if (pendingVenueData && !venueId && lat && lng) {
                try {
                    const venueData = JSON.parse(pendingVenueData);
                    const venue = await DB.createVenue({
                        name: venueData.name,
                        latitude: venueData.latitude,
                        longitude: venueData.longitude,
                        address: venueData.address || null
                    });
                    venueId = venue && venue.id ? venue.id : null;
                } catch (err) {
                    console.warn('Failed to create venue from Overpass data:', err);
                }
            }

            let photoUrl = null;
            const previewImg = document.querySelector('#photo-preview img');
            if (previewImg && previewImg.src && previewImg.src.startsWith('data:')) {
                try {
                    this.setLoading(e.target, true);
                    const blob = await this.dataUrlToBlob(previewImg.src);
                    const file = new File([blob], 'photo.jpg', { type: blob.type || 'image/jpeg' });
                    const up = await DB.uploadPhoto(file);
                    photoUrl = (up && up.url) ? up.url : null;
                } catch (err) {
                    App.toast('Photo upload failed: ' + err.message, 'error');
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
                this.setLoading(e.target, true);
                await DB.addRating(rating);
                App.toast(`Rated "${rating.beerName}" ${Utils.stars(ratingVal)}`, 'success');

                const priceAmount = document.getElementById('price-amount').value.trim();
                const priceHappy = document.getElementById('price-happy-hour').checked;
                if (priceAmount && locationName && !DB.isDemo) {
                    const cents = Math.round(parseFloat(priceAmount.replace(/[^0-9.]/g, '')) * 100);
                    if (isNaN(cents) || cents < 1) {
                        App.toast('Please enter a valid price (e.g. 6.50)', 'error');
                    } else {
                        try {
                            if (!venueId) {
                                const venue = await DB.createVenue({ name: locationName, latitude: lat, longitude: lng });
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

        // Search & filters (reset infinite scroll on change)
        document.getElementById('search-input')?.addEventListener('input',
            Utils.debounce(() => { this.browseShownCount = 24; this.renderBrowse(); }, 200));
        document.getElementById('filter-style')?.addEventListener('change', () => { this.browseShownCount = 24; this.renderBrowse(); });
        document.getElementById('sort-by')?.addEventListener('change', () => { this.browseShownCount = 24; this.renderBrowse(); });

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
        document.getElementById('location-manual')?.addEventListener('blur', () => {
            const v = document.getElementById('location-manual').value.trim();
            if (v) {
                document.getElementById('rating-location-name').value = v;
                document.getElementById('location-chip-text').textContent = '📍 ' + v;
                document.getElementById('location-chip').style.display = 'inline-flex';
                document.getElementById('venue-picker').style.display = 'none';
                this.togglePriceSection();
            }
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
                                allResults.push({ type: 'item', beer_name: b.beer_name || b.name || '', brewery: b.brewery || '', style: b.style || '', abv: b.abv || '', source: 'local', beer_id: null });
                            }
                        });
                    }
                    if (externalResults.length > 0) {
                        allResults.push({ type: 'group', label: 'From beer database' });
                        externalResults.forEach(b => {
                            const name = normalized(b.beer_name || '');
                            if (!seen.has(name)) {
                                seen.add(name);
                                allResults.push({ type: 'item', beer_name: b.beer_name || '', brewery: b.brewery || '', style: b.style || '', abv: b.abv || '', source: b.source || 'openfoodfacts', beer_id: null });
                            }
                        });
                    }
                    App._renderBeerAutocompleteDropdown(dropdown, allResults, false);
                    return;
                }
                const catalogResults = await DB.searchCatalog(q, 10);
                if (hintEl && q.length >= 3 && (!catalogResults || catalogResults.length === 0)) {
                    hintEl.style.display = 'block';
                }
                if (!catalogResults || catalogResults.length === 0) return;
                const items = catalogResults.map((r) => ({
                    type: 'item',
                    beer_name: r.name || '',
                    brewery: r.brewery_name || '',
                    style: r.style || '',
                    abv: r.abv != null ? String(r.abv) : '',
                    beer_id: r.id || null,
                }));
                App._renderBeerAutocompleteDropdown(dropdown, items, true);
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
            const parts = [Utils.escapeHtml(item.beer_name)];
            if (item.brewery) parts.push(' — ' + Utils.escapeHtml(item.brewery));
            if (item.style) parts.push(' (' + Utils.escapeHtml(item.style) + ')');
            if (item.abv && parseFloat(item.abv) > 0) parts.push(' ' + parseFloat(item.abv).toFixed(1) + '%');
            const label = parts.join('');
            const beerId = item.beer_id || '';
            return `<div class="autocomplete-item" data-name="${Utils.escapeHtml(item.beer_name)}" data-brewery="${Utils.escapeHtml(item.brewery || '')}" data-style="${Utils.escapeHtml(item.style || '')}" data-abv="${Utils.escapeHtml(item.abv || '')}" data-beer-id="${Utils.escapeHtml(beerId)}">${label}</div>`;
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
            });
        });
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
                            document.getElementById('location-manual').value = locationName;

                            // Show chip
                            document.getElementById('location-chip-text').textContent = '📍 ' + locationName;
                            document.getElementById('location-chip').style.display = 'inline-flex';

                            // Hide dropdown
                            dropdown.innerHTML = '';
                            if (picker) picker.style.display = 'none';

                            // Show price section since we now have a location
                            App.togglePriceSection();
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
            document.getElementById('rating-venue-id').setAttribute('data-pending-venue', JSON.stringify({
                name, latitude: lat, longitude: lng, address: address || null
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
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                let w = img.width, h = img.height;
                if (w > 1200) {
                    const c = document.createElement('canvas');
                    c.width = 1200;
                    c.height = Math.round(1200 * h / w);
                    const ctx = c.getContext('2d');
                    ctx.drawImage(img, 0, 0, c.width, c.height);
                    const dataUrl = c.toDataURL(file.type || 'image/jpeg', 0.9);
                    document.getElementById('photo-preview').innerHTML = `<img src="${dataUrl}" alt="Preview"><button type="button" class="photo-remove" data-dataurl="${dataUrl.replace(/^data:[^;]+;base64,/, '')}" data-type="${file.type}">Remove photo</button>`;
                } else {
                    document.getElementById('photo-preview').innerHTML = `<img src="${ev.target.result}" alt="Preview"><button type="button" class="photo-remove" data-url="${ev.target.result}">Remove photo</button>`;
                }
                document.getElementById('photo-preview').querySelector('.photo-remove').addEventListener('click', () => {
                    document.getElementById('photo-preview').innerHTML = '';
                    document.getElementById('photo-input').value = '';
                });
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
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

        const catalogInfoHtml = (catalogBeer && (catalogBeer.description || catalogBeer.review_overall != null || catalogBeer.abv != null || catalogBeer.style)) ? (() => {
            const parts = [];
            if (catalogBeer.description) parts.push(`<p class="catalog-desc">${Utils.escapeHtml(catalogBeer.description)}</p>`);
            const stats = [];
            if (catalogBeer.abv != null) stats.push(`<span>ABV: ${Utils.escapeHtml(String(catalogBeer.abv))}%</span>`);
            if (catalogBeer.review_overall != null) stats.push(`<span>Community: ${Utils.escapeHtml(String(catalogBeer.review_overall))}/5</span>`);
            if (catalogBeer.style) stats.push(`<span>Style: ${Utils.escapeHtml(catalogBeer.style)}</span>`);
            if (stats.length) parts.push(`<div class="catalog-stats">${stats.join('')}</div>`);
            if (parts.length === 0) return '';
            return `<div class="catalog-info"><span class="catalog-badge">📖 From BeerBook Catalog</span>${parts.join('')}</div>`;
        })() : '';

        body.innerHTML = `
            <h2 class="beer-detail-name">${name}</h2>
            ${brew ? `<div class="beer-detail-brewery">${brew}</div>` : ''}
            <div class="beer-detail-meta">
                ${st ? `<span class="style-tooltip" data-style="${Utils.escapeHtml(beer.style || '')}">${st}</span>` : ''}
                ${abv ? `<span>${abv}</span>` : ''}
            </div>
            ${catalogInfoHtml}
            <div class="beer-detail-stats">
                <span>${avgRating} ★ avg</span>
                <span>${reviewCount} review${reviewCount !== 1 ? 's' : ''}</span>
                ${avgYg ? `<span>${avgYg} YG avg</span>` : ''}
            </div>
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
                document.getElementById('beer-name').value = beer.beer_name;
                document.getElementById('beer-brewery').value = beer.brewery || '';
                document.getElementById('beer-style').value = beer.style || '';
                this.navigate('rate');
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

        await this.loadAllData();
        this.navigate('dashboard');
    },

    // ========== DATA LOADING ==========
    async loadAllData() {
        // Debounce rapid calls - if called multiple times quickly, only execute once
        if (this._loadAllDataDebounceTimer) {
            clearTimeout(this._loadAllDataDebounceTimer);
        }
        return new Promise((resolve, reject) => {
            this._loadAllDataDebounceTimer = setTimeout(async () => {
                this._loadAllDataDebounceTimer = null;
                try {
                    await this._loadAllDataInternal();
                    resolve();
                } catch (err) {
                    reject(err);
                }
            }, 100); // 100ms debounce - prevents rapid successive calls
        });
    },
    
    async _loadAllDataInternal() {
        this.activityPage = 0;
        this.activityItems = [];
        const period = document.querySelector('.lb-tab.active')?.dataset.period || 'alltime';
        try {
            const stats = await DB.getStats();
            this.allRatings = stats.ratings || [];

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
            this.renderBrowse();
            this.renderLeaderboard(period);
            this.renderProfile();
            this.populateStyleFilter();

            const activityRes = await DB.getActivity();
            this.activityItems = (activityRes && activityRes.data) ? activityRes.data : [];
            this.renderActivityFeed(this.activityItems, 10);
            this.activityPage = 1;
        } catch (err) {
            console.error('Failed to load data:', err);
            App.toast('Failed to load data', 'error');
        }
    },

    // ========== NAVIGATION ==========
    navigate(viewId) {
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
            return `<div class="review-card" data-rating-id="${r.id}">
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

    renderBrowse() {
        const container = document.getElementById('beer-grid');
        const search = (document.getElementById('search-input')?.value || '').toLowerCase();
        const styleFilter = document.getElementById('filter-style')?.value || '';
        const sortBy = document.getElementById('sort-by')?.value || 'recent';

        let filtered = [...this.allRatings];
        if (search) filtered = filtered.filter(r =>
            r.beer_name.toLowerCase().includes(search) || (r.brewery || '').toLowerCase().includes(search) ||
            (r.style || '').toLowerCase().includes(search) || (r.notes || '').toLowerCase().includes(search));
        if (styleFilter) filtered = filtered.filter(r => r.style === styleFilter);

        switch (sortBy) {
            case 'highest': filtered.sort((a, b) => b.rating - a.rating); break;
            case 'lowest': filtered.sort((a, b) => a.rating - b.rating); break;
            case 'name': filtered.sort((a, b) => a.beer_name.localeCompare(b.beer_name)); break;
            default: filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        }

        this._browseFilteredLength = filtered.length;
        if (!filtered.length) {
            if (!this.allRatings.length) {
                container.innerHTML = '<p class="empty-state cta-empty">🍺 No beers rated yet. Be the first to crack one open!</p><button type="button" class="btn btn-primary" data-view="rate">Rate a Beer</button>';
                container.querySelector('.btn')?.addEventListener('click', () => this.navigate('rate'));
            } else {
                container.innerHTML = '<p class="empty-state">No beers match your search.</p>';
            }
            const sentinel = document.getElementById('browse-sentinel');
            if (sentinel) sentinel.style.display = 'none';
            return;
        }

        const showCount = this.browseShownCount || 24;
        container.innerHTML = filtered.slice(0, showCount).map(r => {
            const beerIdAttr = (r.beer_id) ? ` data-beer-id="${Utils.escapeHtml(r.beer_id)}"` : '';
            return `<div class="beer-card">
                <div class="beer-card-header">
                    <div class="beer-card-name"><span class="beer-name-link" data-beer-name="${Utils.escapeHtml(r.beer_name)}" data-beer-brewery="${Utils.escapeHtml(r.brewery || '')}" data-beer-style="${Utils.escapeHtml(r.style || '')}"${beerIdAttr} role="button" tabindex="0">${Utils.escapeHtml(r.beer_name)}</span></div>
                    <div class="beer-card-rating">${r.rating.toFixed(1)}</div>
                </div>
                ${r.brewery ? `<div class="beer-card-brewery">${Utils.escapeHtml(r.brewery)}</div>` : ''}
                <div class="beer-card-details">
                    ${r.style ? `<span class="beer-card-tag style-tooltip" data-style="${Utils.escapeHtml(r.style)}">${Utils.escapeHtml(r.style)}</span>` : ''}
                    ${r.abv ? `<span class="beer-card-tag">${r.abv}% ABV</span>` : ''}
                </div>
                <div class="beer-card-stars">${Utils.stars(r.rating)}${(r.yg_value != null && r.yg_value > 0) ? ` <span class="yg-badge-pill">${r.yg_value} YG</span>` : ''}</div>
                ${r.notes ? `<div class="beer-card-notes">${Utils.escapeHtml(r.notes)}</div>` : ''}
                <div class="beer-card-footer">
                    <span>${Utils.escapeHtml(r.user_name || 'Anonymous')}</span>
                    <span>${Utils.timeAgo(r.created_at)}</span>
                </div>
            </div>
        `;
        }).join('');
        const sentinel = document.getElementById('browse-sentinel');
        if (sentinel) sentinel.style.display = filtered.length > showCount ? 'block' : 'none';
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
            return `<div class="activity-item">
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
            return `<div class="review-card" data-rating-id="${r.id}">
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
        const select = document.getElementById('filter-style');
        if (!select) return;
        const styles = [...new Set(this.allRatings.map(r => r.style).filter(Boolean))].sort();
        const current = select.value;
        select.innerHTML = '<option value="">All Styles</option>' +
            styles.map(s => `<option value="${s}" ${s === current ? 'selected' : ''}>${s}</option>`).join('');
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

    dataUrlToBlob(dataUrl) {
        return fetch(dataUrl).then(r => r.blob());
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
        document.getElementById('photo-preview').innerHTML = '';
        document.getElementById('photo-input').value = '';
    }
};

// ========== BOOT ==========
document.addEventListener('DOMContentLoaded', () => App.init());
