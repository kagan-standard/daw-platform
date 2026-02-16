/* ============================================
   BeerBook — Main Application (Keycloak SSO)
   ============================================ */

const App = {
    currentView: 'dashboard',
    allRatings: [],

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

            const rating = {
                beerName: document.getElementById('beer-name').value.trim(),
                brewery: document.getElementById('beer-brewery').value.trim(),
                style: document.getElementById('beer-style').value,
                abv: parseFloat(document.getElementById('beer-abv').value) || null,
                rating: ratingVal,
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
                    if (cents > 0) {
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

        // Search & filters
        document.getElementById('search-input')?.addEventListener('input',
            Utils.debounce(() => this.renderBrowse(), 200));
        document.getElementById('filter-style')?.addEventListener('change', () => this.renderBrowse());
        document.getElementById('sort-by')?.addEventListener('change', () => this.renderBrowse());

        // Beer autocomplete (Task 2)
        this.bindBeerAutocomplete();

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
        document.getElementById('location-manual')?.addEventListener('blur', () => {
            const v = document.getElementById('location-manual').value.trim();
            if (v) {
                document.getElementById('rating-location-name').value = v;
                document.getElementById('location-chip-text').textContent = '📍 ' + v;
                document.getElementById('location-chip').style.display = 'inline-flex';
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

        // Real-time
        DB.subscribeToRatings(() => this.loadAllData());
    },

    bindBeerAutocomplete() {
        const input = document.getElementById('beer-name');
        const dropdown = document.getElementById('beer-autocomplete');
        if (!input || !dropdown) return;
        let debounceTimer;
        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const q = input.value.trim();
            dropdown.setAttribute('aria-hidden', 'true');
            dropdown.innerHTML = '';
            if (q.length < 2) return;
            debounceTimer = setTimeout(async () => {
                const list = await DB.searchBeers(q);
                dropdown.innerHTML = (list.slice(0, 10) || []).map(b => {
                    const label = `${Utils.escapeHtml(b.beer_name || b.name || '')} — ${Utils.escapeHtml(b.brewery || '')} (${Utils.escapeHtml(b.style || '')})`;
                    return `<div class="autocomplete-item" data-name="${Utils.escapeHtml(b.beer_name || b.name || '')}" data-brewery="${Utils.escapeHtml(b.brewery || '')}" data-style="${Utils.escapeHtml(b.style || '')}">${label}</div>`;
                }).join('');
                if (dropdown.children.length) {
                    dropdown.setAttribute('aria-hidden', 'false');
                    dropdown.querySelectorAll('.autocomplete-item').forEach((el, i) => {
                        el.addEventListener('click', () => {
                            document.getElementById('beer-name').value = el.dataset.name;
                            document.getElementById('beer-brewery').value = el.dataset.brewery || '';
                            document.getElementById('beer-style').value = el.dataset.style || '';
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
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`, {
                        headers: { 'User-Agent': 'BeerBook/1.0' }
                    });
                    const data = await res.json();
                    const name = (data && data.display_name) ? data.display_name : `Location ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                    document.getElementById('rating-location-name').value = name;
                    document.getElementById('location-chip-text').textContent = '📍 ' + name;
                    document.getElementById('location-chip').style.display = 'inline-flex';
                    document.getElementById('location-manual').value = name;
                    App.toast('Location captured', 'success');
                } catch {
                    document.getElementById('rating-location-name').value = `Location ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                    document.getElementById('location-chip-text').textContent = '📍 Location (lat, lng)';
                    document.getElementById('location-chip').style.display = 'inline-flex';
                }
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

    clearLocation() {
        document.getElementById('rating-lat').value = '';
        document.getElementById('rating-lng').value = '';
        document.getElementById('rating-location-name').value = '';
        document.getElementById('rating-venue-id').value = '';
        document.getElementById('location-manual').value = '';
        document.getElementById('location-chip').style.display = 'none';
        this.togglePriceSection();
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
            greeting.textContent = `Hey, ${DB.currentUser.display_name}!`;
        }

        await this.loadAllData();
        this.navigate('dashboard');
    },

    // ========== DATA LOADING ==========
    async loadAllData() {
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
            if (botwEl) botwEl.textContent = (botw && (botw.beer_name || botw.name)) ? (botw.beer_name || botw.name) : '—';

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
        this.currentView = viewId;
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

        const view = document.getElementById(`view-${viewId}`);
        const btn = document.querySelector(`.nav-btn[data-view="${viewId}"]`);

        if (view) { view.classList.add('active'); view.style.animation = 'none'; view.offsetHeight; view.style.animation = ''; }
        if (btn) btn.classList.add('active');

        if (viewId === 'dashboard' || viewId === 'profile') {
            setTimeout(() => { Object.values(Charts.instances).forEach(c => c.resize()); }, 100);
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
            return `<div class="review-card" data-rating-id="${r.id}">
                <div class="review-rating">${this.ratingEmoji(r.rating)}</div>
                <div class="review-content">
                    <div class="review-beer-name">${Utils.escapeHtml(r.beer_name)}</div>
                    <div class="review-meta">${Utils.escapeHtml(r.brewery || '')}${r.brewery && r.style ? ' · ' : ''}${Utils.escapeHtml(r.style || '')}${r.abv ? ` · ${r.abv}%` : ''}</div>
                    <div class="review-stars">${Utils.stars(r.rating)}</div>
                    ${r.notes ? `<div class="review-notes">${Utils.escapeHtml(Utils.truncate(r.notes, 150))}</div>` : ''}
                    <div class="review-user">— ${Utils.escapeHtml(r.user_name || 'Anonymous')} · ${Utils.timeAgo(r.created_at)}</div>
                </div>
                ${canDelete ? `<button type="button" class="review-delete" aria-label="Delete rating" data-rating-id="${r.id}">🗑️</button>` : ''}
            </div>`;
        }).join('');
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

        if (!filtered.length) {
            if (!this.allRatings.length) {
                container.innerHTML = '<p class="empty-state cta-empty">🍺 No beers rated yet. Be the first to crack one open!</p><button type="button" class="btn btn-primary" data-view="rate">Rate a Beer</button>';
                container.querySelector('.btn')?.addEventListener('click', () => this.navigate('rate'));
            } else {
                container.innerHTML = '<p class="empty-state">No beers match your search.</p>';
            }
            return;
        }

        container.innerHTML = filtered.map(r => `
            <div class="beer-card">
                <div class="beer-card-header">
                    <div class="beer-card-name">${Utils.escapeHtml(r.beer_name)}</div>
                    <div class="beer-card-rating">${r.rating.toFixed(1)}</div>
                </div>
                ${r.brewery ? `<div class="beer-card-brewery">${Utils.escapeHtml(r.brewery)}</div>` : ''}
                <div class="beer-card-details">
                    ${r.style ? `<span class="beer-card-tag">${Utils.escapeHtml(r.style)}</span>` : ''}
                    ${r.abv ? `<span class="beer-card-tag">${r.abv}% ABV</span>` : ''}
                </div>
                <div class="beer-card-stars">${Utils.stars(r.rating)}</div>
                ${r.notes ? `<div class="beer-card-notes">${Utils.escapeHtml(r.notes)}</div>` : ''}
                <div class="beer-card-footer">
                    <span>${Utils.escapeHtml(r.user_name || 'Anonymous')}</span>
                    <span>${Utils.timeAgo(r.created_at)}</span>
                </div>
            </div>
        `).join('');
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
            const ygBadge = (item.yg_value != null && item.yg_value > 0) ? ` <span class="activity-yg-badge">(${Number(item.yg_value)} YG)</span>` : '';
            const cheers = (item.cheers_count > 0) ? ` · 🍻 ${item.cheers_count} cheers` : '';
            return `<div class="activity-item">
                <div class="activity-avatar">${Utils.escapeHtml(initials)}</div>
                <div class="activity-body">
                    <div class="activity-text">${Utils.escapeHtml(name)} rated ${Utils.escapeHtml(item.beer_name || '')} ${Utils.stars(item.rating || 0)}${ygBadge}${item.location_name ? ' at ' + Utils.escapeHtml(item.location_name) : ''}</div>
                    ${item.notes ? `<div class="activity-notes">"${Utils.escapeHtml(Utils.truncate(item.notes, 80))}"</div>` : ''}
                    <div class="activity-meta">${Utils.timeAgo(item.created_at)}${cheers}</div>
                </div>
            </div>`;
        }).join('');
        const hasMore = (items.length || 0) > showCount;
        if (loadMoreBtn) loadMoreBtn.style.display = hasMore ? 'block' : 'none';
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
        container.innerHTML = myRatings.map(r => `
            <div class="review-card" data-rating-id="${r.id}">
                <div class="review-rating">${this.ratingEmoji(r.rating)}</div>
                <div class="review-content">
                    <div class="review-beer-name">${Utils.escapeHtml(r.beer_name)}</div>
                    <div class="review-meta">${Utils.escapeHtml(r.brewery || '')}${r.brewery && r.style ? ' · ' : ''}${Utils.escapeHtml(r.style || '')}</div>
                    <div class="review-stars">${Utils.stars(r.rating)}</div>
                    ${r.notes ? `<div class="review-notes">${Utils.escapeHtml(r.notes)}</div>` : ''}
                    <div class="review-user">${Utils.timeAgo(r.created_at)}</div>
                </div>
                <button type="button" class="review-delete" aria-label="Delete rating" data-rating-id="${r.id}">🗑️</button>
            </div>
        `).join('');
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
        this.clearLocation();
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
