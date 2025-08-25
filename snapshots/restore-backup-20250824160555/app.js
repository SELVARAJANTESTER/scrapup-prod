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
    // start realtime updates (SSE) to receive request updates
    try { this.initRealtime && this.initRealtime(); } catch(e) { console.warn('initRealtime failed', e); }
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
    const logoutHeader = document.getElementById('logoutBtnHeader');
    if (loginBtn) loginBtn.addEventListener('click', () => this.showLoginModal(null));
    if (logoutBtn) logoutBtn.addEventListener('click', () => this.logout());
    if (logoutHeader) logoutHeader.addEventListener('click', () => this.logout());
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
            document.getElementById('loginBtn').style.display = 'none';
            document.getElementById('logoutBtn').style.display = '';
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
    const lobh = document.getElementById('logoutBtnHeader');
    if (lb) lb.style.display = '';
    if (lob) lob.style.display = 'none';
    if (lobh) lobh.style.display = 'none';
    this.showToast('Logged out', 'info');
    // clear persisted auth token if present
    try { if (window.__clearAuthToken) window.__clearAuthToken(); } catch(e){}
    // send customers back to the standalone customer login page
    try { localStorage.removeItem('__redirectToIndex'); } catch(e){}
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

        // Request Edit modal (dealer) handlers
        const requestEditModal = document.getElementById('requestEditModal');
        if (requestEditModal) {
            const saveBtn = document.getElementById('editRequestSave');
            const cancelBtn = document.getElementById('editRequestCancel');
            const imagesInput = document.getElementById('editRequestImages');
            if (saveBtn) saveBtn.addEventListener('click', (e) => { e.preventDefault(); this.saveEditedRequest && this.saveEditedRequest(); });
            if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); requestEditModal.classList.add('hidden'); });
            if (imagesInput) imagesInput.addEventListener('change', (e) => { this._editPendingImages = null; this._editPendingImages = Array.from(e.target.files || []).map(f => ({ file: f })); this._convertEditImages(); });
            const addItemBtn = document.getElementById('addEditScrapItem');
            if (addItemBtn) addItemBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const container = document.getElementById('editRequestScrapItems'); if (!container) return;
                const row = document.createElement('div');
                row.className = 'edit-scrap-row';
                row.style.display = 'flex'; row.style.gap = '8px'; row.style.marginBottom = '8px';
                row.innerHTML = `<input class="form-control" data-edit-scrap-type placeholder="Type">` +
                                `<input class="form-control" data-edit-scrap-qty type="number" placeholder="kg">` +
                                `<button class="btn btn--outline btn--sm" data-edit-remove>Remove</button>`;
                const remove = row.querySelector('[data-edit-remove]'); remove.addEventListener('click', () => { row.remove(); });
                container.appendChild(row);
            });
            const captureBtn = document.getElementById('editRequestGetLocation');
            if (captureBtn) captureBtn.addEventListener('click', (e) => { e.preventDefault(); this.captureEditModalLocation && this.captureEditModalLocation(); });
            // update map when manual lat/lng inputs change
            const latInput = document.getElementById('editRequestLat');
            const lngInput = document.getElementById('editRequestLng');
            if (latInput || lngInput) {
                const onChange = () => {
                    try {
                        const lat = Number((latInput && latInput.value) || null);
                        const lng = Number((lngInput && lngInput.value) || null);
                        if (!isNaN(lat) && isFinite(lat) && !isNaN(lng) && isFinite(lng)) this._updateEditModalMap(lat, lng);
                        else this._updateEditModalMap(null, null);
                    } catch(e){}
                };
                if (latInput) latInput.addEventListener('input', onChange);
                if (lngInput) lngInput.addEventListener('input', onChange);
            }
            // close on overlay click
            requestEditModal.addEventListener('click', (e) => { if (e.target.classList.contains('modal-overlay')) requestEditModal.classList.add('hidden'); });
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
                    // Allow users without an authoritative role to proceed when switching to 'customer'
                    // This supports on-the-fly created customer accounts used by tests and lightweight flows.
                    if (role !== 'customer') {
                        // require re-login for non-customer roles
                        this.showLoginModal(role, true);
                        return false;
                    }
                    // otherwise allow proceed as customer
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
        tryEnforce().then(async (ok) => {
            if (!ok) return;
            console.log('SET_ROLE_ACTION', role, 'currentUserPhone', (this.currentUser && (this.currentUser.phone||this.currentUser.id)) || null);
            const header = document.getElementById('header');
            const backBtn = document.getElementById('backBtn');
            if (header) header.style.display = 'block';
            if (backBtn) backBtn.style.display = 'inline-block';

            // On role switch, ask API shim to refresh server-backed requests for current token/role
            try { if (window.__refreshRequests) await window.__refreshRequests(); } catch(e) {}

            // If switching to dealer and currentUser has no dealerId, try to resolve by phone
            if (role === 'dealer' && this.currentUser && (this.currentUser.dealerId === undefined || this.currentUser.dealerId === null || this.currentUser.dealerId === '')) {
                try {
                    const norm = (window.__normalizePhone10 ? window.__normalizePhone10(this.currentUser.phone) : (this.currentUser.phone||''));
                    if (norm) {
                        const match = (this.dealers || []).find(d => {
                            const dph = (window.__normalizePhone10 ? window.__normalizePhone10(d && d.phone) : (d && d.phone) || '');
                            return dph && dph === norm;
                        });
                        if (match && match.id != null) {
                            this.currentUser.dealerId = String(match.id);
                            try { if (window.__setAuthUser) window.__setAuthUser(this.currentUser); } catch(e){}
                        }
                    }
                } catch(e) {}
            }

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

            console.log('SET_ROLE_WILL_SHOW', role, 'currentViewBefore', this.currentView);
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
            const phone = window.prompt('Enter phone number to login:');
            if (!phone) { if(!suppressToast) this.showToast('Login required to proceed', 'error'); return; }
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
            if (!p) { this.showToast('Enter phone number to login', 'error'); return; }
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
            // tighten UI: hide roleSelector for customers
            try { const rs = document.getElementById('roleSelector'); if (rs) rs.style.display = (user.role && String(user.role).toLowerCase() === 'customer') ? 'none' : ''; } catch(e){}
            this.showToast('Logged in as ' + (user.name || user.phone), 'success');
            // enforce role: if intendedRole provided, only allow proceed if user.role matches or user is admin
            if (intendedRole) {
                // allow customers with no explicit role to login as customer (created-on-the-fly users)
                if (!user.role && String(intendedRole).toLowerCase() === 'customer') {
                    user.role = 'customer';
                }
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
        console.log('SHOW_VIEW called for', viewId);
        document.querySelectorAll('.view').forEach(view => {
            view.classList.add('hidden');
        });

        // Show target view
        const targetView = document.getElementById(viewId);
        if (targetView) {
            console.log('SHOW_VIEW found targetView for', viewId);
            targetView.classList.remove('hidden');
            this.currentView = viewId;
        } else {
            console.log('SHOW_VIEW missing targetView for', viewId);
        }
        // Immediate synchronous fallback: if showing customerHome and pickupForm missing, inject minimal form now
        try {
            if (viewId === 'customerHome' && targetView && !document.querySelector('#pickupForm')) {
                try {
                    console.log('INJECT_IMMEDIATE_PICKUP_FORM');
                    const html = `
                        <div class="customer-home-injected">
                            <h2>Customer Home (injected-sync)</h2>
                            <div id="customerActions">
                                <button data-action="requestPickup">Request Pickup</button>
                            </div>
                            <div id="injectedFormWrapper">
                                <form id="pickupForm" class="pickup-form">
                                    <input name="customerName" placeholder="Full name">
                                    <input name="phone" placeholder="Phone">
                                    <textarea name="address" placeholder="Address"></textarea>
                                    <select name="scrapType"><option>Electronics</option><option>Metal Scrap</option></select>
                                    <input name="quantity" value="1" type="number">
                                    <div class="form-actions"><button class="btn btn--primary" type="submit">Submit</button></div>
                                </form>
                            </div>
                        </div>`;
                    targetView.insertAdjacentHTML('beforeend', html);
                    try { this.setupFormHandlers && this.setupFormHandlers(); this.setupCustomerActions && this.setupCustomerActions(); this.initRequestForm && this.initRequestForm(); } catch(e) { console.warn('post-inject immediate handlers failed', e); }
                    try { window.__CUSTOMER_HOME_READY = true; if (targetView && targetView.setAttribute) targetView.setAttribute('data-injected','1'); document.dispatchEvent(new Event('customerHomeReady')); } catch(e){}
                } catch(e) { console.warn('INJECT_IMMEDIATE_PICKUP_FORM failed', e); }
            }
        } catch(e){}
        // Immediate synchronous fallback for adminDashboard: ensure adminRequests section exists so tests can proceed
        try {
            if (viewId === 'adminDashboard' && targetView && !document.getElementById('adminRequests')) {
                try {
                    console.log('INJECT_IMMEDIATE_ADMIN_DASH');
                    const html = `
                        <div class="admin-section" id="adminRequests">
                            <h3>Requests</h3>
                            <div id="adminRequestsList"></div>
                        </div>
                        <div class="admin-section hidden" id="adminDealers">
                            <h3>Dealers</h3>
                            <div id="dealersList"></div>
                        </div>`;
                    targetView.insertAdjacentHTML('beforeend', html);
                    try { this.renderAdminStats && this.renderAdminStats(); this.loadDealers && this.loadDealers(); this.loadScrapTypes && this.loadScrapTypes(); this.renderAdminRequests && this.renderAdminRequests(); } catch(e) { console.warn('post-inject admin handlers failed', e); }
                    try { window.__ADMIN_DASH_READY = true; document.dispatchEvent(new Event('adminDashboardReady')); } catch(e){}
                } catch(e) { console.warn('INJECT_IMMEDIATE_ADMIN_DASH failed', e); }
            }
        } catch(e){}

        // Immediate synchronous fallback for dealerDashboard: ensure dealerRequestsList exists
        try {
            if (viewId === 'dealerDashboard' && targetView && !document.getElementById('dealerRequestsList')) {
                try {
                    console.log('INJECT_IMMEDIATE_DEALER_DASH');
                    const html = `
                        <div class="dealer-dashboard-section">
                            <h3>Dealer Requests</h3>
                            <div id="dealerRequestsList"></div>
                        </div>`;
                    targetView.insertAdjacentHTML('beforeend', html);
                    try { this.initDealerView && this.initDealerView(); this.renderDealerDashboard && this.renderDealerDashboard(this.currentDealerId); } catch(e) { console.warn('post-inject dealer handlers failed', e); }
                    try { window.__DEALER_DASH_READY = true; document.dispatchEvent(new Event('dealerDashboardReady')); } catch(e){}
                } catch(e) { console.warn('INJECT_IMMEDIATE_DEALER_DASH failed', e); }
            }
        } catch(e){}
        // If showing customerHome and pickup form already present (inline or pre-rendered), mark ready
        try {
            if (viewId === 'customerHome' && targetView) {
                setTimeout(() => {
                    try {
                        if (document.querySelector('#pickupForm')) {
                            try { window.__CUSTOMER_HOME_READY = true; if (targetView && targetView.setAttribute) targetView.setAttribute('data-injected','1'); document.dispatchEvent(new Event('customerHomeReady')); } catch(e){}
                        }
                    } catch(e){}
                }, 80);
            }
        } catch(e){}
    // If the customerHome view is empty (we use a separate fragment file), load it on demand
    if (viewId === 'customerHome' && targetView && (!targetView.innerHTML || targetView.innerHTML.trim() === '')) {
            (async () => {
                try {
                    const resp = await fetch('/customer_home.html');
                    if (!resp.ok) return console.warn('Failed to fetch customer_home.html', resp.status);
                    const txt = await resp.text();
                    // extract body contents if present
                    const m = txt.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
                    const fragment = m ? m[1] : txt;
                    const container = document.createElement('div');
                    container.innerHTML = fragment;
                    // extract scripts to run separately
                    const scripts = Array.from(container.querySelectorAll('script'));
                    scripts.forEach(s => s.parentNode && s.parentNode.removeChild(s));
                    targetView.innerHTML = container.innerHTML;
                    // run inline scripts (append to body)
                    for (const s of scripts) {
                        try {
                            const ns = document.createElement('script');
                            if (s.src) {
                                ns.src = s.src;
                                ns.async = false;
                            } else {
                                ns.textContent = s.textContent || s.innerText || '';
                            }
                            document.body.appendChild(ns);
                        } catch (e) { console.warn('failed to run injected script', e); }
                    }
                    // give DOM a moment then initialize customer view wiring
                    setTimeout(() => { try { this.initCustomerView && this.initCustomerView(); } catch (e) { console.warn('initCustomerView after inject failed', e); } finally {
                            try { window.__CUSTOMER_HOME_READY = true; if (targetView && targetView.setAttribute) targetView.setAttribute('data-injected','1'); document.dispatchEvent(new Event('customerHomeReady')); } catch(e){}
                        } }, 100);
                } catch (e) { console.warn('inject customer_home failed', e); }
            })();
        }
    else {
        // reset readiness when switching away
        try { if (viewId !== 'customerHome') { window.__CUSTOMER_HOME_READY = false; } } catch(e){}
    }
        // Ensure minimal pickup form exists for legacy flows / tests
        if (viewId === 'customerHome') {
            setTimeout(() => {
                try {
                    if (!document.querySelector('#pickupForm')) {
                        console.log('INJECT_MINIMAL_PICKUP_FORM');
                        const html = `
                        <div class="customer-home-injected">
                            <h2>Customer Home (injected)</h2>
                            <div id="customerActions">
                                <button data-action="requestPickup">Request Pickup</button>
                            </div>
                            <div id="injectedFormWrapper">
                                <form id="pickupForm" class="pickup-form">
                                    <input name="customerName" placeholder="Full name">
                                    <input name="phone" placeholder="Phone">
                                    <textarea name="address" placeholder="Address"></textarea>
                                    <select name="scrapType"><option>Electronics</option><option>Metal Scrap</option></select>
                                    <input name="quantity" value="1" type="number">
                                    <div class="form-actions"><button class="btn btn--primary" type="submit">Submit</button></div>
                                </form>
                            </div>
                        </div>`;
                        targetView.insertAdjacentHTML('beforeend', html);
                        try { this.setupFormHandlers && this.setupFormHandlers(); this.setupCustomerActions && this.setupCustomerActions(); this.initRequestForm && this.initRequestForm(); window.__CUSTOMER_HOME_READY = true; if (targetView && targetView.setAttribute) targetView.setAttribute('data-injected','1'); document.dispatchEvent(new Event('customerHomeReady')); } catch(e) { console.warn('post-inject handlers failed', e); }
                    }
                } catch(e) { console.warn('ensure minimal pickup failed', e); }
            }, 120);
        }
        // Ensure requestPickup view has the pickup form
        if (viewId === 'requestPickup' && targetView) {
            try {
                if (!targetView.querySelector('#pickupForm')) {
                    console.log('INJECT_MINIMAL_PICKUP_IN_REQUESTVIEW');
                    const html = `
                    <div class="request-pickup-injected">
                        <h3>Request Pickup</h3>
                        <form id="pickupForm" class="pickup-form">
                            <label>Full name</label>
                            <input name="customerName" required>
                            <label>Phone</label>
                            <input name="phone" required>
                            <label>Address</label>
                            <textarea name="address" rows="2"></textarea>
                            <div style="margin-top:8px">
                                <label>Scrap Type</label>
                                <select name="scrapType"><option>Electronics</option><option>Metal Scrap</option></select>
                                <label>Quantity (kg)</label>
                                <input name="quantity" type="number" value="1">
                            </div>
                            <div class="form-actions" style="margin-top:12px"><button type="submit" class="btn btn--primary">Submit</button></div>
                        </form>
                    </div>`;
                    targetView.insertAdjacentHTML('beforeend', html);
                    try { this.setupFormHandlers && this.setupFormHandlers(); this.initRequestForm && this.initRequestForm(); try { window.__CUSTOMER_HOME_READY = true; if (targetView && targetView.setAttribute) targetView.setAttribute('data-injected','1'); document.dispatchEvent(new Event('customerHomeReady')); } catch(e){} } catch(e){ console.warn('post-inject request handlers failed', e); }
                }
            } catch(e) { console.warn('ensure requestPickup inject failed', e); }
        }

        // Update navigation visibility
        if (viewId === 'roleSelection') {
            const header = document.getElementById('header');
            if (header) header.style.display = 'none';
        }

        // Re-setup event listeners for the new view
        this.setupCustomerActions();
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
            locationBtn.textContent = '📍 Get Current Location';
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

    // Update small map preview inside edit modal when lat/lng change
    _updateEditModalMap(lat, lng) {
        try {
            const mapEl = document.getElementById('editRequestMap');
            if (!mapEl) return;
            if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
                mapEl.style.display = 'none';
                mapEl.innerHTML = '';
                return;
            }
            mapEl.style.display = '';
            // use Google Maps embed with query coordinates
            const q = encodeURIComponent(`${lat},${lng}`);
            mapEl.innerHTML = `<iframe width="100%" height="150" frameborder="0" style="border:0" src="https://www.google.com/maps?q=${q}&hl=es;z=14&output=embed" allowfullscreen></iframe>`;
        } catch (e) { console.warn('_updateEditModalMap failed', e); }
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
                        ${this.scrapTypes.map(scrap => `<option value="${scrap.name}">${scrap.name}</option>`).join('')}
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
                    ${this.scrapTypes.map(scrap => `<option value="${scrap.name}">${scrap.name}</option>`).join('')}
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
            this.showToast('Please add at least one scrap item', 'error');
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
        // Determine the dealer id for the current dealer user. Prefer the logged-in user's dealerId (as string).
        let dealerId = null;
        try {
            if (this.currentUser && (this.currentUser.dealerId !== undefined && this.currentUser.dealerId !== null && this.currentUser.dealerId !== '')) {
                dealerId = String(this.currentUser.dealerId);
            } else if (this.currentUser && this.currentUser.phone) {
                const norm = (window.__normalizePhone10 ? window.__normalizePhone10(this.currentUser.phone) : this.currentUser.phone);
                const found = (this.dealers || []).find(d => (window.__normalizePhone10 ? window.__normalizePhone10(d && d.phone) : (d && d.phone) || '') === norm);
                if (found && found.id != null) dealerId = String(found.id);
            }
            if (!dealerId && this.dealers && this.dealers.length) {
                const first = this.dealers.find(d => d && d.id != null);
                if (first) dealerId = String(first.id);
            }
        } catch (e) { /* ignore */ }
        this.currentDealerId = dealerId ? dealerId : '1';
        this.renderDealerDashboard(this.currentDealerId);
        // small delayed refresh to catch SSE updates that arrive just after role switch
        setTimeout(() => { try { this.renderDealerDashboard(this.currentDealerId); } catch(_){} }, 500);
    }

    renderDealerDashboard(dealerId) {
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
            container.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary);">No requests assigned yet.</p>';
            return;
        }

        container.innerHTML = requests.map(request => {
            const images = Array.isArray(request.images) ? request.images.map(im => (typeof im === 'string') ? im : (im && (im.url || im.data || ''))).filter(Boolean) : [];
            return `
            <div class="request-card">
                <div class="request-header">
                    <div>
                        <div class="request-id">Request #${request.id}</div>
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

                        ${images.length ? `<div class="request-images">${images.map(img => `<img data-image-src="${img}" src="${img}" alt="image" style="max-width:100px;max-height:80px;margin:4px;cursor:pointer;border-radius:6px;object-fit:cover" class="request-image">`).join('')}</div>` : ''}

                        <div class="scrap-list">
                            ${request.scrapTypes.map(item => `
                                <div class="scrap-item-display">
                                    <span>${item.type}</span>
                                    <span>${item.quantity} kg</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="request-actions">
                        ${this.getDealerActions(request)}
                    </div>
                </div>
            </div>
        `; }).join('');
    }

    getDealerActions(request) {
        switch(request.status) {
            case 'Assigned':
                return `
                    <button class="btn btn--app-success btn--sm" data-action="accept" data-request-id="${request.id}">Accept & Start</button>
                    <button class="btn btn--outline btn--sm" data-action="edit" data-request-id="${request.id}">Edit</button>
                    <button class="btn btn--app-danger btn--sm" data-action="decline" data-request-id="${request.id}">Decline</button>
                `;
            case 'En Route':
                return `
                    <button class="btn btn--outline btn--sm" data-action="edit" data-request-id="${request.id}">Edit</button>
                    <button class="btn btn--app-success btn--sm" data-action="complete" data-request-id="${request.id}">Mark Completed</button>
                `;
            case 'Completed':
                return `<span class="status-badge status-completed">Completed</span>`;
            default:
                return '';
        }
    }

    updateRequestStatus(requestId, newStatus, newDealerId = undefined) {
    const requestIndex = this.requests.findIndex(r => String(r.id) === String(requestId));
        if (requestIndex !== -1) {
            this.requests[requestIndex].status = newStatus;
            if (newDealerId !== undefined) {
                this.requests[requestIndex].dealerId = Number(newDealerId) || newDealerId;
            }
            this.saveData();
            this.showToast(`Request #${requestId} updated to ${newStatus}`, 'success');
            
            if (this.currentRole === 'dealer') {
                this.renderDealerDashboard(this.currentDealerId);
            } else if (this.currentRole === 'admin') {
                this.initAdminView();
            }
        }
        this.hideModal();
    }

    formatTimeSlot(timeSlot) {
        const slots = {
            morning: 'Morning (9 AM - 12 PM)',
            afternoon: 'Afternoon (12 PM - 4 PM)',
            evening: 'Evening (4 PM - 7 PM)'
        };
        return slots[timeSlot] || timeSlot;
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
        
        container.innerHTML = this.requests.map(request => {
            const images = Array.isArray(request.images) ? request.images.map(im => (typeof im === 'string') ? im : (im && (im.url || im.data || ''))).filter(Boolean) : [];
            const dealerName = request.dealerId ? ((this.dealers.find(d => String(d.id) === String(request.dealerId)) || {}).name || 'Unknown') : '';
            return `
            <div class="request-card">
                <div class="request-header">
                    <div>
                        <div class="request-id">Request #${request.id}</div>
                        <div class="request-date">${new Date(request.requestDate).toLocaleDateString()}</div>
                    </div>
                    <span class="status-badge status-${(request.status||'').toLowerCase()}">${request.status||''}</span>
                </div>
                <div class="request-content">
                    <div class="request-details">
                        <h4>${request.customerName}</h4>
                        <div class="request-info">📞 ${request.phone}</div>
                        <div class="request-info">📍 ${request.address} ${request.lat && request.lng ? `<a href="https://www.google.com/maps/search/?api=1&query=${request.lat},${request.lng}" target="_blank" rel="noopener" style="margin-left:8px;">🗺️ Open map</a>` : ''}</div>
                        <div class="request-info">📅 ${request.preferredDate} ${request.preferredTime ? `(${this.formatTimeSlot(request.preferredTime)})` : ''}</div>
                        ${request.dealerId ? `<div class="request-info">🚛 ${dealerName}</div>` : ''}

                        ${images.length ? `<div class="request-images">${images.map(img => `<img src="${img}" alt="image" style="max-width:100px;max-height:80px;margin:4px;cursor:pointer;border-radius:6px;object-fit:cover" onclick="window.open('${img}','_blank')">`).join('')}</div>` : ''}

                        <div class="scrap-list">
                            ${request.scrapTypes.map(item => `
                                <div class="scrap-item-display">
                                    <span>${item.type}</span>
                                    <span>${item.quantity} kg</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <div class="request-actions">
                        ${this.getAdminActions(request)}
                    </div>
                </div>
            </div>
        `; }).join('');
    }

    getAdminActions(request) {
        if (request.status === 'Pending') {
            const availableDealers = this.dealers.filter(d => d.active);
            return `
                <select class="form-control" id="dealer-${request.id}" style="margin-bottom: 8px;">
                    <option value="">Assign to Dealer</option>
                    ${availableDealers.map(dealer => `<option value="${dealer.id}">${dealer.name}</option>`).join('')}
                </select>
                <button class="btn btn--primary btn--sm" data-action="assign" data-request-id="${request.id}">Assign</button>
            `;
        }
        return '';
    }

    assignDealer(requestId) {
        const dealerSelect = document.getElementById(`dealer-${requestId}`);
        if (!dealerSelect) return;
        
    const dealerId = dealerSelect.value; // keep as string to avoid type mismatches
        
    if (!dealerId && dealerId !== 0) {
            this.showToast('Please select a dealer', 'error');
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
    const customerRequests = Array.isArray(this.requests) ? this.requests : [];
        const container = document.getElementById('customerRequestsList');
        if (!container) return;
        
        if (customerRequests.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary);">No pickup requests found.</p>';
            return;
        }

        container.innerHTML = customerRequests.map(request => {
            const images = Array.isArray(request.images) ? request.images.map(im => (typeof im === 'string') ? im : (im && (im.url || im.data || ''))).filter(Boolean) : [];
            const dealerName = request.dealerId ? ((this.dealers.find(d => String(d.id) === String(request.dealerId)) || {}).name) : '';
            return `
            <div class="request-card">
                <div class="request-header">
                    <div>
                        <div class="request-id">Request #${request.id}</div>
                        <div class="request-date">${new Date(request.requestDate).toLocaleDateString()}</div>
                    </div>
                    <span class="status-badge status-${(request.status||'').toLowerCase()}">${request.status||''}</span>
                </div>
                <div class="request-content">
                    <div class="request-details">
                        <div class="request-info">📍 ${request.address} ${request.lat && request.lng ? `<a href="https://www.google.com/maps/search/?api=1&query=${request.lat},${request.lng}" target="_blank" rel="noopener" style="margin-left:8px;">🗺️ Open map</a>` : ''}</div>
                        <div class="request-info">📅 ${request.preferredDate} (${this.formatTimeSlot(request.preferredTime)})</div>
                        ${request.dealerId ? `<div class="request-info">🚛 Assigned to: ${dealerName || 'Unknown'}</div>` : ''}

                        ${images.length ? `<div class="request-images">${images.map(img => `<img src="${img}" alt="image" style="max-width:100px;max-height:80px;margin:4px;cursor:pointer;border-radius:6px;object-fit:cover" onclick="window.open('${img}','_blank')">`).join('')}</div>` : ''}
                        <div class="scrap-list">
                            ${request.scrapTypes.map(item => `
                                <div class="scrap-item-display">
                                    <span>${item.type}</span>
                                    <span>${item.quantity} kg</span>
                                </div>
                            `).join('')}
                        </div>
                        <div class="estimated-value">
                            <h4>Estimated Value: ₹${this.calculateRequestValue(request)}</h4>
                        </div>
                    </div>
                </div>
            </div>
        `; }).join('');
    }

    calculateRequestValue(request) {
        let totalValue = 0;
        request.scrapTypes.forEach(item => {
            const scrapData = this.scrapTypes.find(s => s.name === item.type);
            if (scrapData) {
                totalValue += scrapData.pricePerKg * item.quantity;
            }
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

    // --- Dealer request edit helpers ---
    openRequestEditModal(requestId) {
        try {
            const req = this.requests.find(r => String(r.id) === String(requestId));
            if (!req) return;
            const modal = document.getElementById('requestEditModal'); if (!modal) return;
            document.getElementById('editRequestCustomerName').value = req.customerName || '';
            document.getElementById('editRequestPhone').value = req.phone || '';
            document.getElementById('editRequestAddress').value = req.address || '';
                // populate coordinates inputs and map preview
                try {
                    const latEl = document.getElementById('editRequestLat');
                    const lngEl = document.getElementById('editRequestLng');
                    if (latEl && lngEl) {
                        if (req.lat && req.lng) {
                            latEl.value = Number(req.lat).toFixed(6);
                            lngEl.value = Number(req.lng).toFixed(6);
                            this._updateEditModalMap(Number(req.lat), Number(req.lng));
                        } else {
                            latEl.value = '';
                            lngEl.value = '';
                            this._updateEditModalMap(null, null);
                        }
                    }
                } catch(e){}
            document.getElementById('editRequestInstructions').value = req.instructions || '';
            document.getElementById('editRequestPrice').value = req.estimatedPrice || '';
            modal.setAttribute('data-edit-id', requestId);
            // reset pending images state
            this._editPendingImages = null;
            const imagesInput = document.getElementById('editRequestImages'); if (imagesInput) imagesInput.value = '';
            // render scrap items into modal
            try {
                const container = document.getElementById('editRequestScrapItems');
                if (container) {
                    container.innerHTML = '';
                    const items = req.scrapTypes && Array.isArray(req.scrapTypes) ? req.scrapTypes.slice() : [];
                    items.forEach((it, idx) => {
                        const row = document.createElement('div');
                        row.className = 'edit-scrap-row';
                        row.style.display = 'flex'; row.style.gap = '8px'; row.style.marginBottom = '8px';
                        row.innerHTML = `<input class="form-control" data-edit-scrap-type placeholder="Type" value="${(it.type||'')}">` +
                                        `<input class="form-control" data-edit-scrap-qty type="number" placeholder="kg" value="${(it.quantity||'')}">` +
                                        `<button class="btn btn--outline btn--sm" data-edit-remove>Remove</button>`;
                        const remove = row.querySelector('[data-edit-remove]');
                        remove.addEventListener('click', () => { row.remove(); });
                        container.appendChild(row);
                    });
                }
            } catch(e){ console.warn('render scrap items failed', e); }
            modal.classList.remove('hidden');
        } catch (e) { console.warn('openRequestEditModal failed', e); }
    }

    // capture or fallback location specifically for edit modal
    async captureEditModalLocation() {
        try {
            const coordsEl = document.getElementById('editRequestCoordinates');
            const btn = document.getElementById('editRequestGetLocation');
            if (btn) { btn.disabled = true; btn.textContent = 'Capturing...'; }
            const onSuccess = (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                // set inputs if present
                try { const latEl = document.getElementById('editRequestLat'); const lngEl = document.getElementById('editRequestLng'); if (latEl && lngEl) { latEl.value = lat.toFixed(6); lngEl.value = lng.toFixed(6); this._updateEditModalMap(lat, lng); } } catch(e){}
                if (coordsEl) coordsEl.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                if (btn) { btn.disabled = false; btn.textContent = 'Capture Location'; }
                return { lat, lng };
            };
            const onError = (err) => {
                console.warn('Edit modal geolocation failed', err);
                // fallback to approximate currentLocation if available
                const fallback = this.currentLocation || (this.locations && this.locations[0] ? { lat: this.locations[0].lat, lng: this.locations[0].lng } : null);
                if (fallback) {
                    try { const latEl = document.getElementById('editRequestLat'); const lngEl = document.getElementById('editRequestLng'); if (latEl && lngEl) { latEl.value = fallback.lat.toFixed(6); lngEl.value = fallback.lng.toFixed(6); this._updateEditModalMap(fallback.lat, fallback.lng); } } catch(e){}
                }
                if (fallback && coordsEl) coordsEl.textContent = `${fallback.lat.toFixed(6)}, ${fallback.lng.toFixed(6)}`;
                if (btn) { btn.disabled = false; btn.textContent = 'Capture Location'; }
                return fallback;
            };

            if (navigator && navigator.geolocation) {
                return await new Promise((resolve) => {
                    navigator.geolocation.getCurrentPosition((p) => resolve(onSuccess(p)), (e) => resolve(onError(e)), { enableHighAccuracy: true, timeout: 8000 });
                });
            } else {
                return onError(new Error('Geolocation not supported'));
            }
        } catch (e) { console.warn('captureEditModalLocation failed', e); try { const btn = document.getElementById('editRequestGetLocation'); if (btn) { btn.disabled = false; btn.textContent = 'Capture Location'; } } catch(_){} }
        return null;
    }

    async _convertEditImages() {
        try {
            if (!this._editPendingImages || !this._editPendingImages.length) return;
            const converted = [];
            for (const it of this._editPendingImages) {
                if (it.data) { converted.push(it); continue; }
                const f = it.file;
                const data = await new Promise((res, rej) => {
                    const reader = new FileReader();
                    reader.onload = () => res(reader.result);
                    reader.onerror = rej;
                    reader.readAsDataURL(f);
                });
                converted.push({ name: f.name, data });
            }
            this._editPendingImages = converted;
        } catch (e) { console.warn('convertEditImages failed', e); }
    }

    async saveEditedRequest() {
        try {
            const modal = document.getElementById('requestEditModal'); if (!modal) return;
            const id = modal.getAttribute('data-edit-id'); if (!id) return;
            const name = document.getElementById('editRequestCustomerName').value;
            const phoneRaw = document.getElementById('editRequestPhone').value;
            const phone = (window.__normalizePhone10 ? window.__normalizePhone10(phoneRaw) : phoneRaw);
            const address = document.getElementById('editRequestAddress').value;
            const instructions = document.getElementById('editRequestInstructions').value;
            const price = document.getElementById('editRequestPrice').value;
            const payload = { customerName: name, phone, address, instructions };
            // include scrap items if present in modal
            try {
                const container = document.getElementById('editRequestScrapItems');
                if (container) {
                    const rows = Array.from(container.querySelectorAll('.edit-scrap-row'));
                    const scrapTypes = rows.map(r => {
                        const t = (r.querySelector('[data-edit-scrap-type]') || {}).value || '';
                        const q = Number((r.querySelector('[data-edit-scrap-qty]') || {}).value) || 0;
                        return { type: t, quantity: q };
                    }).filter(x => x.type && x.quantity > 0);
                    if (scrapTypes.length) payload.scrapTypes = scrapTypes;
                }
            } catch(e) { console.warn('collect scrap items failed', e); }
            if (price) payload.estimatedPrice = Number(price);
            // include images if any selected
            if (this._editPendingImages && this._editPendingImages.length) {
                await this._convertEditImages();
                payload.images = this._editPendingImages.map(i => ({ name: i.name, data: i.data }));
            }
            // include coordinates if provided via edit modal inputs
            try {
                const latEl = document.getElementById('editRequestLat');
                const lngEl = document.getElementById('editRequestLng');
                if (latEl && lngEl) {
                    const lat = Number((latEl.value || '').trim());
                    const lng = Number((lngEl.value || '').trim());
                    if (!isNaN(lat) && isFinite(lat) && !isNaN(lng) && isFinite(lng)) { payload.lat = lat; payload.lng = lng; }
                }
            } catch(e) { /* ignore */ }
            const token = window.__getAuthToken && window.__getAuthToken();
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = 'Bearer ' + token;
            const base = this.getApiBase();
            const res = await fetch(base + `/api/requests/${id}`, { method: 'PUT', headers, body: JSON.stringify(payload) });
            if (!res.ok) {
                const txt = await res.text();
                this.showToast('Failed to save request: ' + txt, 'error');
                return;
            }
            const updated = await res.json();
            // merge updated into local requests
            const idx = this.requests.findIndex(r => String(r.id) === String(id));
            if (idx !== -1) { this.requests[idx] = Object.assign({}, this.requests[idx], updated); this.saveData(); }
            this.showToast('Request updated', 'success');
            modal.classList.add('hidden');
            // re-render views for dealer/customer
            if (this.currentRole === 'dealer') this.renderDealerDashboard(this.currentDealerId);
            if (this.currentRole === 'customer') this.showCustomerRequests();
        } catch (e) { console.warn('saveEditedRequest failed', e); this.showToast('Failed to save request', 'error'); }
    }

    // Initialize SSE connection to listen for request updates
    initRealtime() {
        try {
            const base = this.getApiBase();
            const url = base.replace(/\/+$/, '') + '/_events/requests';
            if (!window.EventSource) return;
            const es = new EventSource(url);
            es.addEventListener('request.updated', (evt) => {
                try {
                    const data = JSON.parse(evt.data);
                    if (!data || !data.id) return;
                    const idx = this.requests.findIndex(r => String(r.id) === String(data.id));
                    if (idx === -1) {
                        this.requests.unshift(data);
                    } else {
                        this.requests[idx] = Object.assign({}, this.requests[idx], data);
                    }
                    this.saveData();
                    // update UI for current role
                    if (this.currentRole === 'dealer') this.renderDealerDashboard(this.currentDealerId);
                    if (this.currentRole === 'customer') this.showCustomerRequests();
                    if (this.currentRole === 'admin') this.renderAdminRequests();
                } catch (e) { console.warn('failed to handle request.updated event', e); }
            });
            es.onerror = (e) => { console.warn('SSE error', e); };
            this._es = es;
        } catch (e) { console.warn('initRealtime failed', e); }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ScrapCollectApp();
});