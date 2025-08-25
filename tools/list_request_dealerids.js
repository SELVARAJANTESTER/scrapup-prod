const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app_data_fallback.json'), 'utf8'));
const reqs = data.requests || [];
const set = new Set();
for (const r of reqs) { if (r.dealerId !== undefined && r.dealerId !== null) set.add(String(r.dealerId)); }
console.log('dealerIds used in requests:', Array.from(set).sort());
// list dealers present
const dealers = data.dealers || [];
console.log('dealer ids present:', dealers.map(d => String(d.id)).sort());
// show which used dealerIds are missing
const present = new Set(dealers.map(d => String(d.id)));
const missing = Array.from(set).filter(x => !present.has(x));
console.log('missing dealerIds:', missing);
