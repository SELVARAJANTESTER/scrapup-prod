const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

(async function() {
  try {
    const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
    if (!fs.existsSync(serviceAccountPath)) {
      console.error('firebase-service-account.json not found in project root. Aborting.');
      process.exit(1);
    }
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    const db = admin.firestore();
    console.log('Connected to Firestore for project:', serviceAccount.project_id);

    const fallbackPath = path.join(__dirname, 'app_data_fallback.json');
    if (!fs.existsSync(fallbackPath)) {
      console.error('app_data_fallback.json not found. Nothing to seed.');
      process.exit(1);
    }
    const fallback = require(fallbackPath);

    const collections = ['scrapTypes', 'dealers', 'requests'];
    for (const name of collections) {
      const colRef = db.collection(name);
      const snap = await colRef.limit(1).get();
      if (!snap.empty) {
        console.log(`Collection ${name} already has data, skipping.`);
        continue;
      }
      const items = fallback[name] || [];
      console.log(`Seeding ${items.length} documents into collection ${name}...`);
      for (const item of items) {
        const copy = Object.assign({}, item);
        await colRef.add(copy);
      }
      console.log(`Seeded collection ${name}.`);
    }

    console.log('Seeding complete.');
    process.exit(0);
  } catch (err) {
    console.error('Seeding failed:', err && err.message);
    process.exit(2);
  }
})();
