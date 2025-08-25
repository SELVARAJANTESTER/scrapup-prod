const puppeteer = require('puppeteer');
const fs = require('fs');
(async () => {
  const base = process.env.TEST_BASE || 'http://localhost:3001';
  const outDir = 'tools/headless-screens';
  try { fs.mkdirSync(outDir, { recursive: true }); } catch(e){}
  const browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  page.setViewport({ width: 1200, height: 900 });
  try {
    await page.goto(base + '/index1.html', { waitUntil: 'networkidle2', timeout: 15000 });
    // fetch admin user token via API inside page context and set auth user
    const admin = await page.evaluate(async (baseUrl) => {
      try {
        const r = await fetch(baseUrl + '/api/users?phone=9990000001');
        if (!r.ok) return null;
        return await r.json();
      } catch (e) { return null; }
    }, base);
    if (admin && admin.token) {
      await page.evaluate((u) => { try { window.__setAuthUser && window.__setAuthUser(u); } catch(e){} }, admin);
    }
    // portable wait helper
  const waitInPage = async (ms) => { await page.evaluate((m) => new Promise(r => setTimeout(r, m)), ms); };
  await waitInPage(800);
    // ensure initial language screenshot
    await page.screenshot({ path: `${outDir}/initial_en.png`, fullPage: true });
    // change language to Tamil via selector
    await page.select('#langSelect','ta');
  await waitInPage(800);
    await page.screenshot({ path: `${outDir}/ta.png`, fullPage: true });
    // change to Hindi
    await page.select('#langSelect','hi');
  await waitInPage(800);
    await page.screenshot({ path: `${outDir}/hi.png`, fullPage: true });
    console.log('Screenshots written to', outDir);
  } catch (e) {
    console.error('Headless test failed', e && e.message);
    process.exitCode = 2;
  } finally {
    await browser.close();
  }
})();
