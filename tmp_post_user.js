const http = require('http');
const payload = JSON.stringify({ phone: '+1000000002', name: 'Dealer One' });
const opts = { hostname: 'localhost', port: 3000, path: '/api/users', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } };
const req = http.request(opts, res => { let d=''; res.on('data', c=>d+=c); res.on('end', ()=>{ console.log('status', res.statusCode); console.log(d); process.exit(0); }); });
req.on('error', e=>{ console.error('ERR', e); process.exit(2); });
req.write(payload); req.end();
