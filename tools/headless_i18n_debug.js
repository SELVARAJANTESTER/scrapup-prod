const puppeteer = require('puppeteer');
(async ()=>{
  const base = process.env.TEST_BASE || 'http://localhost:3001';
  const page = await (await puppeteer.launch({ args:['--no-sandbox','--disable-setuid-sandbox'] })).newPage();
  await page.goto(base + '/index1.html', { waitUntil: 'networkidle2' });
  const phrases = ['Logout','Welcome','Request Pickup','My Requests','Sign in','Phone number'];
  const langs = ['ta','hi'];
  const out = {};
  for (const lang of langs) {
    out[lang] = {};
    await page.select('#langSelect', lang).catch(()=>{});
    await page.evaluate(() => new Promise(r => setTimeout(r, 700)));
    for (const p of phrases) {
      const nodes = await page.evaluate((phrase) => {
        const matches = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, null, false);
        while(walker.nextNode()){
          const el = walker.currentNode;
          try {
            const text = el.innerText || '';
            if (text && text.indexOf(phrase) !== -1) {
              // skip if element or any ancestor has data-i18n attr
              let cur = el;
              let has = false;
              while(cur && cur !== document.body) { if (cur.getAttribute && cur.getAttribute('data-i18n')) { has = true; break;} cur = cur.parentElement; }
              if (!has) {
                matches.push({ tag: el.tagName, id: el.id || null, class: el.className || null, text: (text||'').trim().slice(0,120) });
              }
            }
          } catch(e){}
        }
        return matches;
      }, p);
      out[lang][p] = nodes;
    }
  }
  console.log('DEBUG_UNTRANSLATED', JSON.stringify(out, null, 2));
  await page.browser().close();
})();
