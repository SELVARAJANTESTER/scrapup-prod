const puppeteer = require('puppeteer');

(async () => {
  const base = process.env.TEST_BASE || 'http://localhost:3000';
  const browser = await puppeteer.launch({ headless: false, slowMo: 500 });
  const page = await browser.newPage();
  
  await page.goto(base, { waitUntil: 'networkidle2' });
  
  console.log('Testing language dropdown functionality...');
  
  // Test English (default)
  let appTitle = await page.$eval('h1.app-title span', el => el.textContent);
  console.log('English title:', appTitle);
  
  // Test Tamil
  await page.select('#langSelect', 'ta');
  await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for translation to apply
  appTitle = await page.$eval('h1.app-title span', el => el.textContent);
  console.log('Tamil title:', appTitle);
  
  // Test Hindi
  await page.select('#langSelect', 'hi');
  await new Promise(resolve => setTimeout(resolve, 1000));
  appTitle = await page.$eval('h1.app-title span', el => el.textContent);
  console.log('Hindi title:', appTitle);
  
  // Test back to English
  await page.select('#langSelect', 'en');
  await new Promise(resolve => setTimeout(resolve, 1000));
  appTitle = await page.$eval('h1.app-title span', el => el.textContent);
  console.log('Back to English title:', appTitle);
  
  console.log('Language dropdown test completed successfully!');
  
  // Keep browser open for 3 seconds so you can see the result
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  await browser.close();
})();
