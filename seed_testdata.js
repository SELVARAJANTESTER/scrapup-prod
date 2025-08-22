const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const svcPath = path.join(__dirname, 'firebase-service-account.json');
if (!fs.existsSync(svcPath)) {
  console.error('firebase-service-account.json not found in project root. Aborting.');
  process.exit(1);
}
const serviceAccount = require(svcPath);

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function clearCollection(name) {
  const col = db.collection(name);
  const snapshot = await col.get();
  const batchSize = snapshot.size;
  if (batchSize === 0) return;
  const batch = db.batch();
  snapshot.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}

async function seed() {
  try {
    const dataPath = path.join(__dirname, 'app_data_fallback.json');
    if (!fs.existsSync(dataPath)) throw new Error('app_data_fallback.json not found');
    const raw = fs.readFileSync(dataPath, 'utf8');
    const data = JSON.parse(raw);

    // Collections to replace
    const collections = ['scrapTypes','dealers','requests','users'];
    for (const col of collections) {
      console.log('Clearing', col);
      // delete all docs
      const snap = await db.collection(col).get();
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      if (snap.size) await batch.commit();
    }

    // add items
    if (Array.isArray(data.scrapTypes)) {
      for (const item of data.scrapTypes) {
        await db.collection('scrapTypes').add(item);
      }
    }
    if (Array.isArray(data.dealers)) {
      for (const item of data.dealers) {
        await db.collection('dealers').add(item);
      }
    }
    if (Array.isArray(data.requests)) {
      for (const item of data.requests) {
        await db.collection('requests').add(item);
      }
    }
    if (Array.isArray(data.users)) {
      for (const item of data.users) {
        // ensure token exists
        if (!item.token) item.token = require('crypto').randomBytes(24).toString('hex');
        // normalize phone to last 10 digits
        if (item.phone) item.phone = String(item.phone).replace(/\D/g,'').slice(-10);
        await db.collection('users').add(item);
      }
    }

    console.log('Seeding complete');
    process.exit(0);
  } catch (e) {
    console.error('Seed failed', e);
    process.exit(2);
  }
}

seed();
