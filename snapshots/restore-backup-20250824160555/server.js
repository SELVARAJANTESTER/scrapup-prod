/*
  Simple Express server that uses Firebase Admin SDK (Firestore) as the backend
  API for the PickMyScrap app.

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
    // then default to the Firebase standard <project_id>.appspot.com (GCS bucket name)
    let rawBucket = process.env.FIREBASE_STORAGE_BUCKET || serviceAccount.storageBucket || (serviceAccount.project_id ? `${serviceAccount.project_id}.appspot.com` : undefined);
    // If someone mistakenly provides a firebasestorage.app host, rewrite it to the correct GCS bucket host
    if (rawBucket && /\.firebasestorage\.app$/i.test(String(rawBucket))) {
      console.warn(`Detected bucket value '${rawBucket}' ending with .firebasestorage.app; rewriting to '.appspot.com' which is the actual GCS bucket name.`);
      rawBucket = String(rawBucket).replace(/\.firebasestorage\.app$/i, '.appspot.com');
    }
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

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

// Helper to use fallback in-memory data if Firestore isn't configured
let fallbackData = {};
try { fallbackData = require('./app_data_fallback.json'); } catch(e) { fallbackData = {}; }

// Helper: allocate a sequential numeric id per collection in Firestore using a counters collection
async function nextSequence(collectionName, startAt = 1) {
  if (!db) return null;
  const counterRef = db.collection('counters').doc(collectionName);
  // run as transaction to safely increment
  const seq = await db.runTransaction(async (t) => {
    const snap = await t.get(counterRef);
    if (!snap.exists) {
      // initialize at startAt
      t.set(counterRef, { seq: startAt });
      return startAt;
    }
    const cur = snap.data() && Number(snap.data().seq) ? Number(snap.data().seq) : 0;
    const next = cur + 1;
    t.set(counterRef, { seq: next }, { merge: true });
    return next;
  });
  return seq;
}

// Simple SSE clients registry for /_events/requests
const sseClients = new Set();

function sendSseEvent(name, data) {
  const payload = `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of Array.from(sseClients)) {
    try {
      res.write(payload);
    } catch (e) {
      try { res.end(); } catch(e){}
      sseClients.delete(res);
    }
  }
}

async function getCollectionData(collectionName) {
  if (!db) return fallbackData[collectionName] || [];
  try {
    const snapshot = await db.collection(collectionName).orderBy('id').get();
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn(`Failed to read collection ${collectionName} from Firestore, falling back to local data:`, e && e.message);
    return fallbackData[collectionName] || [];
  }
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
        item.id = String(maxId);
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
      // Auto-assign role=dealer and dealerId if user has no role but phone matches a dealer
      try {
        if (!user.role) {
          const match = (fallbackData.dealers || []).find(d => String(normalizePhone10(d && d.phone)) === String(phone));
          if (match) {
            user.role = 'dealer';
            user.dealerId = String(match.id);
            try { fs.writeFileSync(path.join(__dirname, 'app_data_fallback.json'), JSON.stringify(fallbackData, null, 2)); } catch(e){}
          }
        }
      } catch (e) { /* ignore */ }
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
    // Auto-assign role=dealer and dealerId if empty but phone matches dealer
    try {
      if (!data.role) {
        const dSnap = await db.collection('dealers').where('phone', '==', phone).limit(1).get();
        if (!dSnap.empty) {
          const d = dSnap.docs[0];
          const dData = d.data();
          const dealerId = (dData && dData.id != null) ? String(dData.id) : d.id;
          await db.collection('users').doc(doc.id).set({ role: 'dealer', dealerId }, { merge: true });
          data.role = 'dealer';
          data.dealerId = dealerId;
        }
      }
    } catch (e) { /* ignore */ }
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
  // default role to customer when not provided, but upgrade to dealer if phone matches dealer
  if (!payload.role) payload.role = 'customer';
  try {
    // Fallback and Firestore branches will also check this after lookup, but do it early for new docs
    if (!payload.role || payload.role === 'customer') {
      const tryMatchDealer = async () => {
        if (db) {
          const dSnap = await db.collection('dealers').where('phone', '==', phone).limit(1).get();
          if (!dSnap.empty) {
            const d = dSnap.docs[0];
            const dData = d.data();
            payload.role = 'dealer';
            payload.dealerId = (dData && dData.id != null) ? String(dData.id) : d.id;
          }
        } else {
          const match = (fallbackData.dealers || []).find(d => String(normalizePhone10(d && d.phone)) === String(phone));
          if (match) { payload.role = 'dealer'; payload.dealerId = String(match.id); }
        }
      };
      await tryMatchDealer();
    }
  } catch(e) { /* ignore */ }
    if (!db) {
      fallbackData.users = fallbackData.users || [];
      const existing = (fallbackData.users || []).find(u => String(u.phone) === String(payload.phone));
      if (existing) {
        // ensure token
        if (!existing.token) {
          existing.token = crypto.randomBytes(24).toString('hex');
          try { fs.writeFileSync(path.join(__dirname, 'app_data_fallback.json'), JSON.stringify(fallbackData, null, 2)); } catch(e){}
        }
        // if role is empty, still upgrade to dealer if phone matches
        try {
          if (!existing.role) {
            const match = (fallbackData.dealers || []).find(d => String(normalizePhone10(d && d.phone)) === String(phone));
            if (match) { existing.role = 'dealer'; existing.dealerId = String(match.id); }
          }
        } catch(e){}
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
      // If no role yet, upgrade to dealer if phone matches dealers
      try {
        if (!data.role) {
          const dSnap = await db.collection('dealers').where('phone', '==', phone).limit(1).get();
          if (!dSnap.empty) {
            const d = dSnap.docs[0];
            const dData = d.data();
            const dealerId = (dData && dData.id != null) ? String(dData.id) : d.id;
            await usersRef.doc(doc.id).set({ role: 'dealer', dealerId }, { merge: true });
            data.role = 'dealer'; data.dealerId = dealerId;
          }
        }
      } catch(e){}
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

// Save user preferences (currently language) by phone
app.post('/api/users/preferences', async (req, res) => {
  try {
    const { phone, language } = req.body || {};
    const nphone = normalizePhone10(phone);
    if (!nphone) return res.status(400).json({ error: 'valid phone required' });
    if (!language) return res.status(400).json({ error: 'language required' });
    if (!db) {
      fallbackData.users = fallbackData.users || [];
      const user = fallbackData.users.find(u => String(u.phone) === String(nphone));
      if (!user) return res.status(404).json({ error: 'user not found' });
      user.language = language;
      try { fs.writeFileSync(path.join(__dirname, 'app_data_fallback.json'), JSON.stringify(fallbackData, null, 2)); } catch(e){}
      return res.json({ ok: true, user });
    }
    const usersRef = db.collection('users');
    const snap = await usersRef.where('phone', '==', nphone).limit(1).get();
    if (snap.empty) return res.status(404).json({ error: 'user not found' });
    const doc = snap.docs[0];
    await usersRef.doc(doc.id).set({ language }, { merge: true });
    const updated = (await usersRef.doc(doc.id).get()).data();
    res.json({ ok: true, id: doc.id, user: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    const data = await getCollectionData('dealers');
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
      // allocate a sequential numeric id for dealer (store as numeric 'seqId' and set doc id to string of seq)
      const seq = await nextSequence('dealers', 1);
      const docId = String(seq);
      d.id = docId;
      d.seq = seq;
      await db.collection('dealers').doc(docId).set(d);
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
      // allocate sequential numeric id for scrap type
      const seq = await nextSequence('scrapTypes', 1);
      const docId = String(seq);
      p.id = docId;
      p.seq = seq;
      await db.collection('scrapTypes').doc(docId).set(p);
      return res.json(p);
    } else {
      fallbackData.scrapTypes = fallbackData.scrapTypes || [];
      p.id = (fallbackData.scrapTypes.reduce((m, x) => Math.max(m, Number(x.id || 0)), 0) + 1).toString();
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
      let requests = fallbackData.requests || [];
      // If token provided, prefer token-based lookup for security
      let user = null;
      if (authToken) {
        user = (fallbackData.users || []).find(u => u.token === authToken);
      }
      // fallback to phone query if token not used
      if (!user && phone) {
        user = (fallbackData.users || []).find(u => String(u.phone) === String(phone));
      }
      if (user) {
        if (user.role === 'dealer') {
          requests = requests.filter(r => String(r.dealerId) === String(user.dealerId));
        } else if (user.role === 'customer') {
          requests = requests.filter(r => String(r.phone) === String(user.phone));
        }
      }
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
        // Determine the dealerId to filter by. Prefer the user's dealerId; if missing, try to resolve via dealers.phone.
        let dealerIdCandidate = resolvedUser.dealerId;
        try {
          if ((dealerIdCandidate === undefined || dealerIdCandidate === null || dealerIdCandidate === '') && resolvedUser.phone) {
            const nphone = normalizePhone10(resolvedUser.phone);
            if (nphone) {
              const dSnap = await db.collection('dealers').where('phone', '==', nphone).limit(1).get();
              if (!dSnap.empty) {
                const dData = dSnap.docs[0].data();
                dealerIdCandidate = dData && (dData.id != null ? dData.id : dSnap.docs[0].id);
              }
            }
          }
        } catch (e) { /* ignore lookup failures */ }
        // Query by both string and numeric representations to avoid type mismatches.
        const candidates = [];
        if (dealerIdCandidate !== undefined && dealerIdCandidate !== null && dealerIdCandidate !== '') {
          const asStr = String(dealerIdCandidate);
          const asNum = Number(asStr);
          // equality on same field requires separate queries; merge unique
          try {
            const snap1 = await db.collection('requests').where('dealerId', '==', asStr).get();
            candidates.push(...snap1.docs.map(d => ({ id: d.id, ...d.data() })));
          } catch (_) {}
          if (!isNaN(asNum)) {
            try {
              const snap2 = await db.collection('requests').where('dealerId', '==', asNum).get();
              candidates.push(...snap2.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (_) {}
          }
        }
        // de-duplicate by document id
        const seen = new Set();
        const items = candidates.filter(x => { if (seen.has(x.id)) return false; seen.add(x.id); return true; });
        items.sort((a,b) => (b.requestDate || '').localeCompare(a.requestDate || ''));
        return res.json(items);
      } else if (resolvedUser.role === 'customer') {
    const qsnap = await db.collection('requests').where('phone', '==', resolvedUser.phone).get();
    const items = qsnap.docs.map(d => ({ id: d.id, ...d.data() }));
    items.sort((a,b) => (b.requestDate || '').localeCompare(a.requestDate || ''));
    return res.json(items);
      }
      // admin falls through
    }

    const snapshot = await db.collection('requests').orderBy('requestDate', 'desc').get();
    const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
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

    // Normalize dealerId to string if provided to keep consistency
    if (payload.dealerId !== undefined && payload.dealerId !== null && payload.dealerId !== '') {
      try { payload.dealerId = String(payload.dealerId); } catch(_){}
    }
    if (!db) {
      // fallback: append to file (not recommended for production)
      fallbackData.requests = fallbackData.requests || [];
      // keep sequence starting at 1000 for customer request ids
      const next = (fallbackData.requests.reduce((m, r) => Math.max(m, Number(r.id || 0)), 999) + 1);
      payload.id = next;
      fallbackData.requests.unshift(payload);
      fs.writeFileSync(path.join(__dirname, 'app_data_fallback.json'), JSON.stringify(fallbackData, null, 2));
      return res.json(payload);
    }
    // allocate sequential numeric id for requests starting at 1000
    const seq = await nextSequence('requests', 1000);
    const docId = String(seq);
    payload.id = seq; // keep numeric id in document
    payload.seq = seq;
  await db.collection('requests').doc(docId).set(payload);
    const created = (await db.collection('requests').doc(docId).get()).data();
    res.json({ id: docId, ...created });
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
      if (idx === -1) return res.status(404).json({ error: 'Not found', advice: 'Client data may be stale; please refresh lists from server' });
      const existing = fallbackData.requests[idx];
      // Only dealers assigned to the request or admin can update
      if (requestingUser.role === 'dealer' && String(existing.dealerId) !== String(requestingUser.dealerId)) {
        return res.status(403).json({ error: 'Forbidden: not assigned to this request' });
      }
      if (requestingUser.role === 'customer' && String(existing.phone) !== String(requestingUser.phone)) {
        return res.status(403).json({ error: 'Forbidden: customers can only update their own requests' });
      }
      fallbackData.requests[idx] = Object.assign({}, existing, updates);
      fs.writeFileSync(path.join(__dirname, 'app_data_fallback.json'), JSON.stringify(fallbackData, null, 2));
  // Broadcast update to SSE clients
  try { sendSseEvent('request.updated', fallbackData.requests[idx]); } catch(e){}
      return res.json(fallbackData.requests[idx]);
    }
    // With Firestore: enforce permissions
  const docRef = db.collection('requests').doc(id);
  const docSnap = await docRef.get();
  if (!docSnap.exists) return res.status(404).json({ error: 'Not found', advice: 'Client data may be stale; please refresh lists from server' });
    const existing = docSnap.data();
    if (requestingUser.role === 'dealer' && String(existing.dealerId) !== String(requestingUser.dealerId)) {
      return res.status(403).json({ error: 'Forbidden: not assigned to this request' });
    }
    if (requestingUser.role === 'customer' && String(existing.phone) !== String(requestingUser.phone)) {
      return res.status(403).json({ error: 'Forbidden: customers can only update their own requests' });
    }
  // If images are included in updates and storage is available, upload them and replace entries with { name, url }
    if (admin && admin.storage && updates && Array.isArray(updates.images) && updates.images.length) {
      try {
        const bucket = admin.storage().bucket();
        const uploaded = [];
        for (const img of updates.images) {
          // expect { name, data } where data is a dataURL
          const matches = String(img.data || '').match(/^data:(.+);base64,(.+)$/);
          if (!matches) continue;
          const contentType = matches[1];
          const buffer = Buffer.from(matches[2], 'base64');
          const filename = `requests/${Date.now()}_${Math.random().toString(36).substring(2,8)}_${(img.name||'img').replace(/[^a-zA-Z0-9._-]/g,'')}`;
          const file = bucket.file(filename);
          await file.save(buffer, { resumable: false, contentType });
          let signedUrl = null;
          try {
            const expires = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days
            const [url] = await file.getSignedUrl({ action: 'read', expires });
            signedUrl = url;
          } catch (e) {
            try { await file.makePublic(); } catch(e){}
            signedUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;
          }
          uploaded.push({ name: img.name, url: signedUrl });
        }
        updates.images = uploaded;
      } catch (e) {
        console.warn('Image upload (PUT) failed', e && e.message);
      }
    }
    // Normalize dealerId to string if present
    if (updates && updates.dealerId !== undefined && updates.dealerId !== null && updates.dealerId !== '') {
      try { updates.dealerId = String(updates.dealerId); } catch(_){}
    }
    await docRef.update(updates);
    const updated = (await docRef.get()).data();
    // Broadcast update to SSE clients
    try { sendSseEvent('request.updated', Object.assign({ id }, updated)); } catch(e){}
    res.json({ id, ...updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// SSE endpoint for request updates
app.get('/_events/requests', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();
  // send a keep-alive comment
  res.write(': connected\n\n');
  sseClients.add(res);
  req.on('close', () => { sseClients.delete(res); });
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
  try { if (db) await seedIfEmpty(); } catch (e) { console.warn('Seeding failed', e && e.message); }
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
