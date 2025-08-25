const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function normalizePhone10(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

async function initFirebase() {
  let serviceAccount = null;
  const saPath = path.join(__dirname, '..', 'firebase-service-account.json');
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); console.log('Loaded service account from env FIREBASE_SERVICE_ACCOUNT'); } catch(e){}
  }
  if (!serviceAccount && fs.existsSync(saPath)) {
    try { serviceAccount = require(saPath); console.log('Loaded service account from', saPath); } catch(e){}
  }
  if (!serviceAccount) {
    console.error('No Firebase service account found. Aborting.');
    process.exit(2);
  }
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  return admin.firestore();
}

async function deleteCollection(db, coll) {
  const snapshot = await db.collection(coll).get();
  console.log(`Deleting ${snapshot.size} docs from ${coll}`);
  const batchSize = 500;
  if (snapshot.empty) return;
  const batches = [];
  let batch = db.batch();
  let op = 0;
  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
    op++;
    if (op >= batchSize) { batches.push(batch.commit()); batch = db.batch(); op = 0; }
  }
  if (op > 0) batches.push(batch.commit());
  await Promise.all(batches);
}

async function run() {
  const db = await initFirebase();
  console.log('Connected to Firestore');

  // Read fallback file to use as seed
  const fallbackPath = path.join(__dirname, '..', 'app_data_fallback.json');
  if (!fs.existsSync(fallbackPath)) { console.error('Fallback file not found:', fallbackPath); process.exit(2); }
  const fallback = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));

  // Collections we'll reset
  const collections = ['scrapTypes','dealers','requests','users'];
  for (const c of collections) {
    await deleteCollection(db, c);
  }

  // Normalize and create dealers with numeric ids starting at 1000
  const dealers = (fallback.dealers || []).slice();
  // build mapping phone->newId
  let nextDealerId = 1000;
  const phoneToNewId = {};
  const oldToNew = {};
  for (const d of dealers) {
    const p = normalizePhone10(d.phone) || null;
    // if phone duplicate, reuse same id
    if (p && phoneToNewId[p]) {
      oldToNew[String(d.id || d.phone || '')] = phoneToNewId[p];
      continue;
    }
    const newId = nextDealerId++;
    phoneToNewId[p] = newId;
    oldToNew[String(d.id || d.phone || '')] = newId;
    // write dealer doc with doc id = newId as string
    const docId = String(newId);
    const docData = Object.assign({}, d);
    docData.id = newId;
    if (docData.phone) docData.phone = normalizePhone10(docData.phone) || docData.phone;
    try { await db.collection('dealers').doc(docId).set(docData); } catch(e) { console.error('failed write dealer', e && e.message); }
  }

  console.log('Wrote dealers count', Object.keys(oldToNew).length, 'nextDealerId', nextDealerId);

  // Write scrapTypes
  const scrapTypes = fallback.scrapTypes || [];
  for (const s of scrapTypes) {
    const doc = Object.assign({}, s);
    try { await db.collection('scrapTypes').add(doc); } catch(e){ console.error('scrapTypes add failed', e && e.message); }
  }

  // Write users: ensure dealer users have dealerId numeric mapping, add token if missing
  const users = fallback.users || [];
  for (const u of users) {
    const cu = Object.assign({}, u);
    if (cu.phone) cu.phone = normalizePhone10(cu.phone) || cu.phone;
    // set dealerId if phone matches
    if ((!cu.dealerId || cu.dealerId === null) && cu.phone && phoneToNewId[cu.phone]) cu.dealerId = phoneToNewId[cu.phone];
    if (cu.dealerId && phoneToNewId[String(cu.dealerId)]) cu.dealerId = phoneToNewId[String(cu.dealerId)];
    // ensure token
    if (!cu.token) cu.token = crypto.randomBytes(24).toString('hex');
    try { await db.collection('users').add(cu); } catch(e) { console.error('user add failed', e && e.message); }
  }

  // Add a default admin user if not present
  try {
    const adminPhone = '9990000001';
    const adm = { name: 'System Admin', phone: adminPhone, role: 'admin', token: crypto.randomBytes(24).toString('hex') };
    await db.collection('users').add(adm);
    console.log('Added admin user', adminPhone);
  } catch(e){}

  // Write requests: map dealerId via oldToNew or phone mapping
  const requests = fallback.requests || [];
  for (const r of requests) {
    const cr = Object.assign({}, r);
    if (cr.phone) cr.phone = normalizePhone10(cr.phone) || cr.phone;
    // map dealerId
    let mapped = null;
    if (cr.dealerId !== undefined && cr.dealerId !== null) mapped = oldToNew[String(cr.dealerId)] || oldToNew[String(cr.dealerId)] || null;
    if (!mapped && cr.dealerPhone) mapped = phoneToNewId[normalizePhone10(cr.dealerPhone)];
    if (!mapped && cr.dealerId && typeof cr.dealerId === 'string') mapped = phoneToNewId[normalizePhone10(cr.dealerId)];
    if (mapped) cr.dealerId = mapped;
    // ensure requestDate
    if (!cr.requestDate) cr.requestDate = (new Date()).toISOString().split('T')[0];
    try { await db.collection('requests').add(cr); } catch(e) { console.error('request add failed', e && e.message); }
  }

  console.log('Repopulation complete.');
  process.exit(0);
}

run().catch(e => { console.error(e && (e.stack||e)); process.exit(2); });
