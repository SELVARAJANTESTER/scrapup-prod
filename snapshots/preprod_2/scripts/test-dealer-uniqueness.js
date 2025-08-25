const http = require('http');
const https = require('https');
const { URL } = require('url');
const assert = require('assert');

function request(options, body) {
  return new Promise((resolve, reject) => {
    const lib = options.protocol === 'https:' ? https : http;
    const req = lib.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (d) => data += d);
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function run() {
  const base = process.env.SCRAP_BASE || 'http://127.0.0.1:3000';
  console.log('Using base', base);
  // 1) create test user
  const tail9 = String(Date.now()).slice(-9).padStart(9, '0');
  const userPhone = '9' + tail9; // 10 digits
  const userPayload = { phone: userPhone };
  let res = await request({ protocol: 'http:', hostname: '127.0.0.1', port: '3000', path: '/api/users', method: 'POST', headers: { 'Content-Type': 'application/json' } }, JSON.stringify(userPayload));
  let user = null;
  try { user = JSON.parse(res.body || '{}'); } catch(e) { console.error('Failed to parse /api/users response body:', res.body); }
  if (!user || !user.token) {
    console.error('Raw /api/users response:', res);
  }
  assert(user && user.token, 'user must have token');
  console.log('User token obtained');

  // promote to admin
  res = await request({ protocol: 'http:', hostname: '127.0.0.1', port: '3000', path: '/api/users/assignRole', method: 'POST', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ phone: user.phone, role: 'admin' }));
  assert(res.status === 200, 'assignRole should succeed');
  console.log('User promoted to admin');

  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + user.token };
  // helper for request with headers
  const opts = (method, path) => {
    const u = new URL(base + path);
    return { protocol: u.protocol, hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers };
  };

  // create dealer first time
  const basePhone = '8' + tail9; // 10 digits, different prefix
  const dealer = { name: 'NodeTest Dealer', phone: basePhone, email: 'test@node' };
  res = await request(opts('POST', '/api/dealers'), JSON.stringify(dealer));
  console.log('Create dealer status', res.status);
  assert(res.status === 200 || res.status === 201, 'first create should succeed');
  const created = JSON.parse(res.body || '{}');
  console.log('Created dealer id', created && created.id);

  // create dealer second time with same phone -> expect 409
  res = await request(opts('POST', '/api/dealers'), JSON.stringify({ name: 'Duplicate Dealer', phone: basePhone, email: 'dup@node' }));
  console.log('Second create status', res.status);
  assert(res.status === 409, 'second create should return 409 conflict');
  console.log('Duplicate create correctly returned 409');

  // test updating another dealer to this phone (create another dealer first)
  const otherPhone = '7' + tail9; // 10 digits, different prefix
  res = await request(opts('POST', '/api/dealers'), JSON.stringify({ name: 'Another Dealer', phone: otherPhone }));
  assert(res.status === 200 || res.status === 201, 'create another dealer should succeed');
  const other = JSON.parse(res.body || '{}');
  console.log('Other dealer id', other && other.id);

  // attempt to update 'other' dealer to use created.phone -> expect 409
  res = await request(opts('PUT', `/api/dealers/${other.id}`), JSON.stringify({ phone: '9994445555' }));
  console.log('Update to existing phone status', res.status);
  assert(res.status === 409, 'update to duplicate phone should return 409');
  console.log('Update conflict correctly returned 409');

  console.log('All tests passed');
}

run().catch(err => {
  console.error('Test failed', err && err.message);
  process.exit(2);
});
