const puppeteer = require('puppeteer');
const fs = require('fs');
(async () => {
  const base = process.env.TEST_BASE || 'http://localhost:3001';
  const outDir = 'tools/headless-screens';
  try { fs.mkdirSync(outDir, { recursive: true }); } catch(e){}
  const browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.setViewport({ width: 1200, height: 900 });

  const englishPhrases = [
    'Logout', 'Request #', 'Assigned to:', 'No pickup requests found', 'Welcome', 'Request Pickup', 'My Requests', 'Sign in', 'Phone number', 'Estimated Value', 'Continue as Customer', 'Continue as Dealer', 'Continue as Admin'
  ];

  const results = {};

  try {
    await page.goto(base + '/index1.html', { waitUntil: 'networkidle2', timeout: 15000 });
    // ensure app exists
    await page.evaluate(() => window.app && window.app);
    // login as admin programmatically
    const admin = await page.evaluate(async (baseUrl) => {
      try { const r = await fetch(baseUrl + '/api/users?phone=9990000001'); if (!r.ok) return null; return await r.json(); } catch(e) { return null; }
    }, base);
    if (admin && admin.token) {
      await page.evaluate((u) => { try { window.__setAuthUser && window.__setAuthUser(u); } catch(e){} }, admin);
    }

    const langs = ['en','ta','hi'];
    for (const lang of langs) {
      results[lang] = { screenshots: [], untranslated: [] };
      // set language via selector
  try { await page.select('#langSelect', lang); } catch(e){}
  // ensure i18n is applied (force) and give UI time to update
  await page.evaluate(() => { try { if (window.i18n && typeof window.i18n.applyToDOM === 'function') window.i18n.applyToDOM(); } catch(e){} });
  await page.evaluate(() => new Promise(r => setTimeout(r, 900)));
      const fname = `${outDir}/page_${lang}.png`;
      await page.screenshot({ path: fname, fullPage: true });
      results[lang].screenshots.push(fname);
      // get visible text
      const text = await page.evaluate(() => document.body.innerText);
      const found = englishPhrases.filter(p => (lang !== 'en') && (text.indexOf(p) !== -1));
      results[lang].untranslated = found;

      // deeper navigation: admin dashboard and dealers
      await page.evaluate(() => { try { window.app && window.app.setRole && window.app.setRole('admin'); } catch(e){} });
      await page.evaluate(() => new Promise(r => setTimeout(r, 700)));
      // open dealers section
      await page.evaluate(() => { try { const btn = document.querySelector('[data-admin-view="dealers"]'); if (btn) btn.click(); } catch(e){} });
      await page.evaluate(() => new Promise(r => setTimeout(r, 700)));
      const adminDealersShot = `${outDir}/admin_dealers_${lang}.png`;
      await page.screenshot({ path: adminDealersShot, fullPage: true });
      results[lang].screenshots.push(adminDealersShot);
      const adminText = await page.evaluate(() => document.body.innerText);
      const foundAdmin = englishPhrases.filter(p => (lang !== 'en') && (adminText.indexOf(p) !== -1));
      results[lang].untranslated = Array.from(new Set(results[lang].untranslated.concat(foundAdmin)));

      // customer view: set a customer user and switch
      const customer = await page.evaluate(async (baseUrl) => {
        try { const r = await fetch(baseUrl + '/api/users?phone=9884488331'); if (!r.ok) return null; return await r.json(); } catch(e) { return null; }
      }, base);
      if (customer) {
        await page.evaluate((u) => { try { window.__setAuthUser && window.__setAuthUser(u); } catch(e){} }, customer);
        // set role customer
        await page.evaluate(() => { try { window.app && window.app.setRole && window.app.setRole('customer'); } catch(e){} });
        await page.evaluate(() => new Promise(r => setTimeout(r, 700)));
        const custShot = `${outDir}/customer_${lang}.png`;
        await page.screenshot({ path: custShot, fullPage: true });
        results[lang].screenshots.push(custShot);
        const custText = await page.evaluate(() => document.body.innerText);
        const foundCust = englishPhrases.filter(p => (lang !== 'en') && (custText.indexOf(p) !== -1));
        results[lang].untranslated = Array.from(new Set(results[lang].untranslated.concat(foundCust)));
      }
    }
    console.log('INSPECT_RESULTS:', JSON.stringify(results, null, 2));
  } catch (e) {
    console.error('INSPECT_FAILED', e && e.message);
    process.exitCode = 2;
  } finally {
    await browser.close();
  }
})();
