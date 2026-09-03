// Empty-database gallery: what does a fresh install look like on every page?
const { chromium } = require('playwright');
const S = require('./fake-sb.js');
(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
  S.seed(); S.rows.main.data = { users: [{ email: 'a@a.com', username: 'a@a.com', displayName: 'אברהם כהן', role: 'superadmin', firstLogin: false }], donors: [], campaigns: [], fundraisers: [], groups: [], routes: [], expenses: [], settings: {} };
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } }); page.on('dialog', d => d.accept());
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.exposeFunction('__srv', req => JSON.stringify(S.serve(JSON.parse(req))));
  await page.addInitScript(S.FAKE_CLIENT);
  await page.goto((process.env.QA_URL || 'http://localhost:8123/index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof currentUser !== 'undefined' && currentUser && document.getElementById('appWrapper').style.display === 'flex', null, { timeout: 10000 });
  const texts = {};
  for (const pg of ['dash', 'donors', 'donations', 'future', 'campaign', 'fundraisers', 'groups', 'routes', 'expenses', 'messages']) {
    await page.evaluate(p => showPage(p), pg); await page.waitForTimeout(400);
    texts[pg] = await page.evaluate(p => { const el = document.getElementById('page' + p.charAt(0).toUpperCase() + p.slice(1)); return el.innerText.replace(/\s+/g, ' ').slice(0, 160); }, pg);
    await page.screenshot({ path: `e-${pg}.png` });
  }
  console.log(JSON.stringify(texts, null, 1)); console.log('errors:', errors.join(' | ') || 'none');
  await browser.close();
})();
