const http = require('http');
const payload = JSON.stringify({ customerName: 'Image Test', phone: '+1000000000', address: 'Test Addr', lat: 1.23, lng: 4.56, scrapTypes: [{type:'Metal Scrap', quantity:2}], preferredDate: '2025-08-30', preferredTime: 'morning', instructions: 'With image', images: [{ name: 'test.png', data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=' }] });
const opts = { hostname: 'localhost', port: 3000, path: '/api/requests', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } };
const req = http.request(opts, res => { let d=''; res.on('data', c=>d+=c); res.on('end', ()=>{ console.log('status', res.statusCode); console.log(d); process.exit(0); }); });
req.on('error', e=>{ console.error('ERR', e); process.exit(2); });
req.write(payload); req.end();
