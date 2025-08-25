const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

function normalizePhone10(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

async function initFirebase() {
  // try env var then local file
  let serviceAccount = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try { serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); console.log('Loaded service account from env FIREBASE_SERVICE_ACCOUNT'); } catch(e){}
  }
  const saPath = path.join(__dirname, '..', 'firebase-service-account.json');
  if (!serviceAccount && fs.existsSync(saPath)) {
    try { serviceAccount = require(saPath); console.log('Loaded service account from', saPath); } catch(e){}
  }
  if (!serviceAccount) {
    console.error('No Firebase service account found in FIREBASE_SERVICE_ACCOUNT env or', saPath);
    process.exit(2);
  }
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  return admin.firestore();
}

async function run() {
  const db = await initFirebase();
  console.log('Connected to Firestore');

  // Fetch dealers
  const dealersSnap = await db.collection('dealers').get();
  const phoneToDealer = {};
  const dealerDocById = {};
  dealersSnap.forEach(doc => {
    const data = doc.data();
    const phone = normalizePhone10(data && data.phone) || null;
    // determine target id: prefer numeric data.id, else numeric doc.id if numeric, else keep doc.id
    let targetId = null;
    if (data && data.id !== undefined && data.id !== null && !isNaN(Number(data.id))) targetId = Number(data.id);
    else if (!isNaN(Number(doc.id))) targetId = Number(doc.id);
    else targetId = doc.id; // string id
    if (phone) phoneToDealer[phone] = { id: targetId, docId: doc.id };
    dealerDocById[String(targetId)] = { docId: doc.id, data };
  });

  console.log('Dealers mapped by phone:', Object.keys(phoneToDealer).length);

  // Update users: set dealerId where phone matches or where dealerId maps
  let usersUpdated = 0;
  const usersSnap = await db.collection('users').get();
  for (const doc of usersSnap.docs) {
    const u = doc.data();
    let setObj = {};
    let changed = false;
    if ((u.dealerId === undefined || u.dealerId === null) && u.phone) {
      const p = normalizePhone10(u.phone);
      if (p && phoneToDealer[p]) {
        setObj.dealerId = phoneToDealer[p].id;
        setObj.role = setObj.role || u.role || 'dealer';
        changed = true;
      }
    } else if (u.dealerId !== undefined && u.dealerId !== null) {
      // map if dealerId is a phone string
      const maybe = String(u.dealerId);
      const p = normalizePhone10(maybe);
      if (p && phoneToDealer[p]) {
        setObj.dealerId = phoneToDealer[p].id; changed = true;
      }
    }
    if (changed) {
      await db.collection('users').doc(doc.id).set(setObj, { merge: true });
      usersUpdated++;
    }
  }

  // Update requests: set dealerId where mapping exists
  let requestsUpdated = 0;
  const requestsSnap = await db.collection('requests').get();
  for (const doc of requestsSnap.docs) {
    const r = doc.data();
    let setObj = {};
    let changed = false;
    if (r.dealerId !== undefined && r.dealerId !== null) {
      // if it's non-numeric, maybe a phone
      const maybe = String(r.dealerId);
      const p = normalizePhone10(maybe);
      if (p && phoneToDealer[p]) { setObj.dealerId = phoneToDealer[p].id; changed = true; }
    } else {
      // maybe there's a dealerPhone field or dealer object
      const candidatePhone = r.dealerPhone || r.dealer && r.dealer.phone || null;
      const p = normalizePhone10(candidatePhone);
      if (p && phoneToDealer[p]) { setObj.dealerId = phoneToDealer[p].id; changed = true; }
    }
    if (changed) {
      await db.collection('requests').doc(doc.id).set(setObj, { merge: true });
      requestsUpdated++;
    }
  }

  console.log('Users updated:', usersUpdated, 'Requests updated:', requestsUpdated);
  console.log('Migration completed.');
  process.exit(0);
}

run().catch(e => { console.error(e && e.stack || e); process.exit(2); });
