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
  if (!fs.existsSync(serviceAccountPath)) {
    console.warn('Firebase service account not found at ./firebase-service-account.json.\nPlease copy your service account JSON to that path.');
  } else {
    const serviceAccount = require(serviceAccountPath);
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

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

// Helper to use fallback in-memory data if Firestore isn't configured
let fallbackData = {};
try { fallbackData = require('./app_data_fallback.json'); } catch(e) { fallbackData = {}; }

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
      const ref = await db.collection('dealers').add(d);
      d.id = ref.id;
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
      const ref = await db.collection('scrapTypes').add(p);
      p.id = ref.id;
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
    // fetch and sort in-memory to avoid composite index requirement
    const qsnap = await db.collection('requests').where('dealerId', '==', resolvedUser.dealerId).get();
    const items = qsnap.docs.map(d => ({ id: d.id, ...d.data() }));
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

    if (!db) {
      // fallback: append to file (not recommended for production)
      fallbackData.requests = fallbackData.requests || [];
      payload.id = (fallbackData.requests.reduce((m, r) => Math.max(m, r.id || 0), 1000) + 1);
      fallbackData.requests.unshift(payload);
      fs.writeFileSync(path.join(__dirname, 'app_data_fallback.json'), JSON.stringify(fallbackData, null, 2));
      return res.json(payload);
    }
    const docRef = await db.collection('requests').add(payload);
    const created = (await docRef.get()).data();
    res.json({ id: docRef.id, ...created });
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
      fallbackData.requests[idx] = Object.assign({}, existing, updates);
      fs.writeFileSync(path.join(__dirname, 'app_data_fallback.json'), JSON.stringify(fallbackData, null, 2));
      return res.json(fallbackData.requests[idx]);
    }
    // With Firestore: enforce permissions
    const docRef = db.collection('requests').doc(id);
    const docSnap = await docRef.get();
    if (!docSnap.exists) return res.status(404).json({ error: 'Not found' });
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
