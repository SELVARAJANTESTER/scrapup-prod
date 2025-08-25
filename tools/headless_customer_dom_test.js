const puppeteer = require('puppeteer');
(async ()=>{
  const base = process.env.TEST_BASE || 'http://localhost:3001';
  const browser = await puppeteer.launch({ args:['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  // prepare a seeded request with appliedRate values
  const seed = {
    id: 9999,
    customerName: 'DOM Test Customer',
    phone: '9999999999',
    address: 'Test Address',
    requestDate: new Date().toISOString(),
    preferredDate: new Date().toLocaleDateString(),
    preferredTime: 'morning',
    status: 'Pending',
    scrapTypes: [
      { type: 'Metal Scrap', quantity: 2, appliedRate: 50 },
      { type: 'E-Waste', quantity: 3, appliedRate: 30 }
    ]
  };

  // go to customer page
  await page.goto(base + '/customer_home.html', { waitUntil: 'networkidle2' });

  // seed localStorage and set current user to match phone
  await page.evaluate((s) => {
    try {
      localStorage.setItem('scrapRequests', JSON.stringify([s]));
      localStorage.setItem('customerAuth', JSON.stringify({ phone: s.phone, role: 'customer', standalone: true }));
    } catch(e){}
  }, seed);

  // reload so app reads seeded localStorage
  await page.reload({ waitUntil: 'networkidle2' });

  // wait for the customer requests list and card to render
  await page.waitForSelector('#customerRequestsList .request-card .scrap-list .scrap-item-display', { timeout: 3000 });

  // extract displayed rows
  const rows = await page.$$eval('#customerRequestsList .request-card .scrap-item-display', els => els.map(el => ({
    type: el.querySelector('.scrap-type') ? el.querySelector('.scrap-type').innerText.trim() : null,
    rate: el.querySelector('.scrap-rate') ? el.querySelector('.scrap-rate').innerText.trim() : null,
    qty: el.querySelector('.scrap-qty') ? el.querySelector('.scrap-qty').innerText.trim() : null,
    subtotal: el.querySelector('.scrap-subtotal') ? el.querySelector('.scrap-subtotal').innerText.trim() : null
  })));

  console.log('DOM rows:', rows);

  // assert expected values
  const expected = [
    { type: 'Metal Scrap', rate: '₹50/kg', qty: '2 kg', subtotal: '₹100' },
    { type: 'E-Waste', rate: '₹30/kg', qty: '3 kg', subtotal: '₹90' }
  ];

  let pass = true;
  if (rows.length !== expected.length) pass = false;
  for (let i=0;i<expected.length && i<rows.length;i++){
    const e = expected[i];
    const r = rows[i];
    if (!r || r.type !== e.type || r.rate !== e.rate || r.qty !== e.qty || r.subtotal !== e.subtotal) pass = false;
  }

  // check estimated total shown
  const estText = await page.$eval('#customerRequestsList .request-card .estimated-value h4', el => el ? el.innerText : '');
  console.log('Estimated shown:', estText);
  const expectedTotal = 'Estimated Value: ₹190';
  if (estText.indexOf('₹190') === -1) pass = false;

  console.log('DOM test pass:', pass);

  await browser.close();
  process.exit(pass ? 0 : 2);
})();
