const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE_CONSOLE [' + msg.type() + ']', msg.text()));
  page.on('requestfailed', req => console.log('REQUEST_FAILED', req.url(), req.failure() && req.failure().errorText));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function qs(sel) { return page.$(sel); }
  async function click(sel) { await page.evaluate(s => { const el = document.querySelector(s); if (el) { el.scrollIntoView(); el.click(); } }, sel); }
  async function type(sel, val) { await page.evaluate((s,v)=>{ const el=document.querySelector(s); if (el) { el.focus(); el.value=v; el.dispatchEvent(new Event('input', { bubbles: true })); } }, sel, val); }
  async function selectValue(sel, value) { await page.evaluate((s,v)=>{ const el=document.querySelector(s); if (el) { el.value=v; el.dispatchEvent(new Event('change', { bubbles: true })); } }, sel, value); }

  try {
  await page.goto('http://localhost:3000/home.html', { waitUntil: 'networkidle2', timeout: 30000 });

  // Login via modal as admin (seeded phone)
  await page.evaluate(() => window.app && window.app.showLoginModal && window.app.showLoginModal('admin'));
  await page.waitForSelector('#loginModal', { timeout: 8000 });
  await type('#modalLoginPhone', '9990000001');
  await selectValue('#modalLoginRole', 'admin');
  await click('#modalLoginSubmit');
  await page.waitForSelector('#adminDashboard', { timeout: 10000 });

    // Go to Dealers management and create a dealer
    await click('[data-admin-view="dealers"]');
  await sleep(300);
    await click('[data-admin-action="showAddDealer"]');
  await sleep(200);
    await type('#dealerName', 'Test Dealer QA');
    await type('#dealerPhone', '9876599999');
    await type('#dealerEmail', 'qa@example.com');
    await click('[data-admin-action="saveDealer"]');
  await sleep(800);
    // Ensure we have a dealer to use: prefer the newly created one, else pick first active
    await page.evaluate(async () => {
      try { if (window.app && window.app.loadDealers) await window.app.loadDealers(); } catch(e){}
      const list = (window.app && window.app.dealers) || [];
      let chosen = list.find(d => /Test Dealer QA/i.test(d.name));
      if (!chosen) chosen = list.find(d => d && d.active);
      if (!chosen && list.length) chosen = list[0];
      if (!chosen) return;
      window.__TEST_SELECTED_DEALER = { id: String(chosen.id), name: chosen.name, phone: chosen.phone };
      // Ensure a user exists and has dealer role for this dealer phone
      function norm10(p){ return (p||'').replace(/\D/g,'').slice(-10); }
      const ph = norm10(chosen.phone);
      if (!ph) return;
      try {
        const ures = await fetch(`/api/users?phone=${encodeURIComponent(ph)}`);
        let user = null;
        if (ures.ok) user = await ures.json();
        if (!user) {
          await fetch('/api/users', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ phone: ph, role: 'dealer', dealerId: chosen.id }) });
        } else if ((user.role||'').toLowerCase() !== 'dealer') {
          await fetch('/api/users/assignRole', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ phone: ph, role: 'dealer', dealerId: chosen.id }) });
        }
      } catch(e) { /* ignore */ }
    });

  // Login as a new customer and create a request
  await page.evaluate(() => window.app && window.app.showLoginModal && window.app.showLoginModal('customer'));
  await page.waitForSelector('#loginModal', { timeout: 8000 });
  // generate a stable test customer phone and store globally
  const customerPhone = '9884412345';
  await page.evaluate((ph) => { window.__TEST_CUSTOMER_PHONE = ph; }, customerPhone);
  await type('#modalLoginPhone', customerPhone);
  await selectValue('#modalLoginRole', 'customer');
  await click('#modalLoginSubmit');
  await page.waitForSelector('#customerHome', { timeout: 8000 });
    await click('[data-action="requestPickup"]');
    await page.waitForSelector('#pickupForm', { timeout: 8000 });
    await type('input[name="customerName"]', 'QA Customer');
    await type('input[name="phone"]', '9884433333');
    await type('textarea[name="address"]', 'QA Address');
    await click('#getLocation');
  await sleep(1000);
    await page.select('select[name="scrapType"]', 'Electronics');
    await page.evaluate(() => { const q = document.querySelector('input[name="quantity"]'); if (q) q.value = '2'; });
    await click('.pickup-form .btn.btn--primary');
  await sleep(1200);

  // Back to admin to assign the request to our new dealer
  await page.evaluate(() => window.app && window.app.setRole && window.app.setRole('admin'));
    await page.waitForSelector('#adminRequests', { timeout: 8000 });
    // Find the QA Customer request card that has an assign select and set it to our new dealer
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('#adminRequestsList .request-card'));
      const target = cards.find(c => /QA Customer/i.test(c.textContent) && c.querySelector('select[id^="dealer-"]'))
        || cards.find(c => c.querySelector('select[id^="dealer-"]'));
      if (!target) return;
      const sel = target.querySelector('select[id^="dealer-"]');
      if (sel) {
        const picked = (window.__TEST_SELECTED_DEALER && window.__TEST_SELECTED_DEALER.id) || null;
        if (picked) sel.value = String(picked);
        else {
          const opt = Array.from(sel.options).find(o => /Test Dealer QA/i.test(o.text));
          if (opt) sel.value = opt.value;
        }
      }
    });
  await sleep(200);
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('#adminRequestsList .request-card'));
      const target = cards.find(c => /QA Customer/i.test(c.textContent) && c.querySelector('select[id^="dealer-"]'))
        || cards.find(c => c.querySelector('select[id^="dealer-"]'));
      if (!target) return;
      const btn = target.querySelector('button[data-action="assign"]');
      if (btn) btn.click();
    });
  // allow time for server update and admin view refresh
  await sleep(1500);

  // Login as the created dealer via modal and verify request visible, then accept and complete
  await page.evaluate(() => window.app && window.app.showLoginModal && window.app.showLoginModal('dealer'));
  await page.waitForSelector('#loginModal', { timeout: 8000 });
  // Use the selected dealer's phone for login
  const dealerPhone = await page.evaluate(() => {
    const ph = (window.__TEST_SELECTED_DEALER && window.__TEST_SELECTED_DEALER.phone) || '';
    return (ph||'').replace(/\D/g,'').slice(-10) || '9876500011'; // fallback to seeded dealer
  });
  await type('#modalLoginPhone', dealerPhone);
  await selectValue('#modalLoginRole', 'dealer');
  await click('#modalLoginSubmit');
  await page.waitForSelector('#dealerRequestsList', { timeout: 12000 });
  // wait until at least one request-card appears for dealer, up to 12s
  await page.waitForFunction(() => !!document.querySelector('#dealerRequestsList .request-card'), { timeout: 12000 }).catch(() => {});
  // debug: count cards and dump first card header
  const hasReq = await page.evaluate(() => {
    const list = document.querySelectorAll('#dealerRequestsList .request-card');
    console.log('DEBUG_DEALER_CARD_COUNT', list.length);
    if (list.length) {
      const t = list[0].innerText.slice(0,160);
      console.log('DEBUG_DEALER_FIRST_CARD', t);
    }
    // click Accept & Start if visible
    const btn = document.querySelector('#dealerRequestsList .request-card button[data-action="accept"]');
    if (btn) btn.click();
    return list.length > 0;
  });
  console.log('DEALER_SEES_REQUEST', hasReq);
  await sleep(500);
  // Open edit on the first card (if available), then save to test PUT flow quickly
  await page.evaluate(() => {
    const editBtn = document.querySelector('#dealerRequestsList .request-card button[data-action="edit"]');
    if (editBtn) editBtn.click();
  });
  await page.waitForSelector('#requestEditModal', { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => {
    const p = document.getElementById('editRequestPrice'); if (p) p.value = '500';
    const s = document.getElementById('editRequestSave'); if (s) s.click();
  });
  await sleep(800);
  // Now click Complete
  await page.evaluate(() => {
    const c = Array.from(document.querySelectorAll('#dealerRequestsList .request-card button[data-action="complete"]'))[0];
    if (c) c.click();
  });
  await sleep(800);

  // Re-login as the customer to verify status and navigate to My Requests
  await page.evaluate(() => window.app && window.app.showLoginModal && window.app.showLoginModal('customer'));
  await page.waitForSelector('#loginModal', { timeout: 8000 }).catch(() => {});
  const rCustomerPhone = await page.evaluate(() => window.__TEST_CUSTOMER_PHONE || '9884412345');
  await type('#modalLoginPhone', rCustomerPhone);
  await selectValue('#modalLoginRole', 'customer');
  await click('#modalLoginSubmit');
  await page.waitForSelector('#customerHome', { timeout: 8000 }).catch(() => {});
  await click('[data-action="viewRequests"]');
  await page.waitForSelector('#customerRequestsList', { timeout: 10000 }).catch(() => {});
  const customerHasCompleted = await page.evaluate(() => {
    const text = (document.querySelector('#customerRequestsList') || {}).innerText || '';
    console.log('DEBUG_CUSTOMER_REQUESTS_SNIPPET', text.slice(0,200));
    return /Completed/i.test(text);
  });
  console.log('CUSTOMER_SEES_COMPLETED', customerHasCompleted);

    await browser.close();
  process.exit(hasReq && customerHasCompleted ? 0 : 1);
  } catch (e) {
    console.error('ASSIGN_FLOW_TEST_ERROR', e && (e.stack || e.message));
    try { await browser.close(); } catch(_){ }
    process.exit(2);
  }
})();
