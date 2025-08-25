const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

async function initAdmin() {
  // Prefer explicit service account in repo root
  const possible = [
    path.join(__dirname, '..', 'firebase-service-account.json'),
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  ].filter(Boolean);
  try {
    if (possible.length > 0 && fs.existsSync(possible[0])) {
      const svc = require(possible[0]);
      admin.initializeApp({ credential: admin.credential.cert(svc) });
      console.log('Firebase Admin initialized using', possible[0]);
      return admin.firestore();
    }
  } catch (e) { console.warn('service account init failed', e && e.message); }
  // try default
  try {
    admin.initializeApp();
    console.log('Firebase Admin initialized with default credentials');
    return admin.firestore();
  } catch (e) {
    console.error('Failed to initialize Firebase Admin. Provide firebase-service-account.json or set GOOGLE_APPLICATION_CREDENTIALS.');
    throw e;
  }
}

async function deleteCollection(db, name) {
  console.log(`Deleting collection ${name}...`);
  const batchSize = 500;
  const colRef = db.collection(name);
  let deleted = 0;
  while (true) {
    const snapshot = await colRef.limit(batchSize).get();
    if (snapshot.empty) break;
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    deleted += snapshot.docs.length;
    console.log(`  deleted ${deleted} so far from ${name}...`);
    // short pause
    await new Promise(r => setTimeout(r, 200));
  }
  console.log(`Deleted ${deleted} documents from ${name}`);
  return deleted;
}

async function seedCollections(db) {
  console.log('Seeding professional test data...');
  const scrapTypes = [
    { id: 1, name: 'Metal Scrap', pricePerKg: 45, category: 'Metal', description: 'Iron, steel, aluminium waste' },
    { id: 2, name: 'Plastic Bottles', pricePerKg: 12, category: 'Plastic', description: 'PET bottles and containers' },
    { id: 3, name: 'E-Waste', pricePerKg: 85, category: 'Electronics', description: 'Small electronic waste' }
  ];

  const dealers = [
    { id: 1001, name: 'EcoLoop Solutions', phone: '8248227986', email: 'contact@ecoloop.example', serviceAreas: ['Central','North'], rating: 4.7, specialties: ['Metal','Electronics'], active: true },
    { id: 1002, name: 'Green City Recycling', phone: '9876543210', email: 'hello@greencity.example', serviceAreas: ['South','Central'], rating: 4.5, specialties: ['Plastic','Metal'], active: true },
    { id: 1003, name: 'Urban Renew', phone: '9123456780', email: 'ops@urbanrenew.example', serviceAreas: ['East','West'], rating: 4.6, specialties: ['E-Waste','Metal'], active: true }
  ];

  const users = [
    { id: 9001, name: 'System Admin', phone: '9990000001', role: 'admin', token: randomToken() },
    { id: 9002, name: 'Kannan', phone: '8248227986', role: 'dealer', dealerId: 1001, token: randomToken() },
    { id: 9003, name: 'GreenCity User', phone: '9876543210', role: 'dealer', dealerId: 1002, token: randomToken() },
    { id: 9004, name: 'Selva Rajan', phone: '9884488331', role: 'customer', token: randomToken() }
  ];

  const requests = [
    { id: 2001, customerName: 'Selva Rajan', phone: '9884488331', email: '', address: 'Test Address, Chennai', lat: 12.9367, lng: 80.176, scrapTypes: [{ type: 'Aluminum', quantity: 12 }], preferredDate: new Date().toISOString().split('T')[0], preferredTime: 'morning', instructions: '', status: 'Assigned', requestDate: new Date().toISOString().split('T')[0], dealerId: 1001, dealerName: 'EcoLoop Solutions' },
    { id: 2002, customerName: 'Selva Rajan', phone: '9884488331', email: '', address: 'Test Address, Chennai', lat: 12.9367, lng: 80.176, scrapTypes: [{ type: 'Plastic Bottles', quantity: 30 }], preferredDate: new Date().toISOString().split('T')[0], preferredTime: 'afternoon', instructions: '', status: 'Pending', requestDate: new Date().toISOString().split('T')[0], dealerId: null },
    { id: 2003, customerName: 'Corporate Pickup', phone: '9000000000', email: '', address: 'Office Park', lat: 12.95, lng: 80.18, scrapTypes: [{ type: 'E-Waste', quantity: 5 }], preferredDate: new Date().toISOString().split('T')[0], preferredTime: 'evening', instructions: '', status: 'Assigned', requestDate: new Date().toISOString().split('T')[0], dealerId: 1003, dealerName: 'Urban Renew' }
  ];

  // seed
  const created = {};
  for (const s of scrapTypes) {
    await db.collection('scrapTypes').add(s);
  }
  created.scrapTypes = scrapTypes.length;

  for (const d of dealers) {
    await db.collection('dealers').add(d);
  }
  created.dealers = dealers.length;

  for (const u of users) {
    await db.collection('users').add(u);
  }
  created.users = users.length;

  for (const r of requests) {
    await db.collection('requests').add(r);
  }
  created.requests = requests.length;

  // set counters seq to current max ids
  try {
    const maxDealer = Math.max(...dealers.map(d=>d.id));
    await db.collection('counters').doc('dealers').set({ seq: maxDealer }, { merge: true });
    const maxReq = Math.max(...requests.map(r=>r.id));
    await db.collection('counters').doc('requests').set({ seq: maxReq }, { merge: true });
    const maxScrap = Math.max(...scrapTypes.map(s=>s.id));
    await db.collection('counters').doc('scrapTypes').set({ seq: maxScrap }, { merge: true });
  } catch (e) { console.warn('Failed to set counters', e && e.message); }

  console.log('Seeding complete', created);
  return created;
}

function randomToken() {
  return Buffer.from((Date.now() + Math.random()).toString()).toString('hex').slice(0,48);
}

async function main() {
  const force = process.env.FORCE_CLEAN === '1' || process.argv.indexOf('--yes') !== -1;
  if (!force) {
    console.error('This script will DELETE Firestore collections. To confirm, set env FORCE_CLEAN=1 or pass --yes');
    process.exit(2);
  }
  const db = await initAdmin();
  const toClean = ['scrapTypes','dealers','users','requests','counters'];
  for (const c of toClean) {
    try { await deleteCollection(db, c); } catch (e) { console.warn('Failed to delete collection', c, e && e.message); }
  }
  const res = await seedCollections(db);
  // report counts by querying
  const report = {};
  for (const c of ['scrapTypes','dealers','users','requests']) {
    const snap = await db.collection(c).get();
    report[c] = snap.size;
  }
  console.log('Final counts:', report);
  process.exit(0);
}

main().catch(err => { console.error('Script failed', err && (err.stack || err.message)); process.exit(1); });
