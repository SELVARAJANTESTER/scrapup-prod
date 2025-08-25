const puppeteer = require('puppeteer');
(async ()=>{
  const base = process.env.TEST_BASE || 'http://localhost:3001';
  const browser = await puppeteer.launch({ args:['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.goto(base + '/index1.html', { waitUntil: 'networkidle2' });
  // set language to en
  await page.select('#langSelect','en').catch(()=>{});
  // simulate dealer role: set currentUser in window and role, then wait for dealer list to render
  await page.evaluate(()=>{
    window.app.currentUser = { phone: '9999999999', role: 'dealer' };
    window.app.currentRole = 'dealer';
    try { window.app.setRole('dealer'); } catch(e){}
  });
  await page.waitForSelector('#dealerRequestsList, #dealerRequestsList .request-card', { timeout: 3000 }).catch(()=>{});
  // ensure there is at least one request assigned to this dealer for the test
  await page.evaluate(()=>{
    try {
      const dealerId = (window.app && (window.app.currentDealerId || (window.app.dealers && window.app.dealers[0] && window.app.dealers[0].id))) || 1;
      if (window.app && window.app.requests && window.app.requests.length) {
        window.app.requests[0].dealerId = dealerId;
        window.app.requests[0].status = 'Assigned';
        try { window.app.saveData(); } catch(e){}
        try { window.app.renderDealerDashboard(dealerId); } catch(e){}
      }
    } catch(e){}
  });
  // ensure dealerRequestsList has content and click the first Edit
  const hasEdit = await page.$('[data-action="edit-request"]');
  if (!hasEdit) {
    console.log('No edit button found - abort');
    await browser.close();
    return;
  }
  // click via DOM to avoid Puppeteer "not clickable" issues
  await page.evaluate(() => {
    const el = document.querySelector('[data-action="edit-request"]');
    if (el) { try { el.scrollIntoView(); el.click(); } catch(e) { console.warn('dom click failed', e);} }
  });
  await page.waitForSelector('#requestEditModal', { visible: true, timeout: 2000 }).catch(()=>{});
  // change the customer name in modal
  await page.evaluate(()=>{ document.getElementById('modalRequestCustomerName').value = 'Edited Name'; });
  // set lat/lng and update map
  await page.evaluate(()=>{
    try {
      document.getElementById('modalRequestLat').value = '28.600000';
      document.getElementById('modalRequestLng').value = '77.200000';
    } catch(e){}
  });
  // click update map
  await page.evaluate(()=>{ const b = document.getElementById('modalRequestUpdateMap'); if (b) { try { b.scrollIntoView(); b.click(); } catch(e){} } });
  // wait briefly for map iframe or leaflet container
  await new Promise(res => setTimeout(res, 800));
  // upload a tiny generated image by creating a File in page context
  await page.evaluate(()=>{
    const toDataURL = (w,h)=>{
      const c = document.createElement('canvas'); c.width=w; c.height=h; const ctx=c.getContext('2d'); ctx.fillStyle='#ff0000'; ctx.fillRect(0,0,w,h); return c.toDataURL('image/png');
    };
    const data = toDataURL(20,20);
    const byteString = atob(data.split(',')[1]);
    const ab = new ArrayBuffer(byteString.length); const ia = new Uint8Array(ab);
    for (let i=0;i<byteString.length;i++) ia[i]=byteString.charCodeAt(i);
    const blob = new Blob([ab], { type: 'image/png' });
    const file = new File([blob], 'test.png', { type: 'image/png' });
    const input = document.getElementById('modalRequestImageUpload');
    const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
    // trigger change event
    const ev = new Event('change', { bubbles:true }); input.dispatchEvent(ev);
  });
  // add a scrap item row and set values
  await page.evaluate(()=>{
    try {
      const add = document.getElementById('modalAddScrapItem'); if (add) add.click();
      const container = document.getElementById('modalRequestScrapItemsContainer');
      const row = container.querySelector('.modal-scrap-row:last-child');
      if (row) {
        const select = row.querySelector('.modal-scrap-type');
        const qty = row.querySelector('.modal-scrap-qty');
        // pick first available scrap type
        if (select && select.options && select.options.length>1) select.value = select.options[1].value;
        if (qty) qty.value = '3';
      }
    } catch(e){}
  });
  // click save via DOM
  await page.evaluate(()=>{ const b = document.getElementById('modalRequestSave'); if (b) { try { b.scrollIntoView(); b.click(); } catch(e){} } });
  // wait a bit for UI to update
  await page.waitForFunction(()=>{ const el = document.querySelector('.request-card .request-details h4'); return el && el.innerText && el.innerText.length>0; }, { timeout: 3000 }).catch(()=>{});
  // read first request card customer name
  const cname = await page.evaluate(()=>{
    const el = document.querySelector('.request-card .request-details h4');
    return el ? el.innerText : null;
  });
  console.log('Customer name after edit:', cname);
  // verify app state for lat/lng, images and scrapTypes
  const check = await page.evaluate(()=>{
    try {
      const r = window.app.requests && window.app.requests.find(x=>x.customerName==='Edited Name');
      return {
        lat: r && r.lat,
        lng: r && r.lng,
        imagesCount: r && Array.isArray(r.images) ? r.images.length : 0,
        scrapTypes: r && r.scrapTypes ? r.scrapTypes : []
      };
    } catch(e){ return null; }
  });
  console.log('Post-edit check:', check);
  await browser.close();
})();
