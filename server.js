/*
  Simple Express server that uses Firebase Admin SDK (Firestore) as the backend
  API for the ScrapCollect demo app.

  Place your Firebase service account JSON at:
    ./firebase-service-account.json

  Install dependencies and run:
    npm install
    npm start

  Endpoints:
    GET  /api/scrapTypes
    GET  /api/dealers
    GET  /api/requests
    POST /api/requests
    PUT  /api/requests/:id

  The server also serves the static frontend files from the same folder.
*/

const express = require('express');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const crypto = require('crypto');

let admin;
let db;

try {
  admin = require('firebase-admin');
  const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
  // Allow injecting the entire service account JSON via env var (useful for Railway / CI)
  let serviceAccount = null;
  // 1) Accept base64-encoded JSON in FIREBASE_SERVICE_ACCOUNT_B64 (some UIs prefer base64)
  if (process.env.FIREBASE_SERVICE_ACCOUNT_B64) {
    try {
      const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8');
      serviceAccount = JSON.parse(decoded);
      console.log('Loaded Firebase service account from FIREBASE_SERVICE_ACCOUNT_B64 env var.');
    } catch (e) {
      console.warn('FIREBASE_SERVICE_ACCOUNT_B64 is present but invalid or not JSON after decoding:', e && e.message);
    }
  }
  // 2) Fallback to raw JSON in FIREBASE_SERVICE_ACCOUNT
  if (!serviceAccount && process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      console.log('Loaded Firebase service account from FIREBASE_SERVICE_ACCOUNT env var.');
    } catch (e) {
      // Try base64 decode in case the user accidentally pasted a base64 string into the raw var
      try {
        const maybeDecoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8');
        serviceAccount = JSON.parse(maybeDecoded);
        console.log('Loaded Firebase service account by base64-decoding FIREBASE_SERVICE_ACCOUNT.');
      } catch (e2) {
        console.warn('FIREBASE_SERVICE_ACCOUNT is present but contains invalid JSON:', e && e.message);
      }
    }
  }
  if (!serviceAccount) {
    if (!fs.existsSync(serviceAccountPath)) {
      console.warn('Firebase service account not found at ./firebase-service-account.json.\nYou can set FIREBASE_SERVICE_ACCOUNT env var with the JSON to avoid storing a file.');
    } else {
      try {
        serviceAccount = require(serviceAccountPath);
      } catch (e) {
        console.warn('Failed to load service account file:', e && e.message);
      }
    }
  }
  if (serviceAccount) {
    // Determine storage bucket: prefer env var, then serviceAccount field,
    // then default to the Firebase standard <project_id>.firebasestorage.app
    const rawBucket = process.env.FIREBASE_STORAGE_BUCKET || serviceAccount.storageBucket || (serviceAccount.project_id ? `${serviceAccount.project_id}.firebasestorage.app` : undefined);
    const storageBucket = rawBucket && String(rawBucket).trim();
    const initOpts = { credential: admin.credential.cert(serviceAccount) };
    if (storageBucket) initOpts.storageBucket = storageBucket;
    admin.initializeApp(initOpts);
    db = admin.firestore();
    console.log('Firebase Admin initialized. Scheduling Firestore access test...');
    // Verify that the service account can actually access Firestore.
    // If the credentials are invalid (UNAUTHENTICATED), fall back to local JSON.
    (async function testFirestoreAccess() {
      try {
        await db.collection('users').limit(1).get();
        console.log('Firestore access OK.');
      } catch (e) {
        console.warn('Firestore access test failed; falling back to local data. Error:', e && e.message);
        // disable Firestore usage so routes use fallbackData instead
        db = null;
        try { admin.app() && admin.app().delete(); } catch(err){}
        admin = null;
      }
    })();
  }
} catch (err) {
  console.warn('firebase-admin not available or failed to initialize:', err && err.message);
}

const app = express();
app.use(cors());
// Increase payload limits to allow image data URLs in JSON bodies
app.use(bodyParser.json({ limit: '20mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '20mb' }));

// Map root to index1.html explicitly so / loads the main UI
app.get('/', (req, res) => {
  try {
    res.sendFile(path.join(__dirname, 'index1.html'));
  } catch (e) {
    res.status(500).send('index1.html not found');
  }
});
// Back-compat routes: map legacy entry points to index1.html
app.get(['/home.html', '/index.html'], (req, res) => {
  try { res.sendFile(path.join(__dirname, 'index1.html')); }
  catch (e) { res.status(404).send('index1.html not found'); }
});
// NOTE: static middleware is intentionally registered later (after API routes)
// to avoid serving /api/* as filesystem files and preempting API endpoints.

// Helper to use fallback in-memory data if Firestore isn't configured
let fallbackData = {};
try { fallbackData = require('./app_data_fallback.json'); } catch(e) { fallbackData = {}; }

// Ensure consistent id schemes for fallback data:
// - Dealers: numeric ids starting at 1000 (1000,1001,...)
// - Requests: string ids zero-padded 4 digits starting at '0001'
// Update user.dealerId and request.dealerId references to the new dealer ids.
function zeroPad(n, width) { const s = String(n); return s.length >= width ? s : '0'.repeat(width - s.length) + s; }
function normalizeFallbackRecords() {
  try {
    fallbackData.dealers = fallbackData.dealers || [];
    fallbackData.users = fallbackData.users || [];
    fallbackData.requests = fallbackData.requests || [];

    // build map of old dealer-identifiers -> new numeric id
    const oldToNewDealerId = Object.create(null);
    let nextDealerId = 1000;
    // prefer existing numeric ids >=1000 to avoid collisions
    for (const d of fallbackData.dealers) {
      const oldId = (d && (d.id !== undefined && d.id !== null)) ? String(d.id) : (d && d.phone) ? ('phone:' + String(d.phone)) : ('idx:' + Math.random().toString(36).slice(2,8));
      if (!oldToNewDealerId[oldId]) {
        // pick next available >=1000
        oldToNewDealerId[oldId] = nextDealerId++;
      }
    }
    // apply new ids and normalize phone format
    for (const d of fallbackData.dealers) {
      const oldId = (d && (d.id !== undefined && d.id !== null)) ? String(d.id) : (d && d.phone) ? ('phone:' + String(d.phone)) : null;
      const newId = oldToNewDealerId[oldId];
      d.id = Number(newId);
      try { d.phone = normalizePhone10(d.phone) || d.phone; } catch(e){}
    }

    // Update users to reference new dealer ids where applicable (by matching old id or phone)
    const phoneToDealer = Object.create(null);
    for (const d of fallbackData.dealers) { if (d && d.phone) phoneToDealer[String(d.phone)] = d.id; }
    for (const u of fallbackData.users) {
      try {
        if (u && u.dealerId !== undefined && u.dealerId !== null) {
          const mapped = oldToNewDealerId[String(u.dealerId)] || oldToNewDealerId['phone:' + String(u.dealerId)] || null;
          if (mapped) u.dealerId = mapped;
        }
        // if user's phone matches a dealer, ensure dealerId set
        const up = normalizePhone10(u && u.phone) || String(u && u.phone || '');
        if (up && phoneToDealer[up]) u.dealerId = phoneToDealer[up];
      } catch (e) { /* ignore */ }
    }

    // Reassign request ids to zero-padded 4-digit strings and remap dealerId references
    let seq = 0;
    // Compute starting seq as max existing numeric parse of ids, else start 0
    for (const r of fallbackData.requests) {
      if (r && r.id) {
        const n = parseInt(String(r.id).replace(/^0+/, ''), 10);
        if (!isNaN(n) && n > seq) seq = Math.max(seq, n);
      }
    }
    for (const r of fallbackData.requests) {
  seq += 1;
  // use numeric ids for requests in fallback for consistency
  r.id = seq;
      // remap dealerId if present
      if (r.dealerId !== undefined && r.dealerId !== null) {
        // try old id string mapping first
        const mapped = oldToNewDealerId[String(r.dealerId)] || phoneToDealer[normalizePhone10(r.dealerId) || r.dealerId] || null;
        if (mapped) r.dealerId = mapped;
        else {
          // leave as-is but ensure numeric if possible
          const maybe = Number(r.dealerId);
          if (!isNaN(maybe)) r.dealerId = maybe;
        }
      }
    }

    // persist normalized fallback data
    try { fs.writeFileSync(path.join(__dirname, 'app_data_fallback.json'), JSON.stringify(fallbackData, null, 2)); } catch(e){ console.warn('failed to persist normalized fallback data', e && e.message); }
  } catch (e) { console.warn('normalizeFallbackRecords failed', e && e.message); }
}

try { normalizeFallbackRecords(); } catch(e) { console.warn('normalizeFallbackRecords call failed', e && e.message); }

async function getCollectionData(collectionName) {
  if (!db) return fallbackData[collectionName] || [];
  try {
    const snapshot = await db.collection(collectionName).orderBy('id').get();
    return snapshot.docs.map(doc => {
      const data = doc.data() || {};
      // prefer numeric id stored in document data; otherwise try to parse doc.id as number
      let id = (data.id !== undefined && data.id !== null) ? data.id : undefined;
      if (id !== undefined) {
        const n = Number(id);
        if (!isNaN(n)) id = n;
      } else {
        const parsed = Number(doc.id);
        if (!isNaN(parsed)) id = parsed;
        else id = doc.id;
      }
      return Object.assign({}, data, { id });
    });
  } catch (e) {
    console.warn(`Failed to read collection ${collectionName} from Firestore, falling back to local data:`, e && e.message);
    return fallbackData[collectionName] || [];
  }
}

// Firestore-safe numeric id generator per collection. Uses a counters/{collectionName} doc
// to store a seq field. If the counter is missing, we scan the collection for the current
// max numeric id and initialize the counter to that value before incrementing.
async function getNextId(collectionName) {
  if (!db) return null;
  const counterRef = db.collection('counters').doc(collectionName);
  // compute current max id in collection (best-effort)
  let max = 0;
  try {
    const snap = await db.collection(collectionName).get();
    snap.forEach(d => {
      const data = d.data() || {};
      let idVal = undefined;
      if (data.id !== undefined && data.id !== null) idVal = Number(data.id);
      else {
        const parsed = Number(d.id);
        if (!isNaN(parsed)) idVal = parsed;
      }
      if (!isNaN(idVal)) max = Math.max(max, idVal);
    });
  } catch (e) {
    // if scan fails, fall back to 0
    max = 0;
  }
  const initial = Math.max(1000, max);
  // transactionally increment counter
  const next = await db.runTransaction(async t => {
    const s = await t.get(counterRef);
    if (!s.exists) {
      const seed = initial + 1;
      t.set(counterRef, { seq: seed });
      return seed;
    }
    const cur = Number(s.get('seq') || 0);
    const nxt = cur + 1;
    t.update(counterRef, { seq: nxt });
    return nxt;
  });
  return next;
}

// Clean specific Firestore collections: ensure numeric ids and remove docs with blank id
async function cleanFirestoreCollections() {
  if (!db) return;
  const collectionsToClean = ['scrapTypes', 'dealers'];
  for (const name of collectionsToClean) {
    try {
      const snap = await db.collection(name).get();
      for (const doc of snap.docs) {
        const data = doc.data() || {};
        // If id is missing or blank, delete the document
        if (data.id === undefined || data.id === null || String(data.id).trim() === '') {
          try { await db.collection(name).doc(doc.id).delete(); console.log(`cleanFirestoreCollections: deleted ${name}/${doc.id} missing id`); } catch(e) { console.warn('delete failed', name, doc.id, e && e.message); }
          continue;
        }
        // Coerce id to Number when possible and persist if changed
        const parsed = Number(data.id);
        if (!isNaN(parsed) && parsed !== data.id) {
          try { await db.collection(name).doc(doc.id).set({ id: parsed }, { merge: true }); console.log(`cleanFirestoreCollections: normalized ${name}/${doc.id} id -> ${parsed}`); } catch(e) { console.warn('merge id failed', name, doc.id, e && e.message); }
        }
      }
    } catch (e) { console.warn('cleanFirestoreCollections failed for', name, e && e.message); }
  }
}

// Ensure every dealer has a corresponding user with role 'dealer'
async function syncDealersToUsers() {
  try {
    if (!db) {
      // fallback: ensure fallbackData.users has an entry per dealer
      fallbackData.dealers = fallbackData.dealers || [];
      fallbackData.users = fallbackData.users || [];
      let changed = false;
      for (const d of fallbackData.dealers) {
        try {
          const phone = normalizePhone10(d && d.phone) || String(d && d.phone || '');
          let u = (fallbackData.users || []).find(u2 => String(u2.dealerId) === String(d.id) || normalizePhone10(u2.phone) === phone);
          if (u) {
            u.role = 'dealer';
            u.dealerId = d.id;
            if (!u.token) u.token = crypto.randomBytes(24).toString('hex');
          } else {
            const newUserId = (fallbackData.users.reduce((m, u3) => Math.max(m, Number(u3.id || 0)), 9000) + 1);
            fallbackData.users.push({ id: newUserId, name: d.name || null, phone: phone, role: 'dealer', dealerId: d.id, token: crypto.randomBytes(24).toString('hex') });
            changed = true;
          }
        } catch (e) { console.warn('syncDealersToUsers (fallback) per-dealer failed', e && e.message); }
      }
      if (changed) {
        try { fs.writeFileSync(path.join(__dirname, 'app_data_fallback.json'), JSON.stringify(fallbackData, null, 2)); } catch(e){ console.warn('failed to persist fallback users after sync', e && e.message); }
      }
      return;
    }

    // Firestore branch
    const dealersSnap = await db.collection('dealers').get();
    const usersRef = db.collection('users');
    for (const dd of dealersSnap.docs) {
      try {
        const d = dd.data() || {};
        const did = (d.id !== undefined && d.id !== null) ? d.id : (Number(dd.id) || dd.id);
        const phone = normalizePhone10(d && d.phone) || d.phone || null;
        // try to find user by dealerId
        let userSnap = await usersRef.where('dealerId', '==', did).limit(1).get();
        if (userSnap.empty && phone) {
          // try by phone
          userSnap = await usersRef.where('phone', '==', phone).limit(1).get();
        }
        if (!userSnap.empty) {
          const doc = userSnap.docs[0];
          await usersRef.doc(doc.id).set({ dealerId: did, role: 'dealer', phone: phone, name: d.name || null }, { merge: true });
          continue;
        }
        // create new dealer user
        const token = crypto.randomBytes(24).toString('hex');
        await usersRef.add({ name: d.name || null, phone: phone, role: 'dealer', dealerId: did, token });
      } catch (e) { console.warn('syncDealersToUsers (firestore) per-dealer failed', e && e.message); }
    }
  } catch (e) { console.warn('syncDealersToUsers failed', e && e.message); }
}

// Ensure fallback data items have stable ids so client can reference them reliably.
// This will mutate fallbackData in-memory and persist it back to app_data_fallback.json if any ids were added.
function ensureFallbackIds(collectionName) {
  try {
    fallbackData[collectionName] = fallbackData[collectionName] || [];
    // compute max numeric id present
    let maxId = fallbackData[collectionName].reduce((m, x) => {
      const n = Number(x && x.id);
      return (!isNaN(n) && isFinite(n)) ? Math.max(m, n) : m;
    }, 0);
    let changed = false;
    for (let i = 0; i < fallbackData[collectionName].length; i++) {
      const item = fallbackData[collectionName][i];
      if (item && (item.id === undefined || item.id === null || item.id === '')) {
        maxId += 1;
        item.id = Number(maxId);
        changed = true;
      }
    }
    if (changed) {
      try { fs.writeFileSync(path.join(__dirname, 'app_data_fallback.json'), JSON.stringify(fallbackData, null, 2)); } catch (e) { console.warn('Failed to persist fallback id changes', e && e.message); }
    }
  } catch (e) { console.warn('ensureFallbackIds failed', e && e.message); }
}

// Pre-normalize known collections in fallback data at startup
try { ensureFallbackIds('scrapTypes'); ensureFallbackIds('dealers'); ensureFallbackIds('requests'); ensureFallbackIds('users'); } catch(e) {}

// Remove duplicate dealers in fallbackData based on normalized phone numbers.
// Keeps the first occurrence and reassigns user.dealerId references to the kept dealer.
function dedupeFallbackDealers() {
  try {
    fallbackData.dealers = fallbackData.dealers || [];
    const seen = Object.create(null);
    const deduped = [];
    const moved = [];
    for (const item of fallbackData.dealers) {
      const phone = normalizePhone10(item && item.phone) || String(item && item.phone || '');
      if (!phone) {
        // keep items without valid phone as-is
        deduped.push(item);
        continue;
      }
      if (!seen[phone]) {
        // ensure phone stored as normalized
        item.phone = phone;
        seen[phone] = item;
        deduped.push(item);
      } else {
        // duplicate: record for reassignment then drop
        moved.push({ from: item, to: seen[phone] });
      }
    }
    if (moved.length) {
      // Reassign users that pointed to duplicate dealer ids
      try {
        fallbackData.users = fallbackData.users || [];
        for (const m of moved) {
          const fromId = String(m.from.id);
          const toId = String(m.to.id);
          for (const u of fallbackData.users) {
            if (String(u.dealerId) === fromId) {
              u.dealerId = toId;
            }
            // also if user phone matched duplicate phone, ensure dealerId is set
            const uphone = normalizePhone10(u && u.phone) || String(u && u.phone || '');
            if (uphone && uphone === m.to.phone) {
              u.dealerId = toId;
              u.role = u.role || 'dealer';
            }
          }
        }
      } catch (e) { console.warn('failed to reassign users during dealer dedupe', e && e.message); }
      fallbackData.dealers = deduped;
      try { fs.writeFileSync(path.join(__dirname, 'app_data_fallback.json'), JSON.stringify(fallbackData, null, 2)); } catch (e) { console.warn('failed to persist fallback dedupe', e && e.message); }
    }
  } catch (e) { console.warn('dedupeFallbackDealers failed', e && e.message); }
}

try { dedupeFallbackDealers(); } catch(e) {}

// normalize phone to last 10 digits (string of digits only)
function normalizePhone10(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

// helper: find user by token (works with Firestore or fallbackData)
async function findUserByToken(token) {
  if (!token) return null;
  if (!db) {
    const users = fallbackData.users || [];
    return users.find(u => u.token === token) || null;
  }
  const snap = await db.collection('users').where('token', '==', token).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

// helper: require admin
const requireAdmin = async (req, res, next) => {
  try {
    const auth = req.headers && req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'missing auth' });
    const token = auth.replace(/^Bearer\s+/i, '');
    const user = await findUserByToken(token); // existing helper
    if (!user) return res.status(401).json({ error: 'invalid token' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'admin-only' });
    req.authUser = user;
    next();
  } catch (err) {
    console.error('admin check failed', err);
    res.status(500).json({ error: 'server error' });
  }
};

// Seed collections if empty
async function seedIfEmpty() {
  if (!db) return;
  const collections = ['scrapTypes', 'dealers', 'requests', 'users'];
  for (const name of collections) {
    const colRef = db.collection(name);
    const snapshot = await colRef.limit(1).get();
    if (snapshot.empty) {
      console.log(`Seeding collection ${name} from fallback data`);
      const items = fallbackData[name] || [];
      for (const item of items) {
        const copy = Object.assign({}, item);
        await colRef.add(copy);
      }
    }
  }
}

// Users endpoints (simple phone-based login)
app.get('/api/users', async (req, res) => {
  try {
    const rawPhone = req.query.phone;
    if (rawPhone === undefined) return res.status(400).json({ error: 'phone query required' });
    const phone = normalizePhone10(rawPhone);
    if (!phone) return res.status(400).json({ error: 'phone must contain at least 10 digits' });
    if (!db) {
      const users = fallbackData.users || [];
      let user = users.find(u => String(u.phone) === String(phone));
      if (!user) return res.json(null);
      // ensure user has a token
      if (!user.token) {
        user.token = crypto.randomBytes(24).toString('hex');
        // persist
        try { fs.writeFileSync(path.join(__dirname, 'app_data_fallback.json'), JSON.stringify(fallbackData, null, 2)); } catch(e){}
      }
      return res.json(user || null);
    }
    const snapshot = await db.collection('users').where('phone', '==', phone).limit(1).get();
    if (snapshot.empty) return res.json(null);
    const doc = snapshot.docs[0];
    const data = doc.data();
    // ensure token exists in firestore
    if (!data.token) {
      const token = crypto.randomBytes(24).toString('hex');
      try { await db.collection('users').doc(doc.id).update({ token }); data.token = token; } catch(e){}
    }
    res.json({ id: doc.id, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.phone) return res.status(400).json({ error: 'phone required' });
    const phone = normalizePhone10(payload.phone);
    if (!phone) return res.status(400).json({ error: 'phone must contain at least 10 digits' });
    payload.phone = phone;
  // default role to customer when not provided
  if (!payload.role) payload.role = 'customer';
    if (!db) {
      fallbackData.users = fallbackData.users || [];
      const existing = (fallbackData.users || []).find(u => String(u.phone) === String(payload.phone));
      if (existing) {
        // ensure token
        if (!existing.token) {
          existing.token = crypto.randomBytes(24).toString('hex');
          try { fs.writeFileSync(path.join(__dirname, 'app_data_fallback.json'), JSON.stringify(fallbackData, null, 2)); } catch(e){}
        }
        return res.json(existing);
      }
      payload.id = (fallbackData.users.reduce((m, u) => Math.max(m, u.id || 0), 1000) + 1);
  payload.token = crypto.randomBytes(24).toString('hex');
  if (!payload.role) payload.role = 'customer';
      fallbackData.users.push(payload);
      fs.writeFileSync(path.join(__dirname, 'app_data_fallback.json'), JSON.stringify(fallbackData, null, 2));
      return res.json(payload);
    }
    // store user in Firestore
    const usersRef = db.collection('users');
    const existing = await usersRef.where('phone', '==', payload.phone).limit(1).get();
    if (!existing.empty) {
      const doc = existing.docs[0];
      const data = doc.data();
      if (!data.token) {
        const token = crypto.randomBytes(24).toString('hex');
        try { await usersRef.doc(doc.id).update({ token }); data.token = token; } catch(e){}
      }
      return res.json({ id: doc.id, ...data });
    }
    // add token for new user
    payload.token = crypto.randomBytes(24).toString('hex');
  if (!payload.role) payload.role = 'customer';
    const docRef = await usersRef.add(payload);
    const created = (await docRef.get()).data();
    res.json({ id: docRef.id, ...created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Catch-all: serve SPA entry for any non-API path so legacy paths like /home.html work
app.get(/^\/(?!api\/).*/, (req, res, next) => {
  // Let static files pass through first; if request maps to a real file, don't override
  // We only send index1.html when no file extension or a missing file under non-API path
  try {
    // If it looks like an asset path with extension, skip to next (will 404 if truly missing)
    if (path.extname(req.path)) return next();
    return res.sendFile(path.join(__dirname, 'index1.html'));
  } catch (e) {
    return next();
  }
});

// Serve static frontend files (CSS, JS, images, etc.).
// Register this after API routes so requests to /api/* are handled by the API and not served from disk.
app.use(express.static(path.join(__dirname)));

// Admin helper: assign role to a user by phone (development helper)
app.post('/api/users/assignRole', async (req, res) => {
  try {
    const { phone, role, dealerId } = req.body || {};
    if (!phone || !role) return res.status(400).json({ error: 'phone and role required' });
    if (!db) {
      fallbackData.users = fallbackData.users || [];
      const existing = fallbackData.users.find(u => String(u.phone) === String(phone));
      if (!existing) return res.status(404).json({ error: 'user not found' });
      existing.role = role;
      if (dealerId !== undefined) existing.dealerId = dealerId;
      try { fs.writeFileSync(path.join(__dirname, 'app_data_fallback.json'), JSON.stringify(fallbackData, null, 2)); } catch(e){}
      return res.json(existing);
    }
    const usersRef = db.collection('users');
    const snap = await usersRef.where('phone', '==', phone).limit(1).get();
    if (snap.empty) return res.status(404).json({ error: 'user not found' });
    const doc = snap.docs[0];
    const updates = { role };
    if (dealerId !== undefined) updates.dealerId = dealerId;
    await usersRef.doc(doc.id).update(updates);
    const updated = (await usersRef.doc(doc.id).get()).data();
    res.json({ id: doc.id, ...updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin endpoint: run cleanup and dealer->user sync on-demand
app.post('/api/admin/cleanupSync', requireAdmin, async (req, res) => {
  try {
    if (db) {
      // run Firestore cleanup then ensure dealers have user accounts
      await cleanFirestoreCollections();
      await syncDealersToUsers();
      return res.json({ ok: true, message: 'Firestore cleanup and sync executed' });
    }
    // fallback branch: sync fallback users to dealers
    await syncDealersToUsers();
    return res.json({ ok: true, message: 'Fallback sync executed (no Firestore configured)' });
  } catch (e) {
    console.error('admin cleanupSync failed', e && e.message);
    res.status(500).json({ error: e && e.message });
  }
});

// API Endpoints
app.get('/api/scrapTypes', async (req, res) => {
  try {
    const data = await getCollectionData('scrapTypes');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dealers', async (req, res) => {
  try {
    let data = await getCollectionData('dealers');
    // Normalize dealer ids to numbers and phones to 10-digit strings for consistency
    data = (data || []).map(d => {
      try { if (d && d.id !== undefined) { const n = Number(d.id); if (!isNaN(n)) d.id = n; } } catch(e){}
      try { if (d && d.phone) d.phone = normalizePhone10(d.phone) || d.phone; } catch(e){}
      return d;
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// create dealer (admin only)
app.post('/api/dealers', requireAdmin, async (req, res) => {
  try {
    const d = req.body;
    if (!d || !d.name) return res.status(400).json({ error: 'missing dealer name' });
    d.phone = normalizePhone10(d.phone || '');
    d.createdAt = Date.now();
    if (db) {
      // Ensure phone is unique among dealers
      if (d.phone) {
        const dup = await db.collection('dealers').where('phone', '==', d.phone).limit(1).get();
        if (!dup.empty) return res.status(409).json({ error: 'dealer with this phone already exists' });
      }
      // assign numeric id via transactional counter so we have uniform numeric ids
      try {
        const nid = await getNextId('dealers');
        d.id = nid;
      } catch (e) { /* fall back to generated id below */ }
      const ref = await db.collection('dealers').add(d);
      // ensure d.id is present in stored doc (some older documents may not have it)
      try { await db.collection('dealers').doc(ref.id).set({ id: d.id }, { merge: true }); } catch(e){}
      // Ensure there is a user account for this dealer
      try {
        const usersRef = db.collection('users');
        const userSnap = await usersRef.where('phone', '==', d.phone).limit(1).get();
        const userPayload = { name: d.name, phone: d.phone, role: 'dealer', dealerId: d.id };
        if (!userSnap.empty) {
          // update existing user
          await usersRef.doc(userSnap.docs[0].id).set(userPayload, { merge: true });
        } else {
          userPayload.token = crypto.randomBytes(24).toString('hex');
          await usersRef.add(userPayload);
        }
      } catch (e) { console.warn('failed to create dealer user in firestore', e && e.message); }
      return res.json(d);
    } else {
      fallbackData.dealers = fallbackData.dealers || [];
      // Check for duplicate by normalized phone and reject with 409
      if (d.phone) {
        const existing = (fallbackData.dealers || []).find(x => normalizePhone10(x && x.phone) === d.phone);
        if (existing) return res.status(409).json({ error: 'dealer with this phone already exists', existing });
      }
      d.id = (fallbackData.dealers.reduce((m, x) => Math.max(m, Number(x.id || 0)), 0) + 1).toString();
  d.id = Number(d.id);
  d.id = Number(d.id);
  fallbackData.dealers.push(d);
      // ensure a corresponding user exists or is updated
      try {
        fallbackData.users = fallbackData.users || [];
        let existingUser = fallbackData.users.find(u => String(u.phone) === String(d.phone));
        if (existingUser) {
          existingUser.role = 'dealer';
          existingUser.dealerId = d.id;
          if (!existingUser.token) existingUser.token = crypto.randomBytes(24).toString('hex');
        } else {
          const newUserId = (fallbackData.users.reduce((m, u) => Math.max(m, Number(u.id || 0)), 9000) + 1);
          const userObj = { id: newUserId, name: d.name, phone: d.phone, role: 'dealer', dealerId: d.id, token: crypto.randomBytes(24).toString('hex') };
          fallbackData.users.push(userObj);
        }
      } catch (e) { console.warn('failed to create/update dealer user in fallback', e && e.message); }
      try { fs.writeFileSync(path.join(__dirname, 'app_data_fallback.json'), JSON.stringify(fallbackData, null, 2)); } catch(e){}
      return res.json(d);
    }
  } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

// update dealer (admin only)
app.put('/api/dealers/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const payload = req.body;
    if (payload.phone) payload.phone = normalizePhone10(payload.phone);
    if (db) {
      // If phone is being updated, ensure uniqueness among dealers (excluding this id)
      if (payload.phone) {
        const snap = await db.collection('dealers').where('phone', '==', payload.phone).limit(1).get();
        if (!snap.empty) {
          const doc = snap.docs[0];
          if (doc.id !== id) return res.status(409).json({ error: 'another dealer with this phone already exists' });
        }
      }
      await db.collection('dealers').doc(id).set(payload, { merge: true });
      const doc = await db.collection('dealers').doc(id).get();
      // if phone changed, update corresponding user
      try {
        if (payload.phone) {
          const usersRef = db.collection('users');
          const snap = await usersRef.where('dealerId', '==', id).limit(1).get();
          const userPayload = { phone: payload.phone };
          if (!snap.empty) {
            await usersRef.doc(snap.docs[0].id).set(userPayload, { merge: true });
          } else {
            // try to find by old phone if provided
            if (payload._oldPhone) {
              const oldSnap = await usersRef.where('phone', '==', payload._oldPhone).limit(1).get();
              if (!oldSnap.empty) await usersRef.doc(oldSnap.docs[0].id).set({ phone: payload.phone, dealerId: id, role: 'dealer' }, { merge: true });
            }
          }
        }
      } catch (e) { console.warn('failed to sync dealer user in firestore', e && e.message); }
      return res.json({ id: doc.id, ...doc.data() });
    } else {
      fallbackData.dealers = fallbackData.dealers || [];
      const idx = fallbackData.dealers.findIndex(x => String(x.id) === String(id));
      if (idx === -1) return res.status(404).json({ error: 'not found' });
      // If updating phone, verify no other dealer uses it
      if (payload.phone) {
        const dup = fallbackData.dealers.find(x => String(x.id) !== String(id) && normalizePhone10(x && x.phone) === payload.phone);
        if (dup) return res.status(409).json({ error: 'another dealer with this phone already exists', dup });
      }
      const old = fallbackData.dealers[idx];
      fallbackData.dealers[idx] = Object.assign({}, fallbackData.dealers[idx], payload);
      // sync user record if phone changed
      try {
        fallbackData.users = fallbackData.users || [];
        const userByDealer = fallbackData.users.find(u => String(u.dealerId) === String(id));
        if (userByDealer) {
          if (payload.phone) userByDealer.phone = payload.phone;
          if (payload.name) userByDealer.name = payload.name;
        } else if (payload.phone) {
          // try find user by old phone
          const found = fallbackData.users.find(u => String(u.phone) === String(old.phone));
          if (found) { found.phone = payload.phone; found.dealerId = id; found.role = 'dealer'; }
        }
      } catch (e) { console.warn('failed to sync dealer user in fallback', e && e.message); }
      try { fs.writeFileSync(path.join(__dirname, 'app_data_fallback.json'), JSON.stringify(fallbackData, null, 2)); } catch(e){}
      return res.json(fallbackData.dealers[idx]);
    }
  } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

// delete dealer (admin only)
app.delete('/api/dealers/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    if (db) {
      await db.collection('dealers').doc(id).delete();
      // clear or downgrade any user associated with this dealer
      try {
        const usersRef = db.collection('users');
        const snap = await usersRef.where('dealerId', '==', id).get();
        for (const doc of snap.docs) {
          await usersRef.doc(doc.id).set({ role: 'customer', dealerId: null }, { merge: true });
        }
      } catch (e) { console.warn('failed to update users during dealer delete', e && e.message); }
      return res.json({ ok: true });
    } else {
      fallbackData.dealers = fallbackData.dealers || [];
      const idx = fallbackData.dealers.findIndex(x => String(x.id) === String(id));
      if (idx === -1) return res.status(404).json({ error: 'not found' });
      fallbackData.dealers.splice(idx, 1);
      // clear or downgrade users linked to this dealer
      try {
        fallbackData.users = fallbackData.users || [];
        fallbackData.users.forEach(u => { if (String(u.dealerId) === String(id)) { u.dealerId = null; u.role = 'customer'; } });
      } catch (e) { console.warn('failed to update fallback users during dealer delete', e && e.message); }
      try { fs.writeFileSync(path.join(__dirname, 'app_data_fallback.json'), JSON.stringify(fallbackData, null, 2)); } catch(e){}
      return res.json({ ok: true });
    }
  } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

// scrap types CRUD
app.get('/api/scrapTypes', async (req, res) => {
  try {
    if (db) {
      const snap = await db.collection('scrapTypes').get();
      const items = [];
      snap.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
      return res.json(items);
    } else {
      return res.json(fallbackData.scrapTypes || []);
    }
  } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

app.post('/api/scrapTypes', requireAdmin, async (req, res) => {
  try {
    const p = req.body;
    if (!p || !p.name) return res.status(400).json({ error: 'missing name' });
    p.createdAt = Date.now();
    if (db) {
      // ensure numeric id using transactional counter when possible
      try {
        const nid = await getNextId('scrapTypes');
        if (nid) p.id = nid;
      } catch (e) { /* ignore and let Firestore generate doc id */ }
      const ref = await db.collection('scrapTypes').add(p);
      // persist numeric id into the document data when present
      try { if (p.id !== undefined) await db.collection('scrapTypes').doc(ref.id).set({ id: p.id }, { merge: true }); } catch (e) { /* ignore */ }
      const created = (await db.collection('scrapTypes').doc(ref.id).get()).data();
      const outId = (created && created.id !== undefined) ? created.id : ref.id;
      return res.json(Object.assign({ id: outId }, created));
    } else {
      fallbackData.scrapTypes = fallbackData.scrapTypes || [];
  p.id = (fallbackData.scrapTypes.reduce((m, x) => Math.max(m, Number(x.id || 0)), 0) + 1);
      fallbackData.scrapTypes.push(p);
      try { fs.writeFileSync(path.join(__dirname, 'app_data_fallback.json'), JSON.stringify(fallbackData, null, 2)); } catch(e){}
      return res.json(p);
    }
  } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

app.put('/api/scrapTypes/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const payload = req.body;
    if (db) {
      await db.collection('scrapTypes').doc(id).set(payload, { merge: true });
      const doc = await db.collection('scrapTypes').doc(id).get();
      return res.json({ id: doc.id, ...doc.data() });
    } else {
      fallbackData.scrapTypes = fallbackData.scrapTypes || [];
      const idx = fallbackData.scrapTypes.findIndex(x => String(x.id) === String(id));
      if (idx === -1) return res.status(404).json({ error: 'not found' });
      fallbackData.scrapTypes[idx] = Object.assign({}, fallbackData.scrapTypes[idx], payload);
      try { fs.writeFileSync(path.join(__dirname, 'app_data_fallback.json'), JSON.stringify(fallbackData, null, 2)); } catch(e){}
      return res.json(fallbackData.scrapTypes[idx]);
    }
  } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

app.delete('/api/scrapTypes/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    if (db) {
      await db.collection('scrapTypes').doc(id).delete();
      return res.json({ ok: true });
    } else {
      fallbackData.scrapTypes = fallbackData.scrapTypes || [];
      const idx = fallbackData.scrapTypes.findIndex(x => String(x.id) === String(id));
      if (idx === -1) return res.status(404).json({ error: 'not found' });
      fallbackData.scrapTypes.splice(idx, 1);
      try { fs.writeFileSync(path.join(__dirname, 'app_data_fallback.json'), JSON.stringify(fallbackData, null, 2)); } catch(e){}
      return res.json({ ok: true });
    }
  } catch (err) { console.error(err); res.status(500).json({ error: 'server error' }); }
});

app.get('/api/requests', async (req, res) => {
  try {
  const rawPhone = req.query.phone;
  const phone = rawPhone ? normalizePhone10(rawPhone) : null;
    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    let authToken = null;
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) authToken = authHeader.slice(7).trim();
    // If no firestore, use fallback and basic filtering by phone/role if provided
    if (!db) {
      let requests = (fallbackData.requests || []).slice();
      // If token provided, prefer token-based lookup for security
      let user = null;
      if (authToken) {
        user = (fallbackData.users || []).find(u => u.token === authToken);
      }
      // fallback to phone query if token not used
      if (!user && phone) {
        user = (fallbackData.users || []).find(u => String(u.phone) === String(phone));
      }
      // If a dealer user lacks dealerId, try to infer it from dealers by phone and persist.
      // When filtering requests for a dealer, accept requests whose dealerId is the numeric id
      // or which (due to legacy data) store the dealer phone as the dealerId value.
      try {
        if (user && user.role === 'dealer') {
          const dealers = fallbackData.dealers || [];
          const myPhone = normalizePhone10(user.phone) || String(user.phone || '');
          // prefer explicit dealerId mapping, otherwise try to find by phone
          if (user.dealerId === undefined || user.dealerId === null) {
            const found = dealers.find(d => normalizePhone10(d && d.phone) === myPhone || String(d && d.phone) === myPhone || String(d && d.id) === String(user.dealerId));
            if (found) {
              user.dealerId = found.id;
              // persist change so future requests don't recompute
              try { fs.writeFileSync(path.join(__dirname, 'app_data_fallback.json'), JSON.stringify(fallbackData, null, 2)); } catch(e) { /* ignore */ }
            }
          }

          // Filter requests: match by normalized numeric dealerId OR by legacy phone-in-dealerId
          requests = requests.filter(r => {
            try {
              // direct id match (most common)
              if (user.dealerId !== undefined && user.dealerId !== null && String(r.dealerId) === String(user.dealerId)) return true;
              // legacy case: request.dealerId stores a phone or non-numeric value — compare normalized phones
              const rPhone = normalizePhone10(r && r.dealerId) || normalizePhone10(r && r.dealerPhone) || null;
              if (rPhone && myPhone && rPhone === myPhone) return true;
              // also accept requests where dealerId is the dealer's phone stored as a string
              if (String(r.dealerId) === String(user.phone)) return true;
            } catch (e) { /* ignore per-request failures */ }
            return false;
          });
        } else if (user && user.role === 'customer') {
          requests = requests.filter(r => String(r.phone) === String(user.phone));
        }
      } catch (e) { /* ignore */ }
      // Normalize request ids to zero-padded strings and dealerId to numbers
      requests = (requests || []).map((r, idx) => {
        try { if (r && r.id !== undefined) { const nid = Number(r.id); r.id = (!isNaN(nid) ? nid : r.id); } } catch(e){}
        try { if (r && r.dealerId !== undefined && r.dealerId !== null) { const n = Number(r.dealerId); if (!isNaN(n)) r.dealerId = n; } } catch(e){}
        try { if (r && r.phone) r.phone = normalizePhone10(r.phone) || r.phone; } catch(e){}
        return r;
      });
      // Attach dealer name from fallback dealers when possible
      try {
        const dealers = fallbackData.dealers || [];
        const byId = Object.create(null);
        const byPhone = Object.create(null);
        for (const d of dealers) {
          if (!d) continue;
          const did = (d.id !== undefined && d.id !== null) ? Number(d.id) : d.id;
          if (!isNaN(Number(did))) byId[String(did)] = d.name || d.title || null;
          if (d.phone) byPhone[String(d.phone)] = d.name || null;
        }
        requests = requests.map(r => {
          try {
            const key = r.dealerId !== undefined && r.dealerId !== null ? String(r.dealerId) : null;
            r.dealerName = (key && byId[key]) ? byId[key] : (r.dealerId && byPhone[String(r.dealerId)]) ? byPhone[String(r.dealerId)] : null;
          } catch(e){}
          return r;
        });
      } catch (e) { /* ignore */ }
      return res.json(requests);
    }

    // With Firestore: allow optional phone query to filter results by user role
    // server-side: if Authorization Bearer <token> provided, resolve user by token and apply role filtering
    let resolvedUser = null;
    if (authToken) {
      const usersSnap = await db.collection('users').where('token', '==', authToken).limit(1).get();
      if (!usersSnap.empty) resolvedUser = { id: usersSnap.docs[0].id, ...usersSnap.docs[0].data() };
    }
    // fallback to phone query param if no token
    if (!resolvedUser && phone) {
      const usersSnap = await db.collection('users').where('phone', '==', phone).limit(1).get();
      if (!usersSnap.empty) resolvedUser = { id: usersSnap.docs[0].id, ...usersSnap.docs[0].data() };
    }
  if (resolvedUser) {
      if (resolvedUser.role === 'dealer') {
    // fetch and sort in-memory to avoid composite index requirement
    const qsnap = await db.collection('requests').where('dealerId', '==', resolvedUser.dealerId).get();
    let items = qsnap.docs.map(d => ({ id: d.id, ...d.data() }));
    items.sort((a,b) => (b.requestDate || '').localeCompare(a.requestDate || ''));
    // enrich with dealer name using dealers collection
    try {
      const dealerSnap = await db.collection('dealers').get();
      const dealers = {};
      dealerSnap.forEach(dd => { const dt = dd.data(); dealers[String(dt.id || dd.id)] = dt.name || dt.title || null; });
      items = items.map(r => { try { const key = r.dealerId !== undefined && r.dealerId !== null ? String(r.dealerId) : (r.dealerId || ''); r.dealerName = dealers[key] || null; } catch(e){} return r; });
    } catch(e){}
    return res.json(items);
      } else if (resolvedUser.role === 'customer') {
    const qsnap = await db.collection('requests').where('phone', '==', resolvedUser.phone).get();
    let items = qsnap.docs.map(d => ({ id: d.id, ...d.data() }));
    items.sort((a,b) => (b.requestDate || '').localeCompare(a.requestDate || ''));
    try {
      const dealerSnap = await db.collection('dealers').get();
      const dealers = {};
      dealerSnap.forEach(dd => { const dt = dd.data(); dealers[String(dt.id || dd.id)] = dt.name || dt.title || null; });
      items = items.map(r => { try { const key = r.dealerId !== undefined && r.dealerId !== null ? String(r.dealerId) : (r.dealerId || ''); r.dealerName = dealers[key] || null; } catch(e){} return r; });
    } catch(e){}
    return res.json(items);
      }
      // admin falls through
    }

    const snapshot = await db.collection('requests').orderBy('requestDate', 'desc').get();
    let data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    // normalize dealerId types and phone formats
    data = (data || []).map(r => {
      try { if (r && r.dealerId !== undefined && r.dealerId !== null) { const n = Number(r.dealerId); if (!isNaN(n)) r.dealerId = n; } } catch(e){}
      try { if (r && r.phone) r.phone = normalizePhone10(r.phone) || r.phone; } catch(e){}
      return r;
    });
    // enrich with dealer names
    try {
      const dealerSnap = await db.collection('dealers').get();
      const dealers = {};
      dealerSnap.forEach(dd => { const dt = dd.data(); dealers[String(dt.id || dd.id)] = dt.name || dt.title || null; });
      data = data.map(r => { try { const key = r.dealerId !== undefined && r.dealerId !== null ? String(r.dealerId) : (r.dealerId || ''); r.dealerName = dealers[key] || null; } catch(e){} return r; });
    } catch(e){}
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/requests', async (req, res) => {
  try {
    const payload = req.body;
    payload.requestDate = payload.requestDate || new Date().toISOString().split('T')[0];
    // Auth: require token for creating requests
    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    let authToken = null;
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) authToken = authHeader.slice(7).trim();
    let requestingUser = null;
    if (authToken) {
      if (!db) requestingUser = (fallbackData.users || []).find(u => u.token === authToken);
      else {
        const usersSnap = await db.collection('users').where('token', '==', authToken).limit(1).get();
        if (!usersSnap.empty) requestingUser = usersSnap.docs[0].data();
      }
    }
  if (!requestingUser) return res.status(401).json({ error: 'Unauthorized: valid token required' });
  // Only customers can create requests and phone must match
  if (requestingUser.role !== 'customer' && requestingUser.role !== 'admin') return res.status(403).json({ error: 'Forbidden: only customers can create requests' });
  // normalize payload phone
  const custPhone = normalizePhone10(payload.phone);
  if (!custPhone) return res.status(400).json({ error: 'Invalid customer phone; must be 10 digits' });
  if (requestingUser.role === 'customer' && String(custPhone) !== String(requestingUser.phone)) return res.status(403).json({ error: 'Forbidden: phone mismatch' });
  payload.phone = custPhone;
    // Handle images: if storage available, upload image dataURLs and replace with signed URLs
    if (admin && admin.storage && payload.images && Array.isArray(payload.images) && payload.images.length) {
      try {
        const bucket = admin.storage().bucket();
        const uploaded = [];
        for (const img of payload.images) {
          // expect { name, data } where data is a dataURL
          const matches = String(img.data || '').match(/^data:(.+);base64,(.+)$/);
          if (!matches) continue;
          const contentType = matches[1];
          const buffer = Buffer.from(matches[2], 'base64');
          const filename = `requests/${Date.now()}_${Math.random().toString(36).substring(2,8)}_${(img.name||'img').replace(/[^a-zA-Z0-9._-]/g,'')}`;
          const file = bucket.file(filename);
          await file.save(buffer, { resumable: false, contentType });
          // Generate a signed URL instead of making public
          let signedUrl = null;
          try {
            const expires = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days
            const [url] = await file.getSignedUrl({ action: 'read', expires });
            signedUrl = url;
          } catch (e) {
            // fallback to public URL if signed URL generation fails
            try { await file.makePublic(); } catch(e){}
            signedUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
          }
          uploaded.push({ name: img.name, url: signedUrl });
        }
        payload.images = uploaded;
      } catch (e) {
        console.warn('Image upload failed', e && e.message);
      }
    }

    if (!db) {
      // fallback: append to file (not recommended for production)
      fallbackData.requests = fallbackData.requests || [];
      // compute next sequential numeric id and zero-pad to 4 digits
      const maxSeq = fallbackData.requests.reduce((m, r) => {
        const v = parseInt(String(r.id).replace(/^0+/, ''), 10);
        return (!isNaN(v) && isFinite(v)) ? Math.max(m, v) : m;
      }, 0);
      const nextSeq = maxSeq + 1 || 1;
  payload.id = Number(nextSeq);
      // Ensure dealerId numeric if present
      if (payload.dealerId !== undefined && payload.dealerId !== null) {
        const dnum = Number(payload.dealerId);
        if (!isNaN(dnum)) payload.dealerId = dnum;
      }
      // ensure dealerId numeric
      if (payload.dealerId !== undefined && payload.dealerId !== null) {
        const dnum = Number(payload.dealerId);
        if (!isNaN(dnum)) payload.dealerId = dnum;
      }
      fallbackData.requests.unshift(payload);
      fs.writeFileSync(path.join(__dirname, 'app_data_fallback.json'), JSON.stringify(fallbackData, null, 2));
      return res.json(payload);
    }
    try {
      const nid = await getNextId('requests');
      if (nid) payload.id = nid;
    } catch (e) { /* ignore */ }
    const docRef = await db.collection('requests').add(payload);
    try { if (payload.id !== undefined) await db.collection('requests').doc(docRef.id).set({ id: payload.id }, { merge: true }); } catch(e){}
    const created = (await docRef.get()).data();
    // prefer numeric id field when present
    const outId = (created && created.id !== undefined) ? created.id : (Number(docRef.id) || docRef.id);
    res.json({ id: outId, ...created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/requests/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const updates = req.body;
    // Auth: require token to update requests
    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    let authToken = null;
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) authToken = authHeader.slice(7).trim();
    let requestingUser = null;
    if (authToken) {
      if (!db) requestingUser = (fallbackData.users || []).find(u => u.token === authToken);
      else {
        const usersSnap = await db.collection('users').where('token', '==', authToken).limit(1).get();
        if (!usersSnap.empty) requestingUser = usersSnap.docs[0].data();
      }
    }
    if (!requestingUser) return res.status(401).json({ error: 'Unauthorized: valid token required' });
    if (!db) {
      const idx = (fallbackData.requests || []).findIndex(r => String(r.id) === String(id));
      if (idx === -1) return res.status(404).json({ error: 'Not found' });
      const existing = fallbackData.requests[idx];
      // Only dealers assigned to the request or admin can update
      if (requestingUser.role === 'dealer' && String(existing.dealerId) !== String(requestingUser.dealerId)) {
        return res.status(403).json({ error: 'Forbidden: not assigned to this request' });
      }
      if (requestingUser.role === 'customer' && String(existing.phone) !== String(requestingUser.phone)) {
        return res.status(403).json({ error: 'Forbidden: customers can only update their own requests' });
      }
      // apply updates
      fallbackData.requests[idx] = Object.assign({}, existing, updates);
      // If dealerId was updated, ensure it's stored as numeric and sync the dealer's user record
      try {
        if (updates && updates.dealerId !== undefined && updates.dealerId !== null) {
          const did = Number(updates.dealerId);
          if (!isNaN(did)) {
            fallbackData.requests[idx].dealerId = did;
            // find dealer record
            const dealer = (fallbackData.dealers || []).find(d => Number(d.id) === Number(did) || String(d.id) === String(did));
            if (dealer) {
              // find user by dealer phone or dealerId and set dealerId
              fallbackData.users = fallbackData.users || [];
              let u = fallbackData.users.find(uu => String(uu.dealerId) === String(did) || normalizePhone10(uu.phone) === normalizePhone10(dealer.phone));
              if (u) {
                u.dealerId = did;
                u.role = u.role || 'dealer';
              } else {
                // try to find by phone and set
                const byPhone = normalizePhone10(dealer.phone);
                u = fallbackData.users.find(uu => normalizePhone10(uu.phone) === byPhone);
                if (u) { u.dealerId = did; u.role = u.role || 'dealer'; }
              }
            }
          }
        }
      } catch (e) { console.warn('failed to sync dealerId after request update', e && e.message); }

      fs.writeFileSync(path.join(__dirname, 'app_data_fallback.json'), JSON.stringify(fallbackData, null, 2));
      return res.json(fallbackData.requests[idx]);
    }
    // With Firestore: enforce permissions
    // Try direct doc id first; if not found, attempt to locate by numeric data.id field
    let docRef = db.collection('requests').doc(id);
    let docSnap = await docRef.get();
    // If direct doc lookup failed, try to find document whose stored `id` field matches the requested id
    if (!docSnap.exists) {
      const asNum = Number(id);
      if (!isNaN(asNum)) {
        const q = await db.collection('requests').where('id', '==', asNum).limit(1).get();
        if (!q.empty) {
          docRef = db.collection('requests').doc(q.docs[0].id);
          docSnap = q.docs[0];
        }
      }
    }
    if (!docSnap || !docSnap.exists) return res.status(404).json({ error: 'Not found' });
    const existing = docSnap.data();
    if (requestingUser.role === 'dealer' && String(existing.dealerId) !== String(requestingUser.dealerId)) {
      return res.status(403).json({ error: 'Forbidden: not assigned to this request' });
    }
    if (requestingUser.role === 'customer' && String(existing.phone) !== String(requestingUser.phone)) {
      return res.status(403).json({ error: 'Forbidden: customers can only update their own requests' });
    }
    await docRef.update(updates);
    const updated = (await docRef.get()).data();
    res.json({ id, ...updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server with port retry on EADDRINUSE
async function startServerWithRetry(startPort, maxRetries = 5) {
  let port = startPort;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const server = app.listen(port);
      // handle runtime errors (e.g., EADDRINUSE after listen call)
      server.on('error', (err) => {
        if (err && err.code === 'EADDRINUSE') {
          console.warn(`Port ${port} in use, attempting next port...`);
        } else {
          console.error('Server error:', err && err.message);
          process.exit(1);
        }
      });

      // wait for listening event
      await new Promise((resolve, reject) => {
        server.on('listening', resolve);
        server.on('error', reject);
      });

  console.log(`Server listening on http://localhost:${port}`);
  try {
    if (db) {
  await seedIfEmpty();
  try { await cleanFirestoreCollections(); } catch(e) { console.warn('Firestore cleanup failed', e && e.message); }
  try { await syncDealersToUsers(); } catch(e) { console.warn('syncDealersToUsers failed', e && e.message); }
    }
  } catch (e) { console.warn('Seeding failed', e && e.message); }
      return;
    } catch (e) {
      if (e && e.code === 'EADDRINUSE') {
        console.warn(`Port ${port} is already in use, trying next port`);
        port = port + 1;
        continue;
      }
      console.error('Failed to start server:', e && e.message);
      process.exit(1);
    }
  }
  console.error(`Failed to bind server after ${maxRetries + 1} attempts. Please free ports starting at ${startPort} and retry.`);
  process.exit(1);
}

const PORT = parseInt(process.env.PORT, 10) || 3000;
startServerWithRetry(PORT, 5);
