const path = require('path');
const fs = require('fs');
(async function(){
  const cwd = __dirname;
  const fallbackPath = path.join(cwd, 'app_data_fallback.json');
  let fallback = {};
  try { fallback = require(fallbackPath); } catch(e){ console.error('No fallback file', e && e.message); }

  let admin;
  try { admin = require('firebase-admin'); } catch(e) { admin = null; }

  let svc = null;
  try { svc = require(path.join(cwd, 'firebase-service-account.json')); } catch(e){ svc = null; }

  if (!admin || !svc) {
    console.log('Firebase Admin or service account not available. Will only migrate fallback JSON.');
  } else {
    admin.initializeApp({ credential: admin.credential.cert(svc), storageBucket: (process.env.FIREBASE_STORAGE_BUCKET||svc.storageBucket|| (svc.project_id? svc.project_id+'.firebasestorage.app':undefined)) });
  }

  const bucket = (admin && admin.storage) ? admin.storage().bucket() : null;

  async function uploadImageObject(img) {
    if (!img || !img.data) return null;
    if (!bucket) return null;
    const matches = String(img.data).match(/^data:(.+);base64,(.+)$/);
    if (!matches) return null;
    const contentType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const filename = `requests/migrated_${Date.now()}_${Math.random().toString(36).substring(2,8)}_${(img.name||'img').replace(/[^a-zA-Z0-9._-]/g,'')}`;
    const file = bucket.file(filename);
    await file.save(buffer, { resumable: false, contentType });
    try {
      const expires = Date.now() + 1000 * 60 * 60 * 24 * 7;
      const [url] = await file.getSignedUrl({ action: 'read', expires });
      return { name: img.name, url };
    } catch (e) {
      try { await file.makePublic(); } catch(e){}
      return { name: img.name, url: `https://storage.googleapis.com/${bucket.name}/${filename}` };
    }
  }

  // Migrate fallbackData.requests
  if (fallback && Array.isArray(fallback.requests)) {
    let changed = false;
    for (let i=0;i<fallback.requests.length;i++){
      const req = fallback.requests[i];
      if (Array.isArray(req.images) && req.images.some(im => im && im.data)) {
        console.log('Migrating request id', req.id);
        const newImgs = [];
        for (const im of req.images) {
          if (im && im.data) {
            const up = await uploadImageObject(im);
            if (up) newImgs.push(up); else newImgs.push(im);
          } else if (typeof im === 'string') {
            newImgs.push({ name: 'img', url: im });
          } else {
            newImgs.push(im);
          }
        }
        req.images = newImgs;
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(fallbackPath, JSON.stringify(fallback, null, 2));
      console.log('Fallback JSON updated with migrated image URLs.');
    } else {
      console.log('No inline images found in fallback data.');
    }
  }

  // Migrate Firestore requests if available
  if (admin && admin.firestore) {
    const db = admin.firestore();
    const snapshot = await db.collection('requests').get();
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (Array.isArray(data.images) && data.images.some(im => im && im.data)) {
        console.log('Migrating Firestore request', doc.id);
        const newImgs = [];
        for (const im of data.images) {
          if (im && im.data) {
            const up = await uploadImageObject(im);
            if (up) newImgs.push(up); else newImgs.push(im);
          } else if (typeof im === 'string') {
            newImgs.push({ name: 'img', url: im });
          } else {
            newImgs.push(im);
          }
        }
        await db.collection('requests').doc(doc.id).update({ images: newImgs });
        console.log('Updated Firestore request', doc.id);
      }
    }
  }

  console.log('Migration complete.');
  process.exit(0);
})();
