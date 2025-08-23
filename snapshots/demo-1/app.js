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
                        this.currentRole = 'customer';
                        // hide the Switch Role control for standalone customers
                        const rs = document.getElementById('roleSelector');
                        if (rs) rs.style.display = 'none';
                        // show customer home immediately
                        try { this.showView('customerHome'); this.initCustomerView(); } catch(e){}
                    }
                }
            }
        } catch(e){}
    // rehydrate persisted auth token (if any) so API shim has it available
    try { if (window.__getAuthToken) { const t = window.__getAuthToken(); if (!t) { const saved = localStorage.getItem('scrapAuthToken'); if (saved && window.__setAuthUser) { /* token-only rehydrate: set in localStorage handled by shim */ } } } } catch(e){}
    this.setupEventListeners();
        this.initAuthListeners();
        this.showView('roleSelection');
    }

    // --- Authentication (phone-based simple) ---
    initAuthListeners() {
    const loginBtn = document.getElementById('loginBtn');
        const logoutBtn = document.getElementById('logoutBtn');
    if (loginBtn) loginBtn.addEventListener('click', () => this.showLoginModal(null));
        if (logoutBtn) logoutBtn.addEventListener('click', () => this.logout());
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
            const res = await fetch(`/api/users?phone=${encodeURIComponent(phone)}`);
            let user = null;
            if (res.ok) user = await res.json();
            if (!user) {
                const create = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) });
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
    if (lb) lb.style.display = '';
    if (lob) lob.style.display = 'none';
    this.showToast('Logged out', 'info');
    // clear persisted auth token if present
    try { if (window.__clearAuthToken) window.__clearAuthToken(); } catch(e){}
    // send customers back to the standalone customer login page
    try { window.location.href = 'customer_login.html'; } catch(e){}
    }


// ... truncated for brevity in snapshot copy ...
