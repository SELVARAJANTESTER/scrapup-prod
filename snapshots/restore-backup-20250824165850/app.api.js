// Minimal app.api shim copied for Preprod_3 snapshot
window.__SCRAP_API_BASE = window.__SCRAP_API_BASE || '';

function __normalizePhone10(p) {
    if (!p) return '';
    const d = String(p).replace(/\D/g, '');
    return d.length <= 10 ? d : d.slice(-10);
}

window.__normalizePhone10 = __normalizePhone10;

window.__getAuthToken = function() { try { return localStorage.getItem('scrapAuthToken'); } catch(e) { return null; } };
window.__setAuthUser = function(user) { try { if (!user) { localStorage.removeItem('scrapAuthToken'); return; } if (user.token) localStorage.setItem('scrapAuthToken', user.token); } catch(e){} };
window.__clearAuthToken = function() { try { localStorage.removeItem('scrapAuthToken'); } catch(e){} };

async function fetchJson(url, opts) {
    try {
        const r = await fetch(url, opts);
        if (!r.ok) throw new Error('Fetch failed: ' + r.status);
        return await r.json();
    } catch (e) {
        console.warn('fetchJson fallback', e);
        throw e;
    }
}

window.__refreshRequests = async function() {
    try {
        const base = window.__SCRAP_API_BASE || '';
        const token = localStorage.getItem('scrapAuthToken');
        const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
        const qs = '';
        const res = await fetch((base || '') + '/api/requests' + qs, { headers });
        const data = (res && res.ok) ? await res.json() : [];
        // normalize images
        if (Array.isArray(data)) {
            return data.map(r => {
                if (Array.isArray(r.images)) {
                    r.images = r.images.map(im => (typeof im === 'string') ? im : (im && (im.url || im.data || ''))).filter(Boolean);
                }
                return r;
            });
        }
        return data;
    } catch (e) { console.warn('__refreshRequests failed', e); return []; }
};

window.submitPickupRequest = async function(payload) {
    try {
        const base = window.__SCRAP_API_BASE || '';
        const res = await fetch((base || '') + '/api/requests', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error(await res.text());
        const created = await res.json();
        // refresh local requests if helper present
        try { if (window.__refreshRequests) await window.__refreshRequests(); } catch(e){}
        return created;
    } catch (e) { console.warn('submitPickupRequest failed', e); throw e; }
};

window.updateRequestStatus = async function(id, payload) {
    try {
        const base = window.__SCRAP_API_BASE || '';
        const res = await fetch((base || '') + '/api/requests/' + id, { method: 'PUT', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error(await res.text());
        const updated = await res.json();
        try { if (window.__refreshRequests) await window.__refreshRequests(); } catch(e){}
        return updated;
    } catch (e) { console.warn('updateRequestStatus failed', e); throw e; }
};

// Export minimal functions list for snapshot clarity
window.__snapshot_meta = { files: ['app.js','app.api.js','home.html','server.js','app_data_fallback.json','package.json','tools/assign_flow_test.js'] };
