const http = require('http');
const phone = '+1000000002';
const opts = { hostname: 'localhost', port: 3000, path: '/api/users?phone=' + encodeURIComponent(phone), method: 'GET' };
const req = http.request(opts, res => { let d=''; res.on('data', c=>d+=c); res.on('end', ()=>{ console.log('status', res.statusCode); console.log(d); process.exit(0); }); });
req.on('error', e=>{ console.error('ERR', e); process.exit(2); });
req.end();
