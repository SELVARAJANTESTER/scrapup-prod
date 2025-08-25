const fs = require('fs');
const path = require('path');

function normalizePhone10(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

const filePath = path.join(__dirname, '..', 'app_data_fallback.json');
let dataRaw;
try {
  dataRaw = fs.readFileSync(filePath, 'utf8');
} catch (e) {
  console.error('Failed to read', filePath, e && e.message);
  process.exit(2);
}
let data;
try { data = JSON.parse(dataRaw); } catch (e) { console.error('Invalid JSON in', filePath, e && e.message); process.exit(2); }

data.dealers = data.dealers || [];
data.requests = data.requests || [];
data.users = data.users || [];

console.log('Initial counts: dealers=', data.dealers.length, 'requests=', data.requests.length, 'users=', data.users.length);

// Build phone->dealer keep map, dedupe dealers by normalized phone (keep first)
const phoneToDealer = Object.create(null);
const idMap = Object.create(null); // oldId -> newId
const keepDealers = [];
for (const d of data.dealers) {
  const rawPhone = d && d.phone ? d.phone : null;
  const p = normalizePhone10(rawPhone) || null;
  // coerce id to Number if possible
  let idNum = d && d.id !== undefined && d.id !== null ? Number(d.id) : null;
  if (idNum !== null && !isNaN(idNum)) {
    d.id = idNum;
  } else {
    // assign temporary numeric id if missing
    d.id = Date.now() + Math.floor(Math.random()*1000);
  }
  if (p) {
    if (!phoneToDealer[p]) {
      phoneToDealer[p] = d.id;
      keepDealers.push(d);
    } else {
      // duplicate - map old id to existing
      idMap[String(d.id)] = phoneToDealer[p];
      // also record if d had a non-normal id or string
      // skip adding this dealer
    }
  } else {
    // keep dealers without phone as-is
    keepDealers.push(d);
  }
}

console.log('Deduplicated dealers count:', keepDealers.length, 'duplicates removed:', data.dealers.length - keepDealers.length);
// Replace dealers array with kept dealers
data.dealers = keepDealers;

// Build set of valid dealer ids after dedupe
const validDealerIds = new Set(data.dealers.map(d => String(d.id)));

// Helper to map value (could be id or phone) to numeric dealer id
function mapToDealerId(val) {
  if (val === undefined || val === null) return null;
  // numeric id
  if (typeof val === 'number' || /^[0-9]+$/.test(String(val))) {
    const candidate = String(Number(val));
    if (validDealerIds.has(candidate)) return Number(candidate);
    // numeric but not in valid set; maybe old id mapping
    if (idMap[candidate]) return idMap[candidate];
  }
  // attempt phone mapping
  const p = normalizePhone10(val);
  if (p && phoneToDealer[p]) return phoneToDealer[p];
  return null;
}

let requestsUpdated = 0;
for (const r of data.requests) {
  try {
    const old = r.dealerId;
    const mapped = mapToDealerId(r.dealerId || r.dealerPhone || r.dealer || null);
    if (mapped !== null) {
      if (String(r.dealerId) !== String(mapped)) {
        r.dealerId = mapped;
        requestsUpdated++;
      } else {
        // ensure numeric type
        r.dealerId = typeof r.dealerId === 'number' ? r.dealerId : Number(r.dealerId);
      }
    } else {
      // leave as-is but try to coerce numeric if possible
      const maybe = Number(r.dealerId);
      if (!isNaN(maybe)) r.dealerId = maybe;
    }
  } catch (e) { /* ignore per-request errors */ }
}

let usersUpdated = 0;
for (const u of data.users) {
  try {
    if (u.dealerId !== undefined && u.dealerId !== null) {
      const mapped = mapToDealerId(u.dealerId);
      if (mapped !== null && String(u.dealerId) !== String(mapped)) {
        u.dealerId = mapped;
        usersUpdated++;
      }
    } else if (u.phone) {
      const p = normalizePhone10(u.phone);
      if (p && phoneToDealer[p]) { u.dealerId = phoneToDealer[p]; usersUpdated++; }
    }
  } catch (e) {}
}

// Ensure all dealers have numeric ids and unique phones normalized stored
for (const d of data.dealers) {
  if (d.phone) d.phone = normalizePhone10(d.phone) || d.phone;
  if (d.id !== undefined) d.id = Number(d.id);
}

// Persist file
try {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  console.log('Wrote', filePath);
  console.log('Requests updated:', requestsUpdated, 'Users updated:', usersUpdated);
  console.log('Final dealers count:', data.dealers.length);
} catch (e) {
  console.error('Failed to write', filePath, e && e.message);
  process.exit(2);
}

process.exit(0);
