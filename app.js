// ScrapCollect App JavaScript
class ScrapCollectApp {
    constructor() {
        this.currentRole = null;
        this.currentView = 'roleSelection';
        this.currentLocation = null;
        this.requestIdCounter = 1004;
        this.modalConfirmAction = null;
        
        // Initialize data from provided JSON
        this.scrapTypes = [
            {"id": 1, "name": "Metal Scrap", "pricePerKg": 25, "category": "Metal", "description": "Iron, steel, aluminum, copper"},
            {"id": 2, "name": "Plastic Bottles", "pricePerKg": 12, "category": "Plastic", "description": "PET bottles, containers"},
            {"id": 3, "name": "Paper & Cardboard", "pricePerKg": 8, "category": "Paper", "description": "Newspapers, magazines, boxes"},
            {"id": 4, "name": "Electronics", "pricePerKg": 45, "category": "E-waste", "description": "Old phones, computers, cables"},
            {"id": 5, "name": "Glass", "pricePerKg": 5, "category": "Glass", "description": "Bottles, jars, windows"},
            {"id": 6, "name": "Textiles", "pricePerKg": 15, "category": "Textile", "description": "Old clothes, fabrics"}
        ];

        this.dealers = [
            {"id": 1, "name": "GreenRecycle Co.", "phone": "+91-9876543210", "email": "contact@greenrecycle.com", "serviceAreas": ["North Delhi", "Central Delhi"], "rating": 4.8, "specialties": ["Metal", "Electronics"], "active": true, "completedJobs": 245},
            {"id": 2, "name": "EcoWaste Solutions", "phone": "+91-9876543211", "email": "info@ecowaste.com", "serviceAreas": ["South Delhi", "East Delhi"], "rating": 4.6, "specialties": ["Plastic", "Paper"], "active": true, "completedJobs": 189},
            {"id": 3, "name": "Delhi Scrap Hub", "phone": "+91-9876543212", "email": "delhi@scraphub.com", "serviceAreas": ["West Delhi", "Central Delhi"], "rating": 4.9, "specialties": ["All Types"], "active": true, "completedJobs": 312}
        ];

        this.requests = [
            {"id": 1001, "customerName": "Priya Sharma", "phone": "+91-9876543221", "email": "priya@email.com", "address": "Sector 15, Noida", "lat": 28.5355, "lng": 77.3910, "scrapTypes": [{"type": "Electronics", "quantity": 5}], "preferredDate": "2025-08-20", "preferredTime": "morning", "status": "Pending", "requestDate": "2025-08-15", "dealerId": null, "instructions": "Handle with care"},
            {"id": 1002, "customerName": "Rajesh Kumar", "phone": "+91-9876543222", "email": "rajesh@email.com", "address": "Lajpat Nagar, Delhi", "lat": 28.5673, "lng": 77.2430, "scrapTypes": [{"type": "Metal Scrap", "quantity": 15}, {"type": "Plastic Bottles", "quantity": 8}], "preferredDate": "2025-08-18", "preferredTime": "afternoon", "status": "Assigned", "requestDate": "2025-08-14", "dealerId": 1, "instructions": "Available after 2 PM"},
            {"id": 1003, "customerName": "Anya Verma", "phone": "+91-9876543223", "email": "anya@email.com", "address": "Vasant Kunj, Delhi", "lat": 28.5244, "lng": 77.1671, "scrapTypes": [{"type": "Paper & Cardboard", "quantity": 12}], "preferredDate": "2025-08-17", "preferredTime": "evening", "status": "Completed", "requestDate": "2025-08-13", "dealerId": 2, "instructions": "Call before arrival"}
        ];

        this.locations = [
            {"area": "North Delhi", "lat": 28.7041, "lng": 77.1025},
            {"area": "South Delhi", "lat": 28.5355, "lng": 77.2430},
            {"area": "East Delhi", "lat": 28.6466, "lng": 77.3179},
            {"area": "West Delhi", "lat": 28.6692, "lng": 77.1022},
            {"area": "Central Delhi", "lat": 28.6448, "lng": 77.2167}
        ];

        this.init();
    }

    init() {
        this.loadData();
    // initialize i18n module if available
        try {
            if (window.i18n) {
                window.i18n.init({ getUser: () => this.currentUser });
                // set selector to current language
                const sel = document.getElementById('langSelect');
                if (sel) {
                    sel.value = window.i18n.lang;
                    sel.addEventListener('change', (e) => {
                        const newLang = e.target.value;
                        window.i18n.setLanguage(newLang);
                        try { sessionStorage.setItem('scrap_lang_session', newLang); } catch(e){}
                        // ensure i18n has up-to-date user accessor
                        try { window.i18n.getUser = () => this.currentUser; } catch(e){}
                        // re-apply translations and refresh current view to update dynamic labels
                        try { window.i18n.applyToDOM(); } catch(e){}
                        try { if (this.currentView) this.showView(this.currentView); } catch(e){}
                    });
                }
                // wire header logout button
                const hdrLogout = document.getElementById('logoutBtnHeader');
                if (hdrLogout) hdrLogout.addEventListener('click', () => this.logout());
                // apply initial translations
                    try { window.i18n.applyToDOM(); } catch(e){}
            }
        } catch(e){}
            // ensure auth UI is correct on load
            try { this.updateAuthUI(); } catch(e){}
        // pick up customerAuth if created via standalone customer_login.html
        try {
            const ca = localStorage.getItem('customerAuth');
            if (ca) {
                const parsed = JSON.parse(ca);
                if (parsed && parsed.phone) {
                    this.currentUser = parsed;
                    try { if (window.__setAuthUser) window.__setAuthUser(parsed); } catch(e){}
                    document.getElementById('loginBtn') && (document.getElementById('loginBtn').style.display = 'none');
                    document.getElementById('logoutBtn') && (document.getElementById('logoutBtn').style.display = '');
                    // If this is a customer login from the standalone page, auto-enter customer view
                    const roleIsCustomer = ((parsed.role && String(parsed.role).toLowerCase() === 'customer') || (!parsed.role && parsed.standalone));
                    if (roleIsCustomer) {
                        // Only auto-enter customer view if we were redirected from the standalone login
                        // or an explicit query param requested auto-role. This prevents home.html from
                        // auto-entering when launched independently.
                        var allowAuto = false;
                        try {
                            if (localStorage && localStorage.getItem('__redirectToIndex')) allowAuto = true;
                        } catch(e){}
                        // also allow if URL contains ?autoRole=customer
                        try { if (!allowAuto && window && window.location && window.location.search && window.location.search.indexOf('autoRole=customer')!==-1) allowAuto = true; } catch(e){}

                        if (allowAuto) {
                            this.currentRole = 'customer';
                            // hide the Switch Role control for standalone customers
                            const rs = document.getElementById('roleSelector');
                            if (rs) rs.style.display = 'none';
                            // show customer home immediately
                            try { this.showView('customerHome'); this.initCustomerView(); } catch(e){}
                            // clear the transient redirect flag so future direct opens behave normally
                            try { localStorage.removeItem('__redirectToIndex'); } catch(e){}
                        }
                    }
                }
            }
        } catch(e){}
    // rehydrate persisted auth token (if any) so API shim has it available
    try { if (window.__getAuthToken) { const t = window.__getAuthToken(); if (!t) { const saved = localStorage.getItem('scrapAuthToken'); if (saved && window.__setAuthUser) { /* token-only rehydrate: set in localStorage handled by shim */ } } } } catch(e){}
    this.setupEventListeners();
        this.initAuthListeners();
        // Only show the role selection screen if a role hasn't already been set
        // (init may have set this.currentRole when a standalone customer login was detected).
        if (!this.currentRole) {
            this.showView('roleSelection');
        } else {
            // Ensure header/back visibility is consistent for logged-in users
            try {
                const header = document.getElementById('header');
                const backBtn = document.getElementById('backBtn');
                if (header) header.style.display = 'block';
                if (backBtn) backBtn.style.display = 'inline-block';
            } catch(e){}
        }
    }

    // Resolve an absolute API base to use for fetch calls. Prefer explicit window.__SCRAP_API_BASE,
    // then same-origin host, otherwise fall back to localhost:3000 for local development.
    getApiBase() {
        try {
            if (window && window.__SCRAP_API_BASE && String(window.__SCRAP_API_BASE).trim()) {
                return String(window.__SCRAP_API_BASE).replace(/\/+$/, '');
            }
            if (window && window.location && window.location.host) {
                return window.location.protocol + '//' + window.location.host;
            }
        } catch (e) {}
        return 'http://localhost:3000';
    }

    // --- Authentication (phone-based simple) ---
    initAuthListeners() {
    const loginBtn = document.getElementById('loginBtn');
        const logoutBtn = document.getElementById('logoutBtn');
    if (loginBtn) loginBtn.addEventListener('click', () => this.showLoginModal(null));
        if (logoutBtn) logoutBtn.addEventListener('click', () => this.logout());
    // header logout
    const hdrLogout = document.getElementById('logoutBtnHeader');
    if (hdrLogout) hdrLogout.addEventListener('click', () => this.logout());
    }

    // update visibility of login/logout controls across header and views
    updateAuthUI() {
        try {
            const loggedIn = !!(this.currentUser && this.currentUser.phone);
            const loginBtn = document.getElementById('loginBtn');
            const logoutBtn = document.getElementById('logoutBtn');
            const hdrLogout = document.getElementById('logoutBtnHeader');
            const header = document.getElementById('header');
            if (loginBtn) loginBtn.style.display = loggedIn ? 'none' : '';
            if (logoutBtn) logoutBtn.style.display = loggedIn ? '' : 'none';
            if (hdrLogout) hdrLogout.style.display = loggedIn ? '' : 'none';
            // ensure header itself is visible for logged-in users
            if (header) header.style.display = loggedIn ? 'block' : (this.currentView === 'roleSelection' ? 'none' : 'block');
        } catch (e) { /* ignore */ }
    }

    async login() {
    const phoneInput = document.getElementById('loginPhone');
        if (!phoneInput) return;
    let phone = phoneInput.value && phoneInput.value.trim();
    if (!phone) { this.showToast('Enter phone number to login', 'error'); return; }
    // normalize: keep digits only and require exactly 10 digits (use last 10 digits if longer)
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length < 10) { this.showToast('Phone must contain at least 10 digits', 'error'); return; }
    phone = digits.slice(-10);
        // Call server to fetch or create user
        try {
            const base = this.getApiBase();
            const res = await fetch(base + `/api/users?phone=${encodeURIComponent(phone)}`);
            let user = null;
            if (res.ok) user = await res.json();
            if (!user) {
                const create = await fetch(base + '/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
                user = await create.json();
            }
            this.currentUser = user;
            // inform api shim about new user so token is picked up and requests re-fetched
            try { if (window.__setAuthUser) window.__setAuthUser(user); } catch(e) {}
            // ensure i18n knows about the logged-in user so user-specific prefs can be saved
            try { if (window.i18n) { window.i18n.getUser = () => this.currentUser; window.i18n.applyToDOM(); } } catch(e){}
            try { this.updateAuthUI(); } catch(e){}
            this.showToast('Logged in as ' + (user.name || user.phone), 'success');
        } catch (e) {
            console.error('Login failed', e);
            this.showToast('Login failed', 'error');
        }
    }

    logout() {
    this.currentUser = null;
    const lb = document.getElementById('loginBtn');
    const lob = document.getElementById('logoutBtn');
    const hdrLogout = document.getElementById('logoutBtnHeader');
    if (lb) lb.style.display = '';
    if (lob) lob.style.display = 'none';
    if (hdrLogout) hdrLogout.style.display = 'none';
    this.showToast('Logged out', 'info');
    // clear persisted auth token if present
    try { if (window.__clearAuthToken) window.__clearAuthToken(); } catch(e){}
    // send customers back to the standalone customer login page
    try { window.location.href = 'customer_login.html'; } catch(e){}
    }


    loadData() {
        try {
            const savedRequests = localStorage.getItem('scrapRequests');
            if (savedRequests) {
                this.requests = JSON.parse(savedRequests);
            }

            const savedDealers = localStorage.getItem('scrapDealers');
            if (savedDealers) {
                this.dealers = JSON.parse(savedDealers);
            }

            const lastRequestId = localStorage.getItem('lastRequestId');
            if (lastRequestId) {
                this.requestIdCounter = parseInt(lastRequestId) + 1;
            }
        } catch (e) {
            console.error('Error loading data:', e);
        }
    }

    saveData() {
        try {
            localStorage.setItem('scrapRequests', JSON.stringify(this.requests));
            localStorage.setItem('scrapDealers', JSON.stringify(this.dealers));
            localStorage.setItem('lastRequestId', (this.requestIdCounter - 1).toString());
        } catch (e) {
            console.error('Error saving data:', e);
        }
    }

    setupEventListeners() {
        // Role selection cards
        this.setupRoleSelection();
        
        // Navigation buttons
        this.setupNavigation();
        
        // Customer actions
        this.setupCustomerActions();
        
        // Form handlers
        this.setupFormHandlers();
        
        // Admin actions
        this.setupAdminActions();
        
        // Modal handlers
        this.setupModalHandlers();
        
        // Toast handlers
        this.setupToastHandlers();
    }

    setupRoleSelection() {
        const roleCards = document.querySelectorAll('.role-card');
        roleCards.forEach(card => {
            // Remove any existing listeners
            card.replaceWith(card.cloneNode(true));
        });
        
        // Re-get elements after cloning and add listeners
        document.querySelectorAll('.role-card').forEach(card => {
            card.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const role = card.getAttribute('data-role');
                if (role) {
                    this.setRole(role);
                }
            });
        });
    }

    setupNavigation() {
        const roleSelector = document.getElementById('roleSelector');
        const backBtn = document.getElementById('backBtn');
        
        if (roleSelector) {
            roleSelector.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.currentRole = null;
                this.showView('roleSelection');
                const header = document.getElementById('header');
                if (header) header.style.display = 'none';
            });
        }

        if (backBtn) {
            backBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.goBack();
            });
        }
    }

    setupCustomerActions() {
        // Use a more specific approach for customer action cards
        const requestPickupCard = document.querySelector('[data-action="requestPickup"]');
        const viewRequestsCard = document.querySelector('[data-action="viewRequests"]');
        
        if (requestPickupCard) {
            requestPickupCard.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.navigateToRequestPickup();
            });
        }
        
        if (viewRequestsCard) {
            viewRequestsCard.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.navigateToViewRequests();
            });
        }
    }

    setupFormHandlers() {
        const pickupForm = document.getElementById('pickupForm');
        if (pickupForm) {
            pickupForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.submitPickupRequest(e.target);
            });
        }

        const locationBtn = document.getElementById('getLocation');
        if (locationBtn) {
            locationBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.captureLocation();
            });
        }

        const addScrapBtn = document.getElementById('addScrapItem');
        if (addScrapBtn) {
            addScrapBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.addScrapItem();
            });
        }

        // Form change handlers for estimate calculation
        document.addEventListener('input', (e) => {
            if (e.target.name === 'quantity' || e.target.name === 'scrapType') {
                this.updateEstimate();
            }
        });

        document.addEventListener('change', (e) => {
            if (e.target.name === 'scrapType') {
                this.updateEstimate();
            }
        });
    }

    setupAdminActions() {
        document.addEventListener('click', (e) => {
            const target = e.target.closest('[data-admin-view], [data-admin-action]');
            if (!target) return;
            // admin section tabs
            if (target.getAttribute('data-admin-view')) {
                e.preventDefault();
                const view = target.getAttribute('data-admin-view');
                this.showAdminSection(view);
                return;
            }
            // admin action buttons (Add / Save / Cancel)
            const action = target.getAttribute('data-admin-action');
            if (!action) return;
            e.preventDefault();
            switch(action) {
                case 'showAddDealer':
                    this.showDealerForm(null);
                    break;
                case 'saveDealer':
                    this.saveDealer();
                    break;
                case 'cancelDealer':
                    this.hideDealerForm();
                    break;
                case 'showAddScrap':
                    this.showScrapForm(null);
                    break;
                case 'saveScrap':
                    this.saveScrap();
                    break;
                case 'cancelScrap':
                    this.hideScrapForm();
                    break;
                default:
                    // noop for unrecognized actions
                    break;
            }
        });
        // delegate for request edit buttons (in dealer request list)
        document.body.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="edit-request"]');
            if (!btn) return;
            e.preventDefault();
            const id = btn.getAttribute('data-request-id');
            try { this.openRequestEditModal(id); } catch(e){ console.warn('openRequestEditModal failed', e); }
        });
    }

    // Modal-based dealer edit/save: open modal with dealer data
    openDealerModal(dealer) {
        try {
            const modal = document.getElementById('dealerEditModal');
            if (!modal) return;
            document.getElementById('modalDealerTitle').textContent = dealer && dealer.id ? 'Edit Dealer' : 'Add Dealer';
            document.getElementById('modalDealerName').value = dealer ? (dealer.name || '') : '';
            document.getElementById('modalDealerPhone').value = dealer ? (dealer.phone || '') : '';
            document.getElementById('modalDealerEmail').value = dealer ? (dealer.email || '') : '';
            document.getElementById('modalDealerServiceAreas').value = dealer && dealer.serviceAreas ? (Array.isArray(dealer.serviceAreas) ? dealer.serviceAreas.join(', ') : dealer.serviceAreas) : '';
            document.getElementById('modalDealerSpecialties').value = dealer && dealer.specialties ? (Array.isArray(dealer.specialties) ? dealer.specialties.join(', ') : dealer.specialties) : '';
            document.getElementById('modalDealerActive').value = (dealer && typeof dealer.active !== 'undefined') ? String(!!dealer.active) : 'true';
            document.getElementById('modalDealerRatingInput').value = dealer && typeof dealer.rating !== 'undefined' ? dealer.rating : '';
            document.getElementById('modalDealerCompletedJobs').value = dealer && typeof dealer.completedJobs !== 'undefined' ? dealer.completedJobs : '';
            modal.setAttribute('data-edit-id', dealer && dealer.id ? dealer.id : '');
            // clear success message
            document.getElementById('modalDealerSuccess').style.display = 'none';
            modal.classList.remove('hidden');
        } catch (e) { console.warn('openDealerModal failed', e); }
    }

    closeDealerModal() {
        try { const modal = document.getElementById('dealerEditModal'); if (modal) modal.classList.add('hidden'); } catch(e){}
    }

    async saveDealerModal() {
        try {
            const modal = document.getElementById('dealerEditModal'); if (!modal) return;
            const id = modal.getAttribute('data-edit-id');
            const name = document.getElementById('modalDealerName').value;
            const phoneRaw = document.getElementById('modalDealerPhone').value;
            const phone = (window.__normalizePhone10 ? window.__normalizePhone10(phoneRaw) : phoneRaw);
            const email = document.getElementById('modalDealerEmail').value;
            const serviceAreasRaw = document.getElementById('modalDealerServiceAreas').value || '';
            const specialtiesRaw = document.getElementById('modalDealerSpecialties').value || '';
            const active = document.getElementById('modalDealerActive').value === 'true';
            const rating = parseFloat(document.getElementById('modalDealerRatingInput').value) || 0;
            const completedJobs = parseInt(document.getElementById('modalDealerCompletedJobs').value) || 0;
            const payload = { name, phone, email, serviceAreas: serviceAreasRaw ? serviceAreasRaw.split(',').map(s => s.trim()).filter(Boolean) : [], specialties: specialtiesRaw ? specialtiesRaw.split(',').map(s => s.trim()).filter(Boolean) : [], active, rating, completedJobs };
            const token = (window.__getAuthToken && window.__getAuthToken()) || null;
            const headers = { 'Content-Type':'application/json' };
            if (token) headers['Authorization'] = 'Bearer ' + token;
            const opts = { method: id ? 'PUT' : 'POST', headers, body: JSON.stringify(payload) };
            const base = this.getApiBase();
            const path = base + (id ? `/api/dealers/${id}` : '/api/dealers');
            const saveBtn = document.getElementById('modalDealerSave');
            if (saveBtn) { saveBtn.disabled = true; saveBtn.dataset._oldText = saveBtn.textContent; saveBtn.textContent = 'Saving...'; }
            const res = await fetch(path, opts);
            if (!res.ok) {
                const txt = await res.text();
                if (res.status === 409) {
                    let msg = 'Dealer already exists';
                    try { const parsed = JSON.parse(txt || '{}'); if (parsed && parsed.error) msg = parsed.error; } catch(e){}
                    // show inline message in modal
                    const successEl = document.getElementById('modalDealerSuccess'); successEl.style.display = 'block'; successEl.style.color = 'var(--color-error)'; successEl.textContent = msg;
                    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset._oldText || 'Save'; }
                    return;
                }
                throw new Error(txt || 'Save failed');
            }
            await res.json();
            // show success message briefly, refresh list with flash
            const successEl = document.getElementById('modalDealerSuccess'); successEl.style.display = 'block'; successEl.style.color = 'var(--color-app-secondary)'; successEl.textContent = 'Saved successfully';
            await this.loadDealers();
            // flash the new list container
            try { const list = document.getElementById('dealersList'); if (list) { list.classList.add('flash'); setTimeout(() => list.classList.remove('flash'), 600); } } catch(e){}
            setTimeout(() => { if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset._oldText || 'Save'; } this.closeDealerModal(); }, 600);
        } catch (e) {
            console.warn('saveDealerModal failed', e);
            try { const successEl = document.getElementById('modalDealerSuccess'); successEl.style.display = 'block'; successEl.style.color = 'var(--color-error)'; successEl.textContent = 'Failed to save'; } catch(e){}
            const saveBtn = document.getElementById('modalDealerSave'); if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset._oldText || 'Save'; }
        }
    }

    setupModalHandlers() {
        const modalCancel = document.getElementById('modalCancel');
        const modalConfirm = document.getElementById('modalConfirm');
        
        if (modalCancel) {
            modalCancel.addEventListener('click', (e) => {
                e.preventDefault();
                this.hideModal();
            });
        }

        if (modalConfirm) {
            modalConfirm.addEventListener('click', (e) => {
                e.preventDefault();
                this.confirmModalAction();
            });
        }

        // Close modal when clicking overlay
        const modal = document.getElementById('confirmModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal-overlay')) {
                    this.hideModal();
                }
            });
        }

        // Dealer edit modal handlers
        const dealerModal = document.getElementById('dealerEditModal');
        if (dealerModal) {
            const saveBtn = document.getElementById('modalDealerSave');
            const cancelBtn = document.getElementById('modalDealerCancel');
            if (saveBtn) saveBtn.addEventListener('click', (e) => { e.preventDefault(); this.saveDealerModal(); });
            if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); this.closeDealerModal(); });
            // close on overlay click
            dealerModal.addEventListener('click', (e) => { if (e.target.classList.contains('modal-overlay')) this.closeDealerModal(); });
        }
        // Request edit modal handlers
        const reqModal = document.getElementById('requestEditModal');
        if (reqModal) {
            const saveBtn = document.getElementById('modalRequestSave');
            const cancelBtn = document.getElementById('modalRequestCancel');
            if (saveBtn) saveBtn.addEventListener('click', (e) => { e.preventDefault(); this.saveRequestEditModal(); });
            if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('requestEditModal').classList.add('hidden'); });
            reqModal.addEventListener('click', (e) => { if (e.target.classList.contains('modal-overlay')) document.getElementById('requestEditModal').classList.add('hidden'); });
            // Update map button in modal
            try {
                const mapBtn = document.getElementById('modalRequestUpdateMap');
                if (mapBtn) {
                    mapBtn.addEventListener('click', (ev) => {
                        try {
                            ev && ev.preventDefault();
                            const latRaw = document.getElementById('modalRequestLat') && document.getElementById('modalRequestLat').value;
                            const lngRaw = document.getElementById('modalRequestLng') && document.getElementById('modalRequestLng').value;
                            const lat = (latRaw && !isNaN(Number(latRaw))) ? Number(latRaw) : null;
                            const lng = (lngRaw && !isNaN(Number(lngRaw))) ? Number(lngRaw) : null;
                            this._renderRequestModalMap(lat, lng);
                        } catch(e){ console.warn('modal update map failed', e); }
                    });
                }
            } catch(e){}
        }
    }

    setupToastHandlers() {
        const toastClose = document.getElementById('toastClose');
        if (toastClose) {
            toastClose.addEventListener('click', (e) => {
                e.preventDefault();
                this.hideToast();
            });
        }
    }

    // Navigation methods
    navigateToRequestPickup() {
        this.showView('requestPickup');
        this.initRequestForm();
    }

    navigateToViewRequests() {
        this.showView('customerRequests');
        this.showCustomerRequests();
    }

    setRole(role) {
        // Stronger enforcement: refresh authoritative user from server before allowing role switch
        const tryEnforce = async () => {
            if (this.currentUser && this.currentUser.phone) {
                try {
                    const headers = {};
                    try { if (window.__getAuthToken) { const t = window.__getAuthToken(); if (t) headers['Authorization'] = 'Bearer ' + t; } } catch(e){}
                    const base = this.getApiBase();
                    const res = await fetch(base + '/api/users?phone=' + encodeURIComponent(this.currentUser.phone), { headers });
                    if (res && res.ok) {
                        const fresh = await res.json();
                        if (fresh) {
                            this.currentUser = fresh;
                            try { if (window.__setAuthUser) window.__setAuthUser(fresh); } catch(e) {}
                        }
                    }
                } catch (e) {
                    // ignore refresh errors and fall back to local info
                    console.warn('Failed to refresh user for role enforcement', e);
                }
                const userRole = (this.currentUser && this.currentUser.role) ? String(this.currentUser.role).toLowerCase() : '';
                if (!userRole) {
                    // no authoritative role: require re-login for safety
                    this.showLoginModal(role, true);
                    return false;
                }
                if (userRole !== role && userRole !== 'admin') {
                    this.showLoginModal(role, true);
                    return false;
                }
            }
            // allowed
            this.currentRole = role;
            return true;
        };

        // run enforcement (non-blocking from callers)
        tryEnforce().then((ok) => {
            if (!ok) return;
            const header = document.getElementById('header');
            const backBtn = document.getElementById('backBtn');
            if (header) header.style.display = 'block';
            if (backBtn) backBtn.style.display = 'inline-block';

            // If role is customer and user not logged in, redirect to standalone customer login
            if (!this.currentUser && role === 'customer') {
                try { window.location.href = 'customer_login.html'; } catch(e) { this.showLoginModal(role); }
                return;
            }
            // If user not logged in for other roles, prompt for login
            if (!this.currentUser) {
                this.showLoginModal(role);
                return;
            }

            // Ensure we load authoritative lists (requests, dealers, scrapTypes) from server if available
            try { this.loadDealers(); this.loadScrapTypes(); this.loadRequests(); } catch(e){}
            switch(role) {
                case 'customer':
                    this.showView('customerHome');
                    this.initCustomerView();
                    break;
                case 'dealer':
                    this.showView('dealerDashboard');
                    this.initDealerView();
                    break;
                case 'admin':
                    this.showView('adminDashboard');
                    this.initAdminView();
                    break;
            }
        });
        const header = document.getElementById('header');
        const backBtn = document.getElementById('backBtn');
    }

    showLoginModal(intendedRole, suppressToast = false) {
    // If user already set (e.g., redirected from standalone login), do not show the modal
    try { if (this.currentUser && this.currentUser.phone) { if (intendedRole) this.setRole(intendedRole); return; } } catch(e){}
        // use the new modal UI
        const modal = document.getElementById('loginModal');
        const phoneInput = document.getElementById('modalLoginPhone');
        const roleSelect = document.getElementById('modalLoginRole');
        const submit = document.getElementById('modalLoginSubmit');
        const cancel = document.getElementById('modalLoginCancel');

        if (!modal || !phoneInput || !roleSelect || !submit || !cancel) {
            // fallback: ask using window.prompt but avoid logging raw strings
            const phone = window.prompt((window.i18n?window.i18n.t('enterPhonePrompt'):'Enter phone number to login:'));
            if (!phone) { if(!suppressToast) this.showToast((window.i18n?window.i18n.t('loginRequired'):'Login required to proceed'), 'error'); return; }
            let p = phone.trim();
            if (p && !p.startsWith('+') && /^\d+$/.test(p)) p = '+' + p;
            this.performLogin(p, intendedRole);
            return;
        }

        // prefill
        phoneInput.value = '';
        roleSelect.value = intendedRole || '';

    modal.classList.remove('hidden');

    const onCancel = (e) => {
            e && e.preventDefault();
            modal.classList.add('hidden');
            submit.removeEventListener('click', onSubmit);
            cancel.removeEventListener('click', onCancel);
        };

    const onSubmit = (e) => {
            e && e.preventDefault();
            let p = phoneInput.value && phoneInput.value.trim();
            if (!p) { this.showToast(window.i18n ? (window.i18n.t('enterPhonePrompt') || 'Enter phone number to login') : 'Enter phone number to login', 'error'); return; }
            if (p && !p.startsWith('+') && /^\d+$/.test(p)) p = '+' + p;
            const selectedRole = roleSelect.value || intendedRole;
            modal.classList.add('hidden');
            submit.removeEventListener('click', onSubmit);
            cancel.removeEventListener('click', onCancel);
            this.performLogin(p, selectedRole);
        };

        submit.addEventListener('click', onSubmit);
        cancel.addEventListener('click', onCancel);
    }

    async performLogin(phone, intendedRole) {
        try {
            // normalize phone to 10 digits
            const digits = String(phone || '').replace(/\D/g, '');
            if (digits.length < 10) { this.showToast('Phone must contain at least 10 digits', 'error'); return; }
            phone = digits.slice(-10);
            const base = this.getApiBase();
            const res = await fetch(base + '/api/users?phone=' + encodeURIComponent(phone));
            let user = null;
            if (res.ok) user = await res.json();
            if (!user) {
                const create = await fetch(base + '/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
                if (!create.ok) throw new Error('Create user failed');
                user = await create.json();
            }
            this.currentUser = user;
            // inform api shim about new user so token is picked up and requests re-fetched
            try { if (window.__setAuthUser) window.__setAuthUser(user); } catch(e) {}
            document.getElementById('loginBtn').style.display = 'none';
            document.getElementById('logoutBtn').style.display = '';
            this.showToast((window.i18n ? ((window.i18n.t('loggedInAs') || 'Logged in as') + ' ' + (user.name || user.phone)) : ('Logged in as ' + (user.name || user.phone))), 'success');
            // enforce role: if intendedRole provided, only allow proceed if user.role matches or user is admin
            if (intendedRole) {
                const userRole = (user.role || '').toLowerCase();
                if (userRole && userRole !== intendedRole && userRole !== 'admin') {
                    this.showToast('Account role does not match the selected role', 'error');
                    return;
                }
                if (!userRole) {
                    // account exists but has no assigned role — prompt user to sign in with a role-enabled account
                    this.showToast('Account has no role assigned. Sign in with an account that has the role "' + intendedRole + '" or contact admin.', 'info');
                    return;
                }
                // allow and set role
                this.setRole(intendedRole);
            }
        // persist language selection for session (use sessionStorage)
        try { if (window && window.i18n) sessionStorage.setItem('scrap_lang_session', window.i18n.lang); } catch(e){}
        } catch (e) {
            console.error('Login failed', e);
            this.showToast('Login failed', 'error');
        }
    }

    // helper to test logging in all fallback users (useful during dev)
    async testLoginAllUsers() {
        try {
            const base = this.getApiBase();
            const res = await fetch(base + '/api/users?phone=');
            // if API doesn't return list, use fallback data
            // We'll just iterate known phones in fallback file via app_data_fallback.json if accessible
            const fallback = await fetch('/app_data_fallback.json').then(r => r.json()).catch(() => null);
            if (fallback && Array.isArray(fallback.users)) {
                for (const u of fallback.users) {
                    await this.performLogin(u.phone);
                    console.log('Logged in as', u.phone);
                }
            }
        } catch (e) { console.warn('testLoginAllUsers failed', e); }
    }

    showView(viewId) {
        // Hide all views
        document.querySelectorAll('.view').forEach(view => {
            view.classList.add('hidden');
        });

        // Show target view
        const targetView = document.getElementById(viewId);
        if (targetView) {
            targetView.classList.remove('hidden');
            this.currentView = viewId;
        }

        // Update navigation visibility
        if (viewId === 'roleSelection') {
            const header = document.getElementById('header');
            if (header) header.style.display = 'none';
        }

        // Re-setup event listeners for the new view
        this.setupCustomerActions();
    // Re-apply translations when view changes
    try { if (window.i18n) window.i18n.applyToDOM(); } catch(e){}
    // Refresh auth UI visibility after view change
    try { this.updateAuthUI(); } catch(e){}
    }

    goBack() {
        switch(this.currentRole) {
            case 'customer':
                this.showView('customerHome');
                break;
            case 'dealer':
                this.showView('dealerDashboard');
                break;
            case 'admin':
                this.showView('adminDashboard');
                break;
            default:
                this.currentRole = null;
                this.showView('roleSelection');
                const header = document.getElementById('header');
                if (header) header.style.display = 'none';
        }
    }

    initCustomerView() {
        this.renderPriceGrid();
        // Re-setup customer action listeners after view change
        setTimeout(() => this.setupCustomerActions(), 100);
    }

    renderPriceGrid() {
        const priceGrid = document.getElementById('priceGrid');
        if (priceGrid) {
            priceGrid.innerHTML = this.scrapTypes.map(scrap => `
                <div class="price-card">
                    <h4>${scrap.name}</h4>
                    <div class="price">₹${scrap.pricePerKg}/kg</div>
                    <p>${scrap.description}</p>
                </div>
            `).join('');
        }
        try { if (window.i18n) window.i18n.applyToDOM(); } catch(e){}
    }

    initRequestForm() {
        this.populateScrapSelects();
        
        const today = new Date().toISOString().split('T')[0];
        const dateInput = document.querySelector('input[name="preferredDate"]');
    if (dateInput) {
            dateInput.min = today;
            dateInput.value = today;
        }

        this.currentLocation = null;
        const locationDisplay = document.getElementById('locationDisplay');
        const locationBtn = document.getElementById('getLocation');
        
        if (locationDisplay) locationDisplay.classList.add('hidden');
        if (locationBtn) {
            locationBtn.disabled = false;
            locationBtn.style.background = '';
            locationBtn.style.color = '';
            // localize the location button label if i18n is available
            try { locationBtn.textContent = (window.i18n ? '📍 ' + window.i18n.t('getLocation') || '📍 Get Current Location' : '📍 Get Current Location'); } catch(e) { locationBtn.textContent = '📍 Get Current Location'; }
        }

        this.updateEstimate();
        // Add image upload input if not present
        if (!document.getElementById('requestImages')) {
            const scrapSection = document.querySelector('.form-section');
            const wrapper = document.createElement('div');
            wrapper.className = 'form-group';
            wrapper.innerHTML = `<label class="form-label">Images</label><input type="file" id="requestImages" accept="image/*" multiple>`;
            const form = document.getElementById('pickupForm');
            if (form) form.querySelector('.form-actions').insertAdjacentElement('beforebegin', wrapper);
            const input = document.getElementById('requestImages');
            if (input) input.addEventListener('change', (e) => this.handleImageSelection(e));
        }
    }

    async handleImageSelection(e) {
        const files = Array.from(e.target.files || []);
        this._pendingImages = await Promise.all(files.map(f => new Promise((res) => {
            const reader = new FileReader();
            reader.onload = () => res({ name: f.name, data: reader.result });
            reader.readAsDataURL(f);
        })));
        this.showToast(this._pendingImages.length + ' images selected', 'info');
    }

    // Validate payload before sending
    validateRequestPayload(payload) {
        const required = ['customerName','phone','address','scrapTypes','preferredDate'];
        for (const k of required) if (!payload[k] || (Array.isArray(payload[k]) && payload[k].length===0)) return `${k} is required`;
        if (!/^[+\d]{7,20}$/.test(payload.phone)) return 'Invalid phone format';
        return null;
    }

    captureLocation() {
        const btn = document.getElementById('getLocation');
        const display = document.getElementById('locationDisplay');
        const coordinates = document.getElementById('coordinates');

        if (btn) {
            btn.classList.add('loading');
            btn.textContent = 'Getting Location...';
        }

        const onSuccess = (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            this.currentLocation = { lat, lng };
            if (coordinates) coordinates.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            if (display) {
                display.classList.remove('hidden');
                // render a simple map iframe (use Google Maps search link)
                const mapContainerId = 'currentLocationMap';
                let mapEl = document.getElementById(mapContainerId);
                if (!mapEl) {
                    mapEl = document.createElement('div');
                    mapEl.id = mapContainerId;
                    mapEl.style.marginTop = '8px';
                    mapEl.style.height = '200px';
                    mapEl.style.borderRadius = '6px';
                    display.appendChild(mapEl);
                }
                mapEl.innerHTML = `<iframe width="100%" height="200" frameborder="0" style="border:0" src="https://www.google.com/maps?q=${lat},${lng}&hl=es;z=14&output=embed" allowfullscreen></iframe>`;
            }
            if (btn) {
                btn.classList.remove('loading');
                btn.textContent = '📍 Location Captured';
                btn.disabled = true;
                btn.style.background = 'var(--color-app-success)';
                btn.style.color = 'white';
            }
            this.showToast('Location captured successfully!', 'success');
        };

        const onError = (err) => {
            console.warn('Geolocation failed, falling back to random location', err);
            // fallback: pick a nearby random location from predefined list
            const randomLocation = this.locations[Math.floor(Math.random() * this.locations.length)];
            this.currentLocation = {
                lat: randomLocation.lat + (Math.random() - 0.5) * 0.01,
                lng: randomLocation.lng + (Math.random() - 0.5) * 0.01
            };
            if (coordinates) coordinates.textContent = `${this.currentLocation.lat.toFixed(6)}, ${this.currentLocation.lng.toFixed(6)}`;
            if (display) {
                display.classList.remove('hidden');
                const mapContainerId = 'currentLocationMap';
                let mapEl = document.getElementById(mapContainerId);
                if (!mapEl) {
                    mapEl = document.createElement('div');
                    mapEl.id = mapContainerId;
                    mapEl.style.marginTop = '8px';
                    mapEl.style.height = '200px';
                    mapEl.style.borderRadius = '6px';
                    display.appendChild(mapEl);
                }
                const lat = this.currentLocation.lat;
                const lng = this.currentLocation.lng;
                mapEl.innerHTML = `<iframe width="100%" height="200" frameborder="0" style="border:0" src="https://www.google.com/maps?q=${lat},${lng}&hl=es;z=14&output=embed" allowfullscreen></iframe>`;
            }
            if (btn) {
                btn.classList.remove('loading');
                btn.textContent = '📍 Location Captured';
                btn.disabled = true;
                btn.style.background = 'var(--color-app-success)';
                btn.style.color = 'white';
            }
            this.showToast('Location captured (approx) — geolocation not available', 'info');
        };

        if (navigator && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(onSuccess, onError, { enableHighAccuracy: true, timeout: 8000 });
        } else {
            // no geolocation API
            onError(new Error('Geolocation not supported'));
        }
    }

    addScrapItem() {
        const scrapItems = document.getElementById('scrapItems');
        if (!scrapItems) return;
        
        const newItem = document.createElement('div');
        newItem.className = 'scrap-item';
        newItem.innerHTML = `
            <button type="button" class="remove-item">×</button>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">Scrap Type *</label>
                    <select class="form-control" name="scrapType" required>
                        <option value="">Select scrap type</option>
                        ${this.scrapTypes.map(scrap => `<option value="${scrap.name}">${scrap.name} (₹${scrap.pricePerKg}/kg)</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Quantity (kg) *</label>
                    <input type="number" class="form-control" name="quantity" min="1" required>
                </div>
            </div>
        `;
        
        scrapItems.appendChild(newItem);
        
        // Add event listeners to the new elements
        const removeBtn = newItem.querySelector('.remove-item');
        const select = newItem.querySelector('select[name="scrapType"]');
        const input = newItem.querySelector('input[name="quantity"]');
        
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                newItem.remove();
                this.updateEstimate();
            });
        }
        
        if (select) {
            select.addEventListener('change', () => this.updateEstimate());
        }
        if (input) {
            input.addEventListener('input', () => this.updateEstimate());
        }
    }

    populateScrapSelects() {
        const selects = document.querySelectorAll('select[name="scrapType"]');
        selects.forEach(select => {
            if (select.children.length <= 1) {
                select.innerHTML = `
                    <option value="">Select scrap type</option>
                    ${this.scrapTypes.map(scrap => `<option value="${scrap.name}">${scrap.name} (₹${scrap.pricePerKg}/kg)</option>`).join('')}
                `;
                
                select.addEventListener('change', () => this.updateEstimate());
            }
        });
    }

    updateEstimate() {
        let totalValue = 0;
        const scrapItems = document.querySelectorAll('.scrap-item');
        
        scrapItems.forEach(item => {
            const scrapTypeSelect = item.querySelector('select[name="scrapType"]');
            const quantityInput = item.querySelector('input[name="quantity"]');
            
            if (scrapTypeSelect && quantityInput) {
                const scrapType = scrapTypeSelect.value;
                const quantity = parseFloat(quantityInput.value) || 0;
                
                const scrapData = this.scrapTypes.find(s => s.name === scrapType);
                if (scrapData && quantity > 0) {
                    totalValue += scrapData.pricePerKg * quantity;
                }
            }
        });
        
        const totalValueElement = document.getElementById('totalValue');
        if (totalValueElement) {
            totalValueElement.textContent = totalValue.toFixed(0);
        }
    }

    submitPickupRequest(form) {
        if (!this.currentLocation) {
            this.showToast('Please capture your location first', 'error');
            return;
        }

        const formData = new FormData(form);
        const scrapItems = [];
        const scrapItemElements = document.querySelectorAll('.scrap-item');
        
        scrapItemElements.forEach(item => {
            const scrapTypeSelect = item.querySelector('select[name="scrapType"]');
            const quantityInput = item.querySelector('input[name="quantity"]');
            
            if (scrapTypeSelect && quantityInput) {
                const scrapType = scrapTypeSelect.value;
                const quantity = parseFloat(quantityInput.value);
                
                if (scrapType && quantity > 0) {
                    scrapItems.push({ type: scrapType, quantity });
                }
            }
        });

            if (scrapItems.length === 0) {
            this.showToast(window.i18n ? (window.i18n.t('pleaseAddAtLeastOne') || 'Please add at least one scrap item') : 'Please add at least one scrap item', 'error');
            return;
        }

        const newRequest = {
            id: this.requestIdCounter++,
            customerName: formData.get('customerName'),
            phone: formData.get('phone'),
            email: formData.get('email') || '',
            address: formData.get('address'),
            lat: this.currentLocation.lat,
            lng: this.currentLocation.lng,
            scrapTypes: scrapItems,
            preferredDate: formData.get('preferredDate'),
            preferredTime: formData.get('preferredTime'),
            instructions: formData.get('instructions') || '',
            status: 'Pending',
            requestDate: new Date().toISOString().split('T')[0],
            dealerId: null
        };

        this.requests.push(newRequest);
        this.saveData();

        this.showToast('Pickup request submitted successfully!', 'success');
        
        form.reset();
        this.currentLocation = null;
        
        setTimeout(() => {
            this.showView('customerHome');
        }, 2000);
    }

    initDealerView() {
        // Determine the dealer id for the current dealer user. Prefer the logged-in user's dealerId.
        let dealerId = 1;
        try {
            if (this.currentUser && (this.currentUser.dealerId || this.currentUser.dealerId === 0)) {
                dealerId = Number(this.currentUser.dealerId) || dealerId;
            } else if (this.dealers && this.dealers.length) {
                // fallback: if dealers list exists, pick the first active dealer as default
                const first = this.dealers.find(d => d && d.id != null);
                if (first) dealerId = Number(first.id) || dealerId;
            }
        } catch (e) { /* ignore and use default */ }
    this.currentDealerId = dealerId;
    this.renderDealerDashboard(dealerId);
    }

    renderDealerDashboard(dealerId) {
    // normalize id comparisons since data may contain numeric or string ids
    const dealer = this.dealers.find(d => String(d.id) === String(dealerId));
        if (!dealer) return;

    const assignedRequests = (this.requests || []).filter(r => String(r.dealerId) === String(dealerId));
        const pendingRequests = assignedRequests.filter(r => r.status === 'Assigned').length;
        
        const pendingElement = document.getElementById('pendingRequests');
        const completedElement = document.getElementById('completedJobs');
        const ratingElement = document.getElementById('dealerRating');
        
        if (pendingElement) pendingElement.textContent = pendingRequests;
        if (completedElement) completedElement.textContent = dealer.completedJobs;
        if (ratingElement) ratingElement.textContent = dealer.rating.toFixed(1);

        this.renderDealerRequests(assignedRequests);
    }

    renderDealerRequests(requests) {
        const container = document.getElementById('dealerRequestsList');
        if (!container) return;
        
        if (requests.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary);">' + (window.i18n ? window.i18n.t('noAssignedRequests') || 'No requests assigned yet.' : 'No requests assigned yet.') + '</p>';
            try { if (window.i18n) window.i18n.applyToDOM(); } catch(e){}
            return;
        }

        container.innerHTML = requests.map(request => `
            <div class="request-card">
                <div class="request-header">
                    <div>
                        <div class="request-id">${(window.i18n ? window.i18n.t('requestIdPrefix') : 'Request #')}${request.id}</div>
                        <div class="request-date">${new Date(request.requestDate).toLocaleDateString()}</div>
                    </div>
                    <span class="status-badge status-${(request.status||'').toLowerCase()}">${request.status||''}</span>
                </div>
                <div class="request-content">
                    <div class="request-details">
                        <h4>${request.customerName}</h4>
                        <div class="request-info">📞 ${request.phone}</div>
                        <div class="request-info">📍 ${request.address} ${request.lat && request.lng ? `<a href="https://www.google.com/maps/search/?api=1&query=${request.lat},${request.lng}" target="_blank" rel="noopener" style="margin-left:8px;">🗺️ Open map</a>` : ''}</div>
                        <div class="request-info">📅 ${request.preferredDate} (${this.formatTimeSlot(request.preferredTime)})</div>
                        ${request.instructions ? `<div class="request-info">📝 ${request.instructions}</div>` : ''}

                        ${request.images && request.images.length ? `<div class="request-images">${request.images.map(img => `<img src="${img}" alt="image" style="max-width:100px;max-height:80px;margin:4px;cursor:pointer;border-radius:6px;object-fit:cover" onclick="window.open('${img}','_blank')">`).join('')}</div>` : ''}

                        <div class="scrap-list">
                            <div class="scrap-list-header">
                                <div>Type</div>
                                <div style="text-align:right">Rate</div>
                                <div style="text-align:right">Qty</div>
                                <div style="text-align:right">Subtotal</div>
                            </div>
                            ${request.scrapTypes.map(item => {
                                const rate = (typeof item.appliedRate !== 'undefined' && item.appliedRate !== null) ? Number(item.appliedRate) : (this.scrapTypes.find(s => s.name === item.type)?.pricePerKg || 0);
                                const subtotal = Math.round(rate * (item.quantity || 0));
                                return `
                                <div class="scrap-item-display">
                                    <div class="scrap-type">${item.type}</div>
                                    <div class="scrap-rate">₹${rate}/kg</div>
                                    <div class="scrap-qty">${item.quantity} kg</div>
                                    <div class="scrap-subtotal">₹${subtotal}</div>
                                </div>
                            `}).join('')}
                        </div>
                        <div class="estimated-value" style="margin-top:8px;">
                            <h4>Estimated Value: ₹${this.calculateRequestValue(request)}</h4>
                        </div>
                    </div>
                    <div class="request-actions">
                        ${this.getDealerActions(request)}
                        <button class="btn btn--outline btn--sm" data-action="edit-request" data-request-id="${request.id}">Edit</button>
                    </div>
                </div>
            </div>
        `).join('');
        try { if (window.i18n) window.i18n.applyToDOM(); } catch(e){}
    }

    // Open request edit modal (dealer only)
    openRequestEditModal(requestId) {
        try {
            const req = this.requests.find(r => String(r.id) === String(requestId));
            if (!req) return;
            const modal = document.getElementById('requestEditModal');
            if (!modal) return;
            document.getElementById('modalRequestId').value = req.id;
            document.getElementById('modalRequestCustomerName').value = req.customerName || '';
            document.getElementById('modalRequestPhone').value = req.phone || '';
            document.getElementById('modalRequestAddress').value = req.address || '';
            document.getElementById('modalRequestDate').value = req.preferredDate || '';
            document.getElementById('modalRequestTime').value = req.preferredTime || '';
            document.getElementById('modalRequestInstructions').value = req.instructions || '';
            // populate dynamic scrap item rows
            try {
                const container = document.getElementById('modalRequestScrapItemsContainer');
                if (container) {
                    container.innerHTML = '';
                    (req.scrapTypes || []).forEach(it => { this._modalAddScrapItemRow({ type: it.type, quantity: it.quantity, appliedRate: (it.appliedRate || it.rate) }); });
                    // if none, add one empty row
                    if (!(req.scrapTypes || []).length) this._modalAddScrapItemRow();
                }
            } catch(e){ try { const container = document.getElementById('modalRequestScrapItemsContainer'); if (container) container.innerHTML = ''; } catch(e){} }
            document.getElementById('modalRequestSuccess').style.display = 'none';
            // populate lat/lng
            try { document.getElementById('modalRequestLat').value = (typeof req.lat !== 'undefined' && req.lat !== null) ? String(req.lat) : ''; } catch(e){}
            try { document.getElementById('modalRequestLng').value = (typeof req.lng !== 'undefined' && req.lng !== null) ? String(req.lng) : ''; } catch(e){}
            // render map preview if coords available
            try { this._renderRequestModalMap(req.lat, req.lng); } catch(e){}
            // ensure Leaflet map picker is initialized for the modal
            try { this._ensureLeafletForModal(req.lat, req.lng); } catch(e){}
            // render existing images with checkboxes
            try { this._renderRequestModalExistingImages(req.images || []); } catch(e){}
            // clear any previously selected uploads
            try { const up = document.getElementById('modalRequestImageUpload'); if (up) up.value = ''; } catch(e){}
            // wire upload change handler (idempotent)
            try { const up = document.getElementById('modalRequestImageUpload'); if (up && !up._wired) { up.addEventListener('change', (e) => this._handleModalImageUpload(e)); up._wired = true; } } catch(e){}

            // wire add scrap item button (idempotent)
            try {
                const addBtn = document.getElementById('modalAddScrapItem');
                if (addBtn && !addBtn._wired) {
                    addBtn.addEventListener('click', (ev) => { ev && ev.preventDefault(); this._modalAddScrapItemRow(); });
                    addBtn._wired = true;
                }
            } catch(e){}

            modal.classList.remove('hidden');
        } catch(e){ console.warn('openRequestEditModal failed', e); }
    }

    async saveRequestEditModal() {
        try {
            const modal = document.getElementById('requestEditModal'); if (!modal) return;
            const id = document.getElementById('modalRequestId').value;
            const customerName = document.getElementById('modalRequestCustomerName').value;
            const phone = document.getElementById('modalRequestPhone').value;
            const address = document.getElementById('modalRequestAddress').value;
            const preferredDate = document.getElementById('modalRequestDate').value;
            const preferredTime = document.getElementById('modalRequestTime').value;
            const instructions = document.getElementById('modalRequestInstructions').value;
            // collect scrap item rows
            let scrapTypes = [];
            try {
                const rows = Array.from(document.querySelectorAll('#modalRequestScrapItemsContainer .modal-scrap-row'));
                    scrapTypes = rows.map(r => {
                        const t = r.querySelector('.modal-scrap-type');
                        const q = r.querySelector('.modal-scrap-qty');
                        const rateEl = r.querySelector('.modal-scrap-rate');
                        if (!t || !t.value) return null;
                        const qty = Number(q && q.value) || 0;
                        // prefer explicit rate entered by dealer, otherwise fall back to master price
                        let rate = null;
                        try { rate = rateEl && rateEl.value ? Number(rateEl.value) : null; } catch(e){ rate = null; }
                        if (!rate || isNaN(rate) || rate <= 0) {
                            const master = this.scrapTypes.find(s => s.name === t.value);
                            rate = master ? master.pricePerKg : null;
                        }
                        return { type: t.value, quantity: qty, appliedRate: (rate !== null ? Number(rate) : null) };
                    }).filter(Boolean);
            } catch(e){ scrapTypes = []; }
            // lat/lng
            const latRaw = document.getElementById('modalRequestLat') && document.getElementById('modalRequestLat').value;
            const lngRaw = document.getElementById('modalRequestLng') && document.getElementById('modalRequestLng').value;
            const lat = (latRaw && !isNaN(Number(latRaw))) ? Number(latRaw) : null;
            const lng = (lngRaw && !isNaN(Number(lngRaw))) ? Number(lngRaw) : null;

            const requestIndex = this.requests.findIndex(r => String(r.id) === String(id));
            if (requestIndex === -1) return;

            // Update locally
            this.requests[requestIndex].customerName = customerName;
            this.requests[requestIndex].phone = phone;
            this.requests[requestIndex].address = address;
            this.requests[requestIndex].preferredDate = preferredDate;
            this.requests[requestIndex].preferredTime = preferredTime;
            this.requests[requestIndex].instructions = instructions;
            this.requests[requestIndex].scrapTypes = scrapTypes;
            // update coords if provided
            if (lat !== null && lng !== null) {
                this.requests[requestIndex].lat = lat;
                this.requests[requestIndex].lng = lng;
            }
            // handle images: remove checked, append uploaded
            try {
                const existingContainer = document.getElementById('modalRequestExistingImages');
                if (existingContainer) {
                    // elements with data-remove='true' will be removed
                    const toRemove = Array.from(existingContainer.querySelectorAll('input[type="checkbox"][data-image-src]')).filter(ch => ch.checked).map(ch => ch.getAttribute('data-image-src'));
                    if (!this.requests[requestIndex].images) this.requests[requestIndex].images = [];
                    if (toRemove.length) {
                        this.requests[requestIndex].images = (this.requests[requestIndex].images || []).filter(src => toRemove.indexOf(src) === -1);
                    }
                }
            } catch(e) { console.warn('removing images failed', e); }
            // append any newly uploaded images that were staged on the app instance
            try {
                if (this._modalNewImages && Array.isArray(this._modalNewImages) && this._modalNewImages.length) {
                    if (!this.requests[requestIndex].images) this.requests[requestIndex].images = [];
                    // push Data URLs (client-only storage) at end
                    this.requests[requestIndex].images = this.requests[requestIndex].images.concat(this._modalNewImages);
                    // clear staging
                    this._modalNewImages = [];
                }
            } catch(e){ console.warn('appending new images failed', e); }
            this.saveData();

            // Optimistically show success
            try { document.getElementById('modalRequestSuccess').style.display = 'block'; } catch(e){}

            // Immediately refresh UI views so changes appear right away
            try {
                const dealerIdForRefresh = (this.requests[requestIndex] && this.requests[requestIndex].dealerId) ? this.requests[requestIndex].dealerId : this.currentDealerId;
                if (this.currentRole === 'dealer') this.renderDealerDashboard(dealerIdForRefresh);
                if (this.currentRole === 'customer') this.showCustomerRequests();
                if (this.currentRole === 'admin') this.renderAdminRequests();
            } catch(e){}

            // Persist to server if available (background)
            (async () => {
                try {
                    const base = this.getApiBase();
                    const token = (window.__getAuthToken && window.__getAuthToken()) || null;
                    const headers = { 'Content-Type':'application/json' };
                    if (token) headers['Authorization'] = 'Bearer ' + token;
                    const payload = Object.assign({}, this.requests[requestIndex]);
                    const res = await fetch(base + `/api/requests/${id}`, { method: 'PUT', headers, body: JSON.stringify(payload) });
                    if (!res.ok) {
                        const txt = await res.text(); console.warn('Server failed to save request edit', txt);
                    } else {
                        // refresh authoritative lists
                        await this.loadRequests();
                    }
                } catch (e) { console.warn('Persisting request edit failed', e); }
            })();

            setTimeout(() => { try { modal.classList.add('hidden'); } catch(e){} }, 700);
        } catch(e) { console.warn('saveRequestEditModal failed', e); }
    }

    getDealerActions(request) {
        switch(request.status) {
            case 'Assigned':
                return `
                    <button class="btn btn--app-success btn--sm" data-action="accept" data-request-id="${request.id}">${(window.i18n?window.i18n.t('acceptAndStart'):'Accept & Start')}</button>
                    <button class="btn btn--app-danger btn--sm" data-action="decline" data-request-id="${request.id}">${(window.i18n?window.i18n.t('decline'):'Decline')}</button>
                `;
            case 'En Route':
                return `
                    <button class="btn btn--app-success btn--sm" data-action="complete" data-request-id="${request.id}">${(window.i18n?window.i18n.t('markCompleted'):'Mark Completed')}</button>
                `;
            case 'Completed':
                return `<span class="status-badge status-completed">${(window.i18n?window.i18n.t('completed'):'Completed')}</span>`;
            default:
                return '';
        }
    }

    updateRequestStatus(requestId, newStatus, newDealerId = undefined) {
    const requestIndex = this.requests.findIndex(r => String(r.id) === String(requestId));
        if (requestIndex !== -1) {
            // update locally first
            this.requests[requestIndex].status = newStatus;
            if (newDealerId !== undefined) {
                this.requests[requestIndex].dealerId = Number(newDealerId) || newDealerId;
            }
            this.saveData();
            this.showToast(`Request #${requestId} updated to ${newStatus}`, 'success');

            // If server API available, persist update
            (async () => {
                try {
                    const base = this.getApiBase();
                    const token = (window.__getAuthToken && window.__getAuthToken()) || null;
                    const headers = { 'Content-Type': 'application/json' };
                    if (token) headers['Authorization'] = 'Bearer ' + token;
                    const payload = { status: newStatus };
                    if (newDealerId !== undefined) payload.dealerId = newDealerId;
                    const res = await fetch(base + `/api/requests/${requestId}`, { method: 'PUT', headers, body: JSON.stringify(payload) });
                    if (res && res.ok) {
                        // refresh authoritative list
                        await this.loadRequests();
                    } else {
                        // if server returns error, log and keep fallback local state
                        const txt = await (res ? res.text() : Promise.resolve('no response'));
                        console.warn('Failed to persist request update to server', txt);
                    }
                } catch (e) {
                    console.warn('Persisting request update failed', e);
                }
            })();

            if (this.currentRole === 'dealer') {
                this.renderDealerDashboard(this.currentDealerId);
            } else if (this.currentRole === 'admin') {
                this.initAdminView();
            }
        }
        this.hideModal();
    }

    // Load requests from server (or fallback to local) and normalize ids
    async loadRequests() {
        try {
            const base = this.getApiBase();
            const headers = {};
            try { const t = (window.__getAuthToken && window.__getAuthToken()); if (t) headers['Authorization'] = 'Bearer ' + t; } catch(e){}
            const res = await fetch(base + '/api/requests', { headers });
            if (res && res.ok) {
                const data = await res.json();
                // normalize ids to string/number consistency where appropriate
                this.requests = (data || []).map(r => {
                    try { if (r && r.id && typeof r.id === 'string' && /^\d+$/.test(r.id)) r.id = Number(r.id); } catch(e){}
                    return r;
                });
                this.saveData();
            }
        } catch (e) { console.warn('loadRequests failed', e); }
    }

    formatTimeSlot(timeSlot) {
        const slots = {
            morning: 'Morning (9 AM - 12 PM)',
            afternoon: 'Afternoon (12 PM - 4 PM)',
            evening: 'Evening (4 PM - 7 PM)'
        };
        return slots[timeSlot] || timeSlot;
    }

    // Render a small embedded Google map in the request edit modal
    _renderRequestModalMap(lat, lng) {
        try {
            const mapEl = document.getElementById('modalRequestMap');
            if (!mapEl) return;
            if (typeof lat === 'number' && typeof lng === 'number') {
                mapEl.innerHTML = `<iframe width="100%" height="100%" frameborder="0" style="border:0" src="https://www.google.com/maps?q=${lat},${lng}&hl=es;z=15&output=embed" allowfullscreen></iframe>`;
            } else {
                mapEl.innerHTML = `<div style="padding:18px;color:var(--color-text-secondary);">No coordinates set</div>`;
            }
        } catch(e) { console.warn('_renderRequestModalMap failed', e); }
    }

    // Ensure Leaflet assets are available and create an interactive picker inside the modal
    _ensureLeafletForModal(lat, lng) {
        try {
            if (this._leafletInitialized) return;
            // lazy-load Leaflet script
            const scriptId = 'leaflet-js';
            if (!document.getElementById(scriptId)) {
                const s = document.createElement('script');
                s.id = scriptId;
                s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
                s.onload = () => { setTimeout(()=> this._createLeafletPicker(lat, lng), 120); };
                document.body.appendChild(s);
            } else {
                this._createLeafletPicker(lat, lng);
            }
            this._leafletInitialized = true;
        } catch(e) { console.warn('_ensureLeafletForModal failed', e); }
    }

    _createLeafletPicker(lat, lng) {
        try {
            // create container if not present
            const mapEl = document.getElementById('modalRequestMap');
            if (!mapEl) return;
            mapEl.style.height = '250px';
            mapEl.innerHTML = '';
            // initialize map
            try {
                if (this._modalLeafletMap) {
                    this._modalLeafletMap.remove();
                    this._modalLeafletMap = null;
                }
            } catch(e){}
            const map = L.map(mapEl).setView([(lat||28.6448), (lng||77.2167)], lat && lng ? 15 : 11);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
            let marker = null;
            if (typeof lat === 'number' && typeof lng === 'number') {
                marker = L.marker([lat, lng], { draggable: true }).addTo(map);
                marker.on('dragend', (ev) => {
                    const p = ev.target.getLatLng();
                    try { document.getElementById('modalRequestLat').value = p.lat.toFixed(6); document.getElementById('modalRequestLng').value = p.lng.toFixed(6); } catch(e){}
                });
            }
            // clicking map places marker and updates inputs
            map.on('click', (ev) => {
                const p = ev.latlng;
                if (marker) marker.setLatLng(p); else marker = L.marker(p, { draggable: true }).addTo(map);
                try { document.getElementById('modalRequestLat').value = p.lat.toFixed(6); document.getElementById('modalRequestLng').value = p.lng.toFixed(6); } catch(e){}
            });
            this._modalLeafletMap = map;
        } catch(e) { console.warn('_createLeafletPicker failed', e); }
    }

    // Add a scrap item row in the modal (type + quantity + remove)
    _modalAddScrapItemRow(initial) {
        try {
            const container = document.getElementById('modalRequestScrapItemsContainer');
            if (!container) return;
            const row = document.createElement('div');
            row.className = 'modal-scrap-row';
            row.style.display = 'flex';
            row.style.flexWrap = 'nowrap';
            row.style.gap = '8px';
            row.style.alignItems = 'center';
            row.style.width = '100%';
            // Layout: [select][rate][qty][remove]
            const selectHtml = `<select class="form-control modal-scrap-type" style="flex:1 1 auto;min-width:160px;margin-right:4px"><option value="">Select scrap type</option>${this.scrapTypes.map(s=>`<option value="${s.name}">${s.name}</option>`).join('')}</select>`;
            const rateHtml = `<input class="form-control modal-scrap-rate" type="number" step="0.1" min="0" value="${initial && (initial.appliedRate || initial.rate) ? (initial.appliedRate || initial.rate) : ''}" placeholder="₹/kg" style="width:90px;font-size:0.9em;color:var(--color-text-secondary);display:${initial && (initial.appliedRate || initial.rate) ? 'inline-block':'none'}">`;
            const qtyHtml = `<input class="form-control modal-scrap-qty" type="number" min="0" value="${initial && initial.quantity?initial.quantity:1}" style="width:90px">`;
            const removeBtnHtml = `<button type="button" class="btn btn--outline modal-scrap-remove" title="Remove" style="width:40px;padding:6px 8px;line-height:1;border-radius:6px">×</button>`;
            row.innerHTML = selectHtml + rateHtml + qtyHtml + removeBtnHtml;
            container.appendChild(row);
            const select = row.querySelector('.modal-scrap-type');
            const qty = row.querySelector('.modal-scrap-qty');
            const rem = row.querySelector('.modal-scrap-remove');
            const rate = row.querySelector('.modal-scrap-rate');
            if (initial && initial.type) select.value = initial.type;
            const updateEstimate = () => { try { this._modalRecalculateEstimate(); } catch(e){} };
            // when scrap type changes, populate and show rate input with default price (editable)
            select.addEventListener('change', () => {
                try {
                    const name = select.value;
                    const data = this.scrapTypes.find(s => s.name === name);
                    if (data && rate) { rate.value = data.pricePerKg || ''; rate.style.display = 'inline-block'; }
                    else if (rate) { rate.value = ''; rate.style.display = 'none'; }
                } catch(e){}
                updateEstimate();
            });
            qty.addEventListener('input', updateEstimate);
            if (rate) rate.addEventListener('input', updateEstimate);
            rem.addEventListener('click', () => { row.remove(); this._modalRecalculateEstimate(); });
            // initial estimate update
            setTimeout(() => this._modalRecalculateEstimate(), 50);
        } catch(e) { console.warn('_modalAddScrapItemRow failed', e); }
    }

    _modalRecalculateEstimate() {
        try {
            const rows = Array.from(document.querySelectorAll('#modalRequestScrapItemsContainer .modal-scrap-row'));
            let total = 0;
            rows.forEach(r => {
                const t = r.querySelector('.modal-scrap-type');
                const q = r.querySelector('.modal-scrap-qty');
                const rateInput = r.querySelector('.modal-scrap-rate');
                if (!t || !q) return;
                const name = t.value;
                const qty = Number(q.value) || 0;
                const rateVal = Number(rateInput && rateInput.value) || null;
                if (rateVal !== null && !isNaN(rateVal) && rateVal > 0 && qty > 0) {
                    total += rateVal * qty;
                } else {
                    const data = this.scrapTypes.find(s => s.name === name);
                    if (data && qty>0) total += data.pricePerKg * qty;
                }
            });
            const est = document.getElementById('modalRequestEstimate');
            if (est) est.textContent = `Estimated: ₹${Math.round(total)}`;
        } catch(e) { console.warn('_modalRecalculateEstimate failed', e); }
    }

    // Render existing images in modal with checkboxes for removal
    _renderRequestModalExistingImages(images) {
        try {
            const container = document.getElementById('modalRequestExistingImages');
            if (!container) return;
            container.innerHTML = '';
            (images || []).forEach((src, idx) => {
                const wrap = document.createElement('div');
                wrap.style.display = 'flex';
                wrap.style.flexDirection = 'column';
                wrap.style.alignItems = 'center';
                wrap.style.width = '100px';
                wrap.style.fontSize = '12px';
                wrap.innerHTML = `<img src="${src}" alt="img${idx}" style="width:100px;height:70px;object-fit:cover;border-radius:6px;cursor:pointer;" onclick="window.open('${src}','_blank')"><label style="display:flex;align-items:center;gap:6px;margin-top:6px;"><input type="checkbox" data-image-src="${src}"> Remove</label>`;
                container.appendChild(wrap);
            });
        } catch(e) { console.warn('_renderRequestModalExistingImages failed', e); }
    }

    // Handle selecting new files in the modal and read them to data URLs (staged until Save)
    async _handleModalImageUpload(e) {
        try {
            const files = Array.from(e.target.files || []);
            if (!files.length) return;
            // inline validation: limit count and size (1.5MB per file)
            const MAX_FILES = 5;
            const MAX_SIZE = 1.5 * 1024 * 1024;
            const staged = this._modalNewImages || [];
            const errorEl = document.getElementById('modalRequestImageError');
            if (staged.length + files.length > MAX_FILES) {
                if (errorEl) { errorEl.style.display = 'block'; errorEl.textContent = `Max ${MAX_FILES} images allowed.`; }
                return;
            }
            const oversized = files.filter(f => f.size > MAX_SIZE);
            if (oversized.length) {
                if (errorEl) { errorEl.style.display = 'block'; errorEl.textContent = `Each image must be <= ${Math.round(MAX_SIZE/1024)} KB.`; }
                return;
            }
            if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }
            const read = await Promise.all(files.map(f => new Promise((res, rej) => {
                const r = new FileReader();
                r.onload = () => res(r.result);
                r.onerror = (err) => rej(err);
                r.readAsDataURL(f);
            })));
            // stage on instance so saveRequestEditModal can append
            this._modalNewImages = (this._modalNewImages || []).concat(read);
            this._renderModalStagedThumbnails();
            this.showToast(read.length + ' images ready to add', 'info');
        } catch(e) { console.warn('_handleModalImageUpload failed', e); }
    }

    // Render staged thumbnails for new images (allow removal before saving)
    _renderModalStagedThumbnails() {
        try {
            const container = document.getElementById('modalRequestNewImages');
            if (!container) return;
            container.innerHTML = '';
            (this._modalNewImages || []).forEach((dataUrl, idx) => {
                const wrap = document.createElement('div');
                wrap.style.width = '100px';
                wrap.style.display = 'flex';
                wrap.style.flexDirection = 'column';
                wrap.style.alignItems = 'center';
                const img = document.createElement('img'); img.src = dataUrl; img.style.width = '100px'; img.style.height = '70px'; img.style.objectFit = 'cover'; img.style.borderRadius = '6px'; img.style.cursor = 'pointer'; img.onclick = () => window.open(dataUrl,'_blank');
                const rem = document.createElement('button'); rem.className = 'btn btn--outline'; rem.style.marginTop = '6px'; rem.textContent = 'Remove';
                rem.addEventListener('click', () => {
                    this._modalNewImages.splice(idx,1);
                    this._renderModalStagedThumbnails();
                });
                wrap.appendChild(img); wrap.appendChild(rem);
                container.appendChild(wrap);
            });
        } catch(e) { console.warn('_renderModalStagedThumbnails failed', e); }
    }

    initAdminView() {
    // Load server-backed lists and then render
    this.renderAdminStats();
    // fetch latest data from server
    this.loadDealers();
    this.loadScrapTypes();
    // ensure requests reflect server/local state
    this.renderAdminRequests();
    // Show requests section by default
    this.showAdminSection('requests');
    }

    renderAdminStats() {
        const totalRequests = this.requests.length;
        const activeDealers = this.dealers.filter(d => d.active).length;
        const completedPickups = this.requests.filter(r => r.status === 'Completed').length;
        
        let totalRevenue = 0;
        this.requests.filter(r => r.status === 'Completed').forEach(request => {
            request.scrapTypes.forEach(item => {
                const scrapData = this.scrapTypes.find(s => s.name === item.type);
                if (scrapData) {
                    totalRevenue += scrapData.pricePerKg * item.quantity;
                }
            });
        });

        const elements = {
            totalRequests: document.getElementById('totalRequests'),
            activeDealers: document.getElementById('activeDealers'),
            completedPickups: document.getElementById('completedPickups'),
            totalRevenue: document.getElementById('totalRevenue')
        };

        if (elements.totalRequests) elements.totalRequests.textContent = totalRequests;
        if (elements.activeDealers) elements.activeDealers.textContent = activeDealers;
        if (elements.completedPickups) elements.completedPickups.textContent = completedPickups;
        if (elements.totalRevenue) elements.totalRevenue.textContent = `₹${totalRevenue.toLocaleString()}`;
    }

    renderAdminRequests() {
        const container = document.getElementById('adminRequestsList');
        if (!container) return;
        
    container.innerHTML = this.requests.map(request => `
            <div class="request-card">
                <div class="request-header">
                    <div>
                        <div class="request-id">${(window.i18n ? window.i18n.t('requestIdPrefix') : 'Request #')}${request.id}</div>
                        <div class="request-date">${new Date(request.requestDate).toLocaleDateString()}</div>
                    </div>
                    <span class="status-badge status-${(request.status||'').toLowerCase()}">${request.status||''}</span>
                </div>
                <div class="request-content">
                    <div class="request-details">
                        <h4>${request.customerName}</h4>
                        <div class="request-info">📞 ${request.phone}</div>
                        <div class="request-info">📍 ${request.address} ${request.lat && request.lng ? `<a href="https://www.google.com/maps/search/?api=1&query=${request.lat},${request.lng}" target="_blank" rel="noopener" style="margin-left:8px;">🗺️ Open map</a>` : ''}</div>
                        <div class="request-info">📅 ${request.preferredDate}</div>
                        ${request.dealerId ? `<div class="request-info">🚛 ${this.dealers.find(d => String(d.id) === String(request.dealerId))?.name || 'Unknown'}</div>` : ''}

                        ${request.images && request.images.length ? `<div class="request-images">${request.images.map(img => `<img src="${img}" alt="image" style="max-width:100px;max-height:80px;margin:4px;cursor:pointer;border-radius:6px;object-fit:cover" onclick="window.open('${img}','_blank')">`).join('')}</div>` : ''}

                        <div class="scrap-list">
                            ${request.scrapTypes.map(item => `
                                <div class="scrap-item-display">
                                    <span>${item.type}</span>
                                    <span>₹${((typeof item.appliedRate !== 'undefined' && item.appliedRate !== null) ? Number(item.appliedRate) : (this.scrapTypes.find(s => s.name === item.type)?.pricePerKg || 0))}/kg × ${item.quantity} kg = ₹${Math.round(((typeof item.appliedRate !== 'undefined' && item.appliedRate !== null) ? Number(item.appliedRate) : (this.scrapTypes.find(s => s.name === item.type)?.pricePerKg || 0)) * (item.quantity || 0))}</span>
                                </div>
                            `).join('')}
                        </div>
                        <div class="estimated-value" style="margin-top:8px;">
                            <h4>${(window.i18n ? window.i18n.t('estimatedValue') : 'Estimated Value:')} ₹${this.calculateRequestValue(request)}</h4>
                        </div>
                    </div>
                    <div class="request-actions">
                        ${this.getAdminActions(request)}
                    </div>
                </div>
            </div>
    `).join('');
    try { if (window.i18n) window.i18n.applyToDOM(); } catch(e){}
    }

    getAdminActions(request) {
        if (request.status === 'Pending') {
            const availableDealers = this.dealers.filter(d => d.active);
            return `
                <select class="form-control" id="dealer-${request.id}" style="margin-bottom: 8px;">
                    <option value="">${(window.i18n?window.i18n.t('assignToDealer'):'Assign to Dealer')}</option>
                    ${availableDealers.map(dealer => `<option value="${dealer.id}">${dealer.name}</option>`).join('')}
                </select>
                <button class="btn btn--primary btn--sm" data-action="assign" data-request-id="${request.id}">${(window.i18n?window.i18n.t('assign'):'Assign')}</button>
            `;
        }
        return '';
    }

    assignDealer(requestId) {
        const dealerSelect = document.getElementById(`dealer-${requestId}`);
        if (!dealerSelect) return;
        
        const dealerId = parseInt(dealerSelect.value);
        
        if (!dealerId) {
            this.showToast(window.i18n ? (window.i18n.t('pleaseSelectDealer') || 'Please select a dealer') : 'Please select a dealer', 'error');
            return;
        }

        this.updateRequestStatus(requestId, 'Assigned', dealerId);
    }

    showAdminSection(section) {
        document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));
        
        if (section === 'requests') {
            const requestsSection = document.getElementById('adminRequests');
            if (requestsSection) requestsSection.classList.remove('hidden');
        } else if (section === 'dealers') {
            const dealersSection = document.getElementById('adminDealers');
            if (dealersSection) dealersSection.classList.remove('hidden');
            // refresh dealer list from server when opening dealers section
            this.loadDealers();
        }
        else if (section === 'scrapTypes') {
            const scrapSection = document.getElementById('adminScrapTypes');
            if (scrapSection) scrapSection.classList.remove('hidden');
            // refresh scrap types when opening scrap types section
            this.loadScrapTypes();
        }
    }

    renderDealersList() {
        const container = document.getElementById('dealersList');
        if (!container) return;
    container.innerHTML = this.dealers.map(dealer => {
            const phone = dealer.phone || '';
            const email = dealer.email || '';
            const serviceAreas = Array.isArray(dealer.serviceAreas) ? dealer.serviceAreas.join(', ') : (dealer.serviceAreas || '');
            const specialties = dealer.specialties || [];
            const rating = (typeof dealer.rating !== 'undefined' && dealer.rating !== null) ? Number(dealer.rating).toFixed(1) : '';
            return `
            <div class="dealer-card">
                <div class="dealer-header-info">
                    <div>
                        <div class="dealer-name">${dealer.name || 'Unnamed Dealer'}</div>
                        <div class="dealer-info">📞 ${phone}</div>
                        <div class="dealer-info">📧 ${email}</div>
                        <div class="dealer-info">📍 ${serviceAreas}</div>
                        <div class="dealer-info">✅ ${dealer.completedJobs || 0} completed jobs</div>
                    </div>
                    <div class="dealer-rating">${rating ? `⭐ ${rating}` : ''}</div>
                </div>
                <div class="dealer-specialties">
                    ${specialties.map(spec => `<span class="specialty-tag">${spec}</span>`).join('')}
                </div>
                <div style="margin-top:12px; display:flex; gap:8px;">
                    <button class="btn btn--outline" data-dealer-edit="${dealer.id}">Edit</button>
                    <button class="btn btn--danger" data-dealer-delete="${dealer.id}">Delete</button>
                </div>
            </div>
            `;
        }).join('');
        try { if (window.i18n) window.i18n.applyToDOM(); } catch(e){}
        
        // wire edit/delete for admin view
        container.querySelectorAll('[data-dealer-edit]').forEach(b => b.addEventListener('click', (e) => {
            const id = b.getAttribute('data-dealer-edit');
            this.editDealer(id);
        }));
        container.querySelectorAll('[data-dealer-delete]').forEach(b => b.addEventListener('click', (e) => {
            const id = b.getAttribute('data-dealer-delete');
            this.deleteDealer(id);
        }));
    }

    // Admin loaders and forms
    async loadDealers() {
        try {
            const base = this.getApiBase();
            const res = await fetch(base + '/api/dealers');
            const data = res && res.ok ? await res.json() : [];
            // update local cache and render
            this.dealers = data;
            this.renderDealersList();
        } catch (e) { console.warn('loadDealers failed', e); }
    }

    showDealerForm(d) {
        const form = document.getElementById('dealerForm');
        if (!form) return;
        document.getElementById('dealerFormTitle').innerText = d ? 'Edit Dealer' : 'Add Dealer';
        document.getElementById('dealerName').value = d ? d.name : '';
    document.getElementById('dealerPhone').value = d ? (d.phone || '') : '';
    document.getElementById('dealerEmail').value = d ? d.email || '' : '';
    document.getElementById('dealerServiceAreas').value = d && d.serviceAreas ? (Array.isArray(d.serviceAreas) ? d.serviceAreas.join(', ') : d.serviceAreas) : '';
    document.getElementById('dealerSpecialties').value = d && d.specialties ? (Array.isArray(d.specialties) ? d.specialties.join(', ') : d.specialties) : '';
    document.getElementById('dealerActive').value = (d && typeof d.active !== 'undefined') ? String(!!d.active) : 'true';
    document.getElementById('dealerRatingInput').value = d && typeof d.rating !== 'undefined' ? d.rating : '';
    document.getElementById('dealerCompletedJobs').value = d && typeof d.completedJobs !== 'undefined' ? d.completedJobs : '';
    form.setAttribute('data-edit-id', d && d.id ? d.id : '');
    // keep a copy of loaded phone to help with server-side user sync when the phone changes
    form._loadedPhone = d && d.phone ? (window.__normalizePhone10 ? window.__normalizePhone10(d.phone) : d.phone) : null;
    // clear inline phone error when opening form
    try { const perr = document.getElementById('dealerPhoneError'); if (perr) { perr.textContent = ''; perr.style.display = 'none'; } } catch(e){}
    form.classList.remove('hidden');
    }

    hideDealerForm() { const f = document.getElementById('dealerForm'); if (f) f.classList.add('hidden'); }

    async saveDealer() {
        const form = document.getElementById('dealerForm');
        if (!form) return;
        const saveBtn = form.querySelector('[data-admin-action="saveDealer"]');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.dataset._oldText = saveBtn.textContent; saveBtn.textContent = 'Saving...'; }
        const id = form.getAttribute('data-edit-id');
        const name = document.getElementById('dealerName').value;
        const phoneRaw = document.getElementById('dealerPhone').value;
        const phone = (window.__normalizePhone10 ? window.__normalizePhone10(phoneRaw) : phoneRaw);
        const email = document.getElementById('dealerEmail').value;
        const serviceAreasRaw = document.getElementById('dealerServiceAreas').value || '';
        const specialtiesRaw = document.getElementById('dealerSpecialties').value || '';
        const active = document.getElementById('dealerActive').value === 'true';
        const rating = parseFloat(document.getElementById('dealerRatingInput').value) || 0;
        const completedJobs = parseInt(document.getElementById('dealerCompletedJobs').value) || 0;
        const payload = { name, phone, email, serviceAreas: serviceAreasRaw ? serviceAreasRaw.split(',').map(s => s.trim()).filter(Boolean) : [], specialties: specialtiesRaw ? specialtiesRaw.split(',').map(s => s.trim()).filter(Boolean) : [], active, rating, completedJobs };
        // include old phone to help server-side user sync when updating
        if (id) payload._oldPhone = (form._loadedPhone || null) || null;
        const token = (window.__getAuthToken && window.__getAuthToken()) || null;
        const headers = { 'Content-Type':'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const opts = { method: id ? 'PUT' : 'POST', headers, body: JSON.stringify(payload) };
        const base = this.getApiBase();
        const path = base + (id ? `/api/dealers/${id}` : '/api/dealers');
        try {
            const res = await fetch(path, opts);
            if (!res.ok) {
                const txt = await res.text();
                // If server signals a conflict (duplicate phone), show a friendly message
                if (res.status === 409) {
            let msg = 'Dealer already exists';
            try { const parsed = JSON.parse(txt || '{}'); if (parsed && parsed.error) msg = parsed.error; } catch(e) {}
            // set inline error near phone input if present
            try { const perr = document.getElementById('dealerPhoneError'); if (perr) { perr.textContent = msg; perr.style.display = 'block'; } } catch(e){}
            this.showToast(msg, 'error');
            // re-enable save button and leave form open so admin can correct
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset._oldText || 'Save'; }
            return;
                }
                throw new Error(txt || 'Failed to save dealer');
            }
            const saved = await res.json();
        // clear inline error on success
        try { const perr = document.getElementById('dealerPhoneError'); if (perr) { perr.textContent = ''; perr.style.display = 'none'; } } catch(e){}
            this.hideDealerForm();
            await this.loadDealers();
            this.showToast('Dealer saved', 'success');
        } catch (e) {
            console.warn('saveDealer failed', e);
            this.showToast('Failed to save dealer: ' + (e.message||''), 'error');
        } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset._oldText || 'Save'; }
        }
    }

    async editDealer(id) {
        // fetch dealers then find
        try {
            const base = this.getApiBase();
            const res = await fetch(base + '/api/dealers');
            const data = res && res.ok ? await res.json() : [];
            const found = (data || []).find(x => String(x.id) === String(id));
            if (found) this.openDealerModal(found);
        } catch (e) { console.warn('editDealer failed', e); }
    }

    async deleteDealer(id) {
        if (!confirm('Delete dealer?')) return;
        const delBtn = document.querySelector(`[data-dealer-delete='${id}']`);
        if (delBtn) { delBtn.disabled = true; delBtn.dataset._oldText = delBtn.textContent; delBtn.textContent = 'Deleting...'; }
        const token = window.__getAuthToken && window.__getAuthToken();
        try {
            const base = this.getApiBase();
            const headers = {};
            if (token) headers['Authorization'] = 'Bearer ' + token;
            const res = await fetch(base + `/api/dealers/${id}`, { method: 'DELETE', headers });
            if (!res.ok) throw new Error(await res.text());
            this.showToast('Dealer deleted', 'success');
            await this.loadDealers();
        } catch (e) { console.warn('deleteDealer failed', e); this.showToast('Failed to delete dealer', 'error'); } finally { if (delBtn) { delBtn.disabled = false; delBtn.textContent = delBtn.dataset._oldText || 'Delete'; } }
    }

    async loadScrapTypes() {
        try {
            const base = this.getApiBase();
            const res = await fetch(base + '/api/scrapTypes');
            const data = res && res.ok ? await res.json() : [];
            // store and render in admin list
            this.scrapTypes = data;
            const list = document.getElementById('scrapTypesList');
            if (!list) return;
            list.innerHTML = (data || []).map(s => `
                <div class="scrap-card">
                    <div><strong>${s.name}</strong> <small>${s.category || ''} - ${s.pricePerKg || ''} per kg</small></div>
                    <div style="margin-top:6px;"><button class="btn btn--outline" data-scrap-edit="${s.id}">Edit</button> <button class="btn btn--danger" data-scrap-delete="${s.id}">Delete</button></div>
                </div>
            `).join('');
            list.querySelectorAll('[data-scrap-edit]').forEach(b => b.addEventListener('click', (e) => { const id = b.getAttribute('data-scrap-edit'); this.editScrap(id); }));
            list.querySelectorAll('[data-scrap-delete]').forEach(b => b.addEventListener('click', (e) => { const id = b.getAttribute('data-scrap-delete'); this.deleteScrap(id); }));
        } catch (e) { console.warn('loadScrapTypes failed', e); }
    }

    showScrapForm(s) {
        const form = document.getElementById('scrapForm');
        if (!form) return;
        document.getElementById('scrapFormTitle').innerText = s ? 'Edit Scrap Type' : 'Add Scrap Type';
        document.getElementById('scrapName').value = s ? s.name : '';
        document.getElementById('scrapPrice').value = s ? (s.pricePerKg || '') : '';
        document.getElementById('scrapCategory').value = s ? s.category || '' : '';
    document.getElementById('scrapDescription').value = s ? s.description || '' : '';
        form.setAttribute('data-edit-id', s && s.id ? s.id : '');
        form.classList.remove('hidden');
    }

    hideScrapForm() { const f = document.getElementById('scrapForm'); if (f) f.classList.add('hidden'); }

    async saveScrap() {
        const form = document.getElementById('scrapForm'); if (!form) return;
        const saveBtn = form.querySelector('[data-admin-action="saveScrap"]');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.dataset._oldText = saveBtn.textContent; saveBtn.textContent = 'Saving...'; }
        const id = form.getAttribute('data-edit-id');
    const payload = { name: document.getElementById('scrapName').value, pricePerKg: Number(document.getElementById('scrapPrice').value), category: document.getElementById('scrapCategory').value, description: document.getElementById('scrapDescription').value };
        const token = (window.__getAuthToken && window.__getAuthToken()) || null;
        const headers = { 'Content-Type':'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;
    const base = this.getApiBase();
    const opts = { method: id ? 'PUT' : 'POST', headers, body: JSON.stringify(payload) };
    const path = base + (id ? `/api/scrapTypes/${id}` : '/api/scrapTypes');
        try {
            const res = await fetch(path, opts);
            if (!res.ok) {
                const txt = await res.text();
                throw new Error(txt || 'Failed to save scrap type');
            }
            await res.json();
            this.hideScrapForm();
            await this.loadScrapTypes();
            this.showToast('Scrap type saved', 'success');
        } catch (e) {
            console.warn('saveScrap failed', e);
            this.showToast('Failed to save scrap type: ' + (e.message||''), 'error');
        } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = saveBtn.dataset._oldText || 'Save'; }
        }
    }

    async editScrap(id) {
    try { const base = this.getApiBase(); const res = await fetch(base + '/api/scrapTypes'); const data = res && res.ok ? await res.json() : []; const found = (data||[]).find(x => String(x.id) === String(id)); if (found) this.showScrapForm(found); } catch (e) { console.warn('editScrap failed', e); }
    }

    async deleteScrap(id) {
        if (!confirm('Delete scrap type?')) return;
        const delBtn = document.querySelector(`[data-scrap-delete='${id}']`);
        if (delBtn) { delBtn.disabled = true; delBtn.dataset._oldText = delBtn.textContent; delBtn.textContent = 'Deleting...'; }
        const token = (window.__getAuthToken && window.__getAuthToken()) || null;
        try {
            const base = this.getApiBase();
            const headers = {};
            if (token) headers['Authorization'] = 'Bearer ' + token;
            const res = await fetch(base + `/api/scrapTypes/${id}`, { method: 'DELETE', headers });
            if (!res.ok) throw new Error(await res.text());
            this.showToast('Scrap type deleted', 'success');
            await this.loadScrapTypes();
        } catch (e) {
            console.warn('deleteScrap failed', e);
            this.showToast('Failed to delete scrap type', 'error');
        } finally { if (delBtn) { delBtn.disabled = false; delBtn.textContent = delBtn.dataset._oldText || 'Delete'; } }
    }

    showCustomerRequests() {
        // Show requests belonging to the logged-in customer (match normalized phone)
        const myPhone = this.currentUser && this.currentUser.phone ? String(this.currentUser.phone).replace(/\D/g, '').slice(-10) : null;
        const customerRequests = myPhone ? (this.requests || []).filter(r => {
            const rphone = r && r.phone ? String(r.phone).replace(/\D/g, '').slice(-10) : null;
            return rphone && myPhone && rphone === myPhone;
        }) : (this.requests || []).slice(0,2);
        const container = document.getElementById('customerRequestsList');
        if (!container) return;
        
        if (customerRequests.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary);">' + (window.i18n ? window.i18n.t('noPickupRequests') || 'No pickup requests found.' : 'No pickup requests found.') + '</p>';
            try { if (window.i18n) window.i18n.applyToDOM(); } catch(e){}
            return;
        }

    container.innerHTML = customerRequests.map(request => `
            <div class="request-card">
                <div class="request-header">
                    <div>
                        <div class="request-id">${(window.i18n ? window.i18n.t('requestIdPrefix') : 'Request #')}${request.id}</div>
                        <div class="request-date">${new Date(request.requestDate).toLocaleDateString()}</div>
                    </div>
                    <span class="status-badge status-${(request.status||'').toLowerCase()}">${request.status||''}</span>
                </div>
                <div class="request-content">
                    <div class="request-details">
                        <div class="request-info">📍 ${request.address} ${request.lat && request.lng ? `<a href="https://www.google.com/maps/search/?api=1&query=${request.lat},${request.lng}" target="_blank" rel="noopener" style="margin-left:8px;">🗺️ Open map</a>` : ''}</div>
                        <div class="request-info">📅 ${request.preferredDate} (${this.formatTimeSlot(request.preferredTime)})</div>
                        ${request.dealerId ? `<div class="request-info">🚛 ${(window.i18n ? window.i18n.t('assignedTo') : 'Assigned to:')} ${this.dealers.find(d => d.id === request.dealerId)?.name}</div>` : ''}

                        ${request.images && request.images.length ? `<div class="request-images">${request.images.map(img => `<img src="${img}" alt="image" style="max-width:100px;max-height:80px;margin:4px;cursor:pointer;border-radius:6px;object-fit:cover" onclick="window.open('${img}','_blank')">`).join('')}</div>` : ''}
                        <div class="scrap-list">
                            <div class="scrap-list-header">
                                <div>Type</div>
                                <div style="text-align:right">Rate</div>
                                <div style="text-align:right">Qty</div>
                                <div style="text-align:right">Subtotal</div>
                            </div>
                            ${request.scrapTypes.map(item => {
                                const rate = (typeof item.appliedRate !== 'undefined' && item.appliedRate !== null) ? Number(item.appliedRate) : (this.scrapTypes.find(s => s.name === item.type)?.pricePerKg || 0);
                                const subtotal = Math.round(rate * (item.quantity || 0));
                                return `
                                <div class="scrap-item-display">
                                    <div class="scrap-type">${item.type}</div>
                                    <div class="scrap-rate">₹${rate}/kg</div>
                                    <div class="scrap-qty">${item.quantity} kg</div>
                                    <div class="scrap-subtotal">₹${subtotal}</div>
                                </div>
                            `}).join('')}
                        </div>
                        <div class="estimated-value">
                            <h4>${(window.i18n ? window.i18n.t('estimatedValue') : 'Estimated Value:')} ₹${this.calculateRequestValue(request)}</h4>
                        </div>
                    </div>
                </div>
            </div>
    `).join('');
    try { if (window.i18n) window.i18n.applyToDOM(); } catch(e){}
    }

    calculateRequestValue(request) {
        let totalValue = 0;
        request.scrapTypes.forEach(item => {
            // prefer per-request appliedRate, otherwise use current master price
            const applied = (item && typeof item.appliedRate !== 'undefined' && item.appliedRate !== null) ? Number(item.appliedRate) : null;
            const rate = (applied !== null) ? applied : (this.scrapTypes.find(s => s.name === item.type)?.pricePerKg || 0);
            if (rate && item.quantity) totalValue += rate * item.quantity;
        });
        return totalValue.toFixed(0);
    }

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toastMessage');
        
        if (!toast || !toastMessage) return;
        
        toastMessage.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.add('show');

        setTimeout(() => {
            this.hideToast();
        }, 4000);
    }

    hideToast() {
        const toast = document.getElementById('toast');
        if (toast) {
            toast.classList.remove('show');
        }
    }

    showConfirmModal(title, message, confirmAction) {
        const modal = document.getElementById('confirmModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalMessage = document.getElementById('modalMessage');
        
        if (modalTitle) modalTitle.textContent = title;
        if (modalMessage) modalMessage.textContent = message;
        if (modal) modal.classList.remove('hidden');
        
        this.modalConfirmAction = confirmAction;
    }

    hideModal() {
        const modal = document.getElementById('confirmModal');
        if (modal) modal.classList.add('hidden');
        this.modalConfirmAction = null;
    }

    confirmModalAction() {
        if (this.modalConfirmAction) {
            this.modalConfirmAction();
        }
        this.hideModal();
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ScrapCollectApp();
});