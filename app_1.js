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
        this.setupEventListeners();
        this.showView('roleSelection');
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
            if (e.target.getAttribute('data-admin-view')) {
                e.preventDefault();
                const view = e.target.getAttribute('data-admin-view');
                this.showAdminSection(view);
            }
        });
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
        this.currentRole = role;
        const header = document.getElementById('header');
        const backBtn = document.getElementById('backBtn');
        
        if (header) header.style.display = 'block';
        if (backBtn) backBtn.style.display = 'inline-block';
        
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
    }

    captureLocation() {
        const btn = document.getElementById('getLocation');
        const display = document.getElementById('locationDisplay');
        const coordinates = document.getElementById('coordinates');

        if (btn) {
            btn.classList.add('loading');
            btn.textContent = 'Getting Location...';
        }

        setTimeout(() => {
            const randomLocation = this.locations[Math.floor(Math.random() * this.locations.length)];
            this.currentLocation = {
                lat: randomLocation.lat + (Math.random() - 0.5) * 0.01,
                lng: randomLocation.lng + (Math.random() - 0.5) * 0.01
            };

            if (coordinates) {
                coordinates.textContent = `${this.currentLocation.lat.toFixed(4)}, ${this.currentLocation.lng.toFixed(4)}`;
            }
            if (display) {
                display.classList.remove('hidden');
            }
            
            if (btn) {
                btn.classList.remove('loading');
                btn.textContent = '📍 Location Captured';
                btn.disabled = true;
                btn.style.background = 'var(--color-app-success)';
                btn.style.color = 'white';
            }

            this.showToast('Location captured successfully!', 'success');
        }, 2000);
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
        const dealerId = 1;
        this.currentDealerId = dealerId;
        this.renderDealerDashboard(dealerId);
    }

    renderDealerDashboard(dealerId) {
        const dealer = this.dealers.find(d => d.id === dealerId);
        if (!dealer) return;

        const assignedRequests = this.requests.filter(r => r.dealerId === dealerId);
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

        container.innerHTML = requests.map(request => `
            <div class="request-card">
                <div class="request-header">
                    <div>
                        <div class="request-id">Request #${request.id}</div>
                        <div class="request-date">${new Date(request.requestDate).toLocaleDateString()}</div>
                    </div>
                    <span class="status-badge status-${request.status.toLowerCase()}">${request.status}</span>
                </div>
                <div class="request-content">
                    <div class="request-details">
                        <h4>${request.customerName}</h4>
                        <div class="request-info">📞 ${request.phone}</div>
                        <div class="request-info">📍 ${request.address}</div>
                        <div class="request-info">📅 ${request.preferredDate} (${this.formatTimeSlot(request.preferredTime)})</div>
                        ${request.instructions ? `<div class="request-info">📝 ${request.instructions}</div>` : ''}
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
        `).join('');
    }

    getDealerActions(request) {
        switch(request.status) {
            case 'Assigned':
                return `
                    <button class="btn btn--app-success btn--sm" onclick="app.updateRequestStatus(${request.id}, 'En Route')">Accept & Start</button>
                    <button class="btn btn--app-danger btn--sm" onclick="app.showConfirmModal('Decline Request', 'Are you sure you want to decline this request?', () => app.updateRequestStatus(${request.id}, 'Pending', null))">Decline</button>
                `;
            case 'En Route':
                return `
                    <button class="btn btn--app-success btn--sm" onclick="app.updateRequestStatus(${request.id}, 'Completed')">Mark Completed</button>
                `;
            case 'Completed':
                return `<span class="status-badge status-completed">Completed</span>`;
            default:
                return '';
        }
    }

    updateRequestStatus(requestId, newStatus, newDealerId = undefined) {
        const requestIndex = this.requests.findIndex(r => r.id === requestId);
        if (requestIndex !== -1) {
            this.requests[requestIndex].status = newStatus;
            if (newDealerId !== undefined) {
                this.requests[requestIndex].dealerId = newDealerId;
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
        this.renderAdminStats();
        this.renderAdminRequests();
        this.renderDealersList();
        
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
                        <div class="request-id">Request #${request.id}</div>
                        <div class="request-date">${new Date(request.requestDate).toLocaleDateString()}</div>
                    </div>
                    <span class="status-badge status-${request.status.toLowerCase()}">${request.status}</span>
                </div>
                <div class="request-content">
                    <div class="request-details">
                        <h4>${request.customerName}</h4>
                        <div class="request-info">📞 ${request.phone}</div>
                        <div class="request-info">📍 ${request.address}</div>
                        <div class="request-info">📅 ${request.preferredDate}</div>
                        ${request.dealerId ? `<div class="request-info">🚛 ${this.dealers.find(d => d.id === request.dealerId)?.name || 'Unknown'}</div>` : ''}
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
        `).join('');
    }

    getAdminActions(request) {
        if (request.status === 'Pending') {
            const availableDealers = this.dealers.filter(d => d.active);
            return `
                <select class="form-control" id="dealer-${request.id}" style="margin-bottom: 8px;">
                    <option value="">Assign to Dealer</option>
                    ${availableDealers.map(dealer => `<option value="${dealer.id}">${dealer.name}</option>`).join('')}
                </select>
                <button class="btn btn--primary btn--sm" onclick="app.assignDealer(${request.id})">Assign</button>
            `;
        }
        return '';
    }

    assignDealer(requestId) {
        const dealerSelect = document.getElementById(`dealer-${requestId}`);
        if (!dealerSelect) return;
        
        const dealerId = parseInt(dealerSelect.value);
        
        if (!dealerId) {
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
        }
    }

    renderDealersList() {
        const container = document.getElementById('dealersList');
        if (!container) return;
        
        container.innerHTML = this.dealers.map(dealer => `
            <div class="dealer-card">
                <div class="dealer-header-info">
                    <div>
                        <div class="dealer-name">${dealer.name}</div>
                        <div class="dealer-info">📞 ${dealer.phone}</div>
                        <div class="dealer-info">📧 ${dealer.email}</div>
                        <div class="dealer-info">📍 ${dealer.serviceAreas.join(', ')}</div>
                        <div class="dealer-info">✅ ${dealer.completedJobs} completed jobs</div>
                    </div>
                    <div class="dealer-rating">⭐ ${dealer.rating}</div>
                </div>
                <div class="dealer-specialties">
                    ${dealer.specialties.map(spec => `<span class="specialty-tag">${spec}</span>`).join('')}
                </div>
            </div>
        `).join('');
    }

    showCustomerRequests() {
        const customerRequests = this.requests.slice(0, 2);
        const container = document.getElementById('customerRequestsList');
        if (!container) return;
        
        if (customerRequests.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--color-text-secondary);">No pickup requests found.</p>';
            return;
        }

        container.innerHTML = customerRequests.map(request => `
            <div class="request-card">
                <div class="request-header">
                    <div>
                        <div class="request-id">Request #${request.id}</div>
                        <div class="request-date">${new Date(request.requestDate).toLocaleDateString()}</div>
                    </div>
                    <span class="status-badge status-${request.status.toLowerCase()}">${request.status}</span>
                </div>
                <div class="request-content">
                    <div class="request-details">
                        <div class="request-info">📍 ${request.address}</div>
                        <div class="request-info">📅 ${request.preferredDate} (${this.formatTimeSlot(request.preferredTime)})</div>
                        ${request.dealerId ? `<div class="request-info">🚛 Assigned to: ${this.dealers.find(d => d.id === request.dealerId)?.name}</div>` : ''}
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
        `).join('');
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
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ScrapCollectApp();
});