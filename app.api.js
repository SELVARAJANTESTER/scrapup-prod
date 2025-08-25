// Frontend API shim: replaces app data with server data and patches submission
// to use REST endpoints at /api/*

(function() {
  function waitForApp(cb) {
    if (window.app) return cb();
    document.addEventListener('DOMContentLoaded', () => {
      const timer = setInterval(() => {
        if (window.app) {
          clearInterval(timer);
          cb();
        }
      }, 100);
    });
  }

  waitForApp(async () => {
    const app = window.app;
    if (!app) return;

    // local token for simple session (kept in-memory, persisted to localStorage for longer sessions)
    let __authToken = null;

    // rehydrate token from localStorage if present
    try {
      const saved = localStorage.getItem('scrapAuthToken');
      if (saved) __authToken = saved;
    } catch (e) {}

    async function setTokenFromUser(user) {
      if (!user) return;
      if (user.token) {
        __authToken = user.token;
        try { localStorage.setItem('scrapAuthToken', __authToken); } catch(e){}
      }
    }

    // expose normalize helper
    window.__normalizePhone10 = function(phone) {
      if (!phone) return null;
      const d = String(phone).replace(/\D/g, '');
      if (d.length < 10) return null;
      return d.slice(-10);
    };

    async function fetchJson(url) {
      // Try relative first, then same-origin absolute, then explicit localhost:3000
      async function tryFetch(u) {
        const headers = {};
        if (__authToken) headers['Authorization'] = 'Bearer ' + __authToken;
        const res = await fetch(u, { credentials: 'same-origin', headers });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || res.statusText);
        }
        return await res.json();
      }

      // helper to build absolute URL from a base
      function abs(base, path) {
        if (!path) return base;
        return base + (path.startsWith('/') ? path : '/' + path);
      }

      const attempts = [];
      // If developer set a specific API base (window.__SCRAP_API_BASE or localStorage), prefer that first
      try {
        let explicitBase = null;
        if (typeof window !== 'undefined') {
          explicitBase = (window.__SCRAP_API_BASE && String(window.__SCRAP_API_BASE).trim()) || null;
          try { const ls = localStorage.getItem('scrapApiBase'); if (!explicitBase && ls) explicitBase = ls; } catch(e){}
        }
        if (explicitBase) {
          // avoid literal placeholders that will cause DNS errors
          if (/your[_-]?backend|YOUR[_-]?BACKEND|your-backend/.test(explicitBase)) {
            explicitBase = null;
          } else {
            // ensure it has a protocol
            if (!/^(https?:)?\/\//i.test(explicitBase)) explicitBase = 'http://' + explicitBase;
            attempts.push(abs(explicitBase.replace(/\/$/, ''), url));
          }
        }

      } catch(e) { /* ignore explicit base read errors */ }

      // 1) relative
      attempts.push(url);
      // 2) same origin (use when page served over http(s))
      try {
        if (window && window.location && window.location.host) {
          const proto = window.location.protocol || 'http:';
          const host = window.location.host;
          attempts.push(abs(`${proto}//${host}`, url));
        }
      } catch (e) {}
  // 3) explicit localhost:3001 (used during dev when server runs on 3001)
  attempts.push(abs('http://localhost:3001', url));
  // 4) fallback localhost:3000
  attempts.push(abs('http://localhost:3000', url));

      for (const u of attempts) {
        try {
          const result = await tryFetch(u);
          if (result) return result;
        } catch (err) {
          console.warn('API fetch failed', u, err && err.message);
        }
      }
      return null;
    }

    // Expose a setter so app can inform this shim about an authenticated user
    window.__setAuthUser = async function(user) {
  await setTokenFromUser(user);
  // ensure app knows about the current user so role flows won't redirect
  try { if (app && user) app.currentUser = user; } catch(e) {}
      // re-fetch server data scoped to this user
  const normalized = window.__normalizePhone10(user && user.phone);
  const phoneQuery = normalized ? ('?phone=' + encodeURIComponent(normalized)) : '';
      try {
        const [scrapTypes, dealers, requests] = await Promise.all([
          fetchJson('/api/scrapTypes'),
          fetchJson('/api/dealers'),
          fetchJson('/api/requests' + phoneQuery)
        ]);
        if (Array.isArray(scrapTypes) && scrapTypes.length) app.scrapTypes = scrapTypes.map(s => ({ id: s.id || s.name, ...s }));
        if (Array.isArray(dealers) && dealers.length) app.dealers = dealers.map(d => ({ id: d.id || d.name, ...d }));
        if (Array.isArray(requests)) {
          app.requests = requests.map(r => {
            const normalized = { id: r.id || r.requestId || Date.now(), ...r };
            if (Array.isArray(normalized.images) && normalized.images.length) {
              normalized.images = normalized.images.map(img => {
                if (!img) return img;
                if (typeof img === 'string') return img;
                if (img.data) return img.data;
                if (img.url) return img.url;
                return img;
              });
            }
            return normalized;
          });
        }
        // Initialize only the view that is active or that the user is allowed to see.
        try {
            const userRole = (user && user.role) ? String(user.role).toLowerCase() : null;
          if (app.currentRole === 'customer' || (!app.currentRole && userRole === 'customer')) { app.initCustomerView(); }
          if (app.currentRole === 'dealer' || (!app.currentRole && userRole === 'dealer')) { app.initDealerView(); }
          if (app.currentRole === 'admin' || (!app.currentRole && userRole === 'admin')) { app.initAdminView(); }
        } catch(e){}
      } catch(e) { console.warn('Failed to refresh data after auth', e); }
    };

    // Load initial data from server if available
    // If logged in, include phone for server-side filtering
    await setTokenFromUser(app.currentUser);

  // expose getter for the auth token to other app code
  window.__getAuthToken = function() { return __authToken; };

  // expose a clear token helper
  window.__clearAuthToken = function() { __authToken = null; try { localStorage.removeItem('scrapAuthToken'); } catch(e){} };
    const phoneQuery = (app.currentUser && app.currentUser.phone) ? ('?phone=' + encodeURIComponent(app.currentUser.phone)) : '';
    const [scrapTypes, dealers, requests] = await Promise.all([
      fetchJson('/api/scrapTypes'),
      fetchJson('/api/dealers'),
      fetchJson('/api/requests' + phoneQuery)
    ]);

    if (Array.isArray(scrapTypes) && scrapTypes.length) {
      app.scrapTypes = scrapTypes.map(s => ({ id: s.id || s.name, ...s }));
    }
    if (Array.isArray(dealers) && dealers.length) {
      app.dealers = dealers.map(d => ({ id: d.id || d.name, ...d }));
    }
    if (Array.isArray(requests) && requests.length) {
      // Normalize request id field and images
      app.requests = requests.map(r => {
        const normalized = { id: r.id || r.requestId || Date.now(), ...r };
        if (Array.isArray(normalized.images) && normalized.images.length) {
          normalized.images = normalized.images.map(img => {
            if (!img) return img;
            if (typeof img === 'string') return img;
            if (img.data) return img.data; // already a data URL
            // fallback: try to build from object fields
            if (img.name && img.url) return img.url;
            return img;
          });
        }
        return normalized;
      });
    }

    // Re-render only the active view to reflect server data
    try {
      if (app.currentRole === 'customer') app.initCustomerView();
      else if (app.currentRole === 'dealer') app.initDealerView();
      else if (app.currentRole === 'admin') app.initAdminView();
      else {
        // no active role: safe default is customer summary only
        app.initCustomerView();
      }
    } catch (e) {}

  // Patch submitPickupRequest to POST to server
    const originalSubmit = app.submitPickupRequest.bind(app);
    app.submitPickupRequest = async function(form) {
      // Recreate the payload similar to original
      const formData = new FormData(form);
      const scrapItems = [];
      document.querySelectorAll('.scrap-item').forEach(item => {
        const scrapTypeSelect = item.querySelector('select[name="scrapType"]');
        const quantityInput = item.querySelector('input[name="quantity"]');
        if (scrapTypeSelect && quantityInput) {
          const scrapType = scrapTypeSelect.value;
          const quantity = parseFloat(quantityInput.value);
          if (scrapType && quantity > 0) scrapItems.push({ type: scrapType, quantity });
        }
      });

      if (!this.currentLocation) {
        this.showToast('Please capture your location first', 'error');
        return;
      }
      if (scrapItems.length === 0) {
        this.showToast('Please add at least one scrap item', 'error');
        return;
      }

  const payload = {
  customerName: formData.get('customerName'),
  // prefer authenticated user's canonical phone to avoid mismatch
  phone: (app.currentUser && app.currentUser.phone) ? (window.__normalizePhone10 ? window.__normalizePhone10(app.currentUser.phone) : app.currentUser.phone) : formData.get('phone'),
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
      // Attach images if any
      if (this._pendingImages && this._pendingImages.length) payload.images = this._pendingImages;
      // Validate payload if validator present
      if (typeof this.validateRequestPayload === 'function') {
        const v = this.validateRequestPayload(payload);
        if (v) { this.showToast(v, 'error'); return; }
      }

      try {
  const base = (window && window.location && window.location.host) ? (window.location.protocol + '//' + window.location.host) : 'http://localhost:3000';
  const target = base + '/api/requests';
  const headers = { 'Content-Type': 'application/json' };
  if (__authToken) headers['Authorization'] = 'Bearer ' + __authToken;
  const res = await fetch(target, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(await res.text());
        const created = await res.json();
        // Ensure app.requests exists
        app.requests = app.requests || [];
        app.requests.unshift(created);
        app.showToast('Pickup request submitted successfully!', 'success');
        // Refresh server-backed lists so assigned requests propagate to other clients (dealers/admin)
        try {
          const normalizedPhone = (window.__normalizePhone10 && app.currentUser && app.currentUser.phone) ? window.__normalizePhone10(app.currentUser.phone) : (app.currentUser && app.currentUser.phone) || '';
          const phoneQuery2 = normalizedPhone ? ('?phone=' + encodeURIComponent(normalizedPhone)) : '';
          const [newDealers, newRequests] = await Promise.all([
            fetchJson('/api/dealers'),
            fetchJson('/api/requests' + phoneQuery2)
          ]);
          if (Array.isArray(newDealers)) app.dealers = newDealers.map(d => ({ id: d.id || d.name, ...d }));
          if (Array.isArray(newRequests)) {
            app.requests = newRequests.map(r => {
              const normalized = { id: r.id || r.requestId || Date.now(), ...r };
              if (Array.isArray(normalized.images) && normalized.images.length) {
                normalized.images = normalized.images.map(img => {
                  if (!img) return img;
                  if (typeof img === 'string') return img;
                  if (img.data) return img.data;
                  if (img.url) return img.url;
                  return img;
                });
              }
              return normalized;
            });
          }
        } catch (err) {
          console.warn('Failed to refresh lists after create', err && err.message);
        }

        form.reset();
        this.currentLocation = null;
        setTimeout(() => { this.showView('customerHome'); }, 1200);
      } catch (e) {
        console.error('Failed to submit request', e);
        this.showToast('Failed to submit request to server', 'error');
      }
    };

    // Patch updateRequestStatus to call server
    const originalUpdate = app.updateRequestStatus.bind(app);
    app.updateRequestStatus = async function(requestId, newStatus, newDealerId = undefined) {
      try {
        const updates = { status: newStatus };
        if (newDealerId !== undefined) updates.dealerId = newDealerId;
  const base = (window && window.location && window.location.host) ? (window.location.protocol + '//' + window.location.host) : 'http://localhost:3000';
  const target = base + `/api/requests/${requestId}`;
  const headers = { 'Content-Type': 'application/json' };
  if (__authToken) headers['Authorization'] = 'Bearer ' + __authToken;
  const res = await fetch(target, {
          method: 'PUT',
          headers,
          body: JSON.stringify(updates)
        });
        if (!res.ok) throw new Error(await res.text());
        const updated = await res.json();
        // Update local copy
        const idx = (app.requests || []).findIndex(r => String(r.id) === String(requestId));
        if (idx !== -1) app.requests[idx] = Object.assign({}, app.requests[idx], updated);
        app.showToast(`Request #${requestId} updated to ${newStatus}`, 'success');
        // Refresh lists from server so dealer assignments and status changes propagate
        try {
          const normalizedPhone = (window.__normalizePhone10 && app.currentUser && app.currentUser.phone) ? window.__normalizePhone10(app.currentUser.phone) : (app.currentUser && app.currentUser.phone) || '';
          const phoneQuery2 = normalizedPhone ? ('?phone=' + encodeURIComponent(normalizedPhone)) : '';
          const [newDealers, newRequests] = await Promise.all([
            fetchJson('/api/dealers'),
            fetchJson('/api/requests' + phoneQuery2)
          ]);
          if (Array.isArray(newDealers)) app.dealers = newDealers.map(d => ({ id: d.id || d.name, ...d }));
          if (Array.isArray(newRequests)) {
            app.requests = newRequests.map(r => {
              const normalized = { id: r.id || r.requestId || Date.now(), ...r };
              if (Array.isArray(normalized.images) && normalized.images.length) {
                normalized.images = normalized.images.map(img => {
                  if (!img) return img;
                  if (typeof img === 'string') return img;
                  if (img.data) return img.data;
                  if (img.url) return img.url;
                  return img;
                });
              }
              return normalized;
            });
          }
        } catch (err) {
          console.warn('Failed to refresh lists after update', err && err.message);
        }

        if (app.currentRole === 'dealer') app.renderDealerDashboard(app.currentDealerId);
        if (app.currentRole === 'admin') app.initAdminView();
      } catch (e) {
        console.error('Failed to update request', e);
        this.showToast('Failed to update request on server', 'error');
      }
      this.hideModal();
    };

    console.log('Frontend API shim initialized');
  });
})();
