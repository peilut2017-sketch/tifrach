// Crash hunt: click every onclick handler on every page and inside every modal,
// on a rich fixture, and report uncaught exceptions grouped by handler.
const { chromium } = require('playwright');
const S = require('./fake-sb.js');
const { bigFixture } = require('./fixture.js');
(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
  S.seed(); S.rows.main.data = bigFixture(60);
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const errors = []; let current = 'boot';
  page.on('pageerror', e => errors.push({ where: current, msg: e.message.split('\n')[0] + ' @ ' + (e.stack || '').split('\n').slice(1, 3).map(l => l.trim().replace(/http:\/\/localhost:8123\/index.html/, '')).join(' < ') }));
  page.on('dialog', d => d.accept('x'));
  await page.exposeFunction('__srv', req => JSON.stringify(S.serve(JSON.parse(req))));
  await page.addInitScript(S.FAKE_CLIENT + `
    window.print = () => {}; window.open = () => ({ document: { write(){}, close(){}, open(){} }, focus(){}, print(){}, close(){} });
    window.__noop = () => {};`);
  await page.goto((process.env.QA_URL || 'http://localhost:8123/index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof currentUser !== 'undefined' && currentUser && document.getElementById('appWrapper').style.display === 'flex', null, { timeout: 8000 });
  const SKIP = /doLogout|signOut|reload|migrateLocalToCloud|clearAllData|resetDB|factoryReset|deleteAllDonors|wipe|^this\./i;
  const pages = ['dash', 'donors', 'donations', 'future', 'campaign', 'fundraisers', 'groups', 'routes', 'expenses', 'messages', 'admin'];
  let clicked = 0;
  for (const pg of pages) {
    current = 'page:' + pg;
    await page.evaluate(p => showPage(p), pg);
    await page.waitForTimeout(250);
    const handlers = await page.evaluate((pg) => {
      const root = document.getElementById('page' + pg.charAt(0).toUpperCase() + pg.slice(1)) || document.body;
      return [...root.querySelectorAll('[onclick]')].map(el => el.getAttribute('onclick')).filter((v, i, a) => a.indexOf(v) === i);
    }, pg);
    for (const h of handlers) {
      if (SKIP.test(h)) continue;
      current = pg + ' :: ' + h.slice(0, 90);
      await page.evaluate(async (h) => {
        try { (new Function('event', h)).call(document.body, new MouseEvent('click')); } catch (e) { window.__lastErr = e.message; throw e; }
        await new Promise(r => setTimeout(r, 30));
      }, h).catch(e => errors.push({ where: current, msg: String(e.message).split('\n').slice(0, 4).map(l => l.trim().replace(/http:\/\/localhost:8123\/index.html/g, '')).join(' | ') }));
      clicked++;
      // keep the DOM in a sane state: close menus/modals opened by the click
      await page.evaluate(() => { document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open')); document.querySelectorAll('.more-menu-list.open').forEach(m => m.classList.remove('open')); });
    }
  }
  // modals: open each and click its buttons
  const modals = await page.evaluate(() => [...document.querySelectorAll('.modal-overlay[id]')].map(m => m.id));
  for (const mid of modals) {
    current = 'modal:' + mid;
    await page.evaluate(id => { try { openModal(id); } catch (e) {} }, mid);
    await page.waitForTimeout(80);
    const handlers = await page.evaluate(id => { const r = document.getElementById(id); if (!r) return []; return [...r.querySelectorAll('[onclick]')].map(el => el.getAttribute('onclick')).filter((v, i, a) => a.indexOf(v) === i); }, mid);
    for (const h of handlers) {
      if (SKIP.test(h) || /closeModal\('/.test(h) && h.length < 40) continue;
      current = mid + ' :: ' + h.slice(0, 90);
      await page.evaluate(async (h) => { try { (new Function('event', h)).call(document.body, new MouseEvent('click')); } catch (e) { throw e; } await new Promise(r => setTimeout(r, 30)); }, h)
        .catch(e => errors.push({ where: current, msg: String(e.message).split('\n').slice(0, 4).map(l => l.trim().replace(/http:\/\/localhost:8123\/index.html/g, '')).join(' | ') }));
      clicked++;
      await page.evaluate(id => { document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open')); }, mid);
    }
  }
  await page.waitForTimeout(500);
  // group errors
  const byMsg = {};
  errors.forEach(e => { const k = e.msg; (byMsg[k] = byMsg[k] || []).push(e.where); });
  console.log('handlers clicked:', clicked, '| distinct errors:', Object.keys(byMsg).length);
  Object.entries(byMsg).forEach(([m, ws]) => { console.log('\n✗ ' + m); ws.slice(0, 4).forEach(w => console.log('    at ' + w)); if (ws.length > 4) console.log('    (+' + (ws.length - 4) + ' more)'); });
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
