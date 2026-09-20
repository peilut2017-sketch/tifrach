// Deep links / history + IndexedDB cache fallback when localStorage is over quota.
const { chromium } = require('playwright');
const S = require('./fake-sb.js'); const { bigFixture } = require('./fixture.js');
(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
  const T = []; const ok = (n, c, x) => T.push((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' | ' + JSON.stringify(x)));
  S.seed(); S.rows.main.data = bigFixture(30);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  await page.exposeFunction('__srv', req => JSON.stringify(S.serve(JSON.parse(req))));
  await page.addInitScript(S.FAKE_CLIENT);
  const boot = async (url) => { await page.goto(url, { waitUntil: 'domcontentloaded' }); await page.waitForFunction(() => typeof currentUser !== 'undefined' && currentUser && document.getElementById('appWrapper').style.display === 'flex', null, { timeout: 10000 }); await page.waitForTimeout(300); };
  // 1. deep link to a page + donor
  await boot((process.env.QA_URL || 'http://localhost:8123/index.html') + '#donors');
  ok('deep link #donors opens donors page', await page.evaluate(() => window._currentPage === 'donors' && document.getElementById('pageDonors').classList.contains('active')), await page.evaluate(() => window._currentPage));
  await page.goto('about:blank'); await boot((process.env.QA_URL || 'http://localhost:8123/index.html') + '#donors&donor=D3');
  ok('deep link #donor=D3 opens the card', await page.evaluate(() => document.getElementById('donorModal').classList.contains('open') && currentDonorId === 'D3'), '');
  await page.evaluate(() => closeModal('donorModal'));
  // 2. navigation writes the hash; back/forward restore pages
  await page.evaluate(() => { showPage('donations'); showPage('admin'); });
  ok('hash mirrors page', await page.evaluate(() => location.hash === '#admin'), await page.evaluate(() => location.hash));
  await page.goBack(); await page.waitForTimeout(200);
  ok('back → previous page', await page.evaluate(() => window._currentPage === 'donations' && location.hash === '#donations'), await page.evaluate(() => [window._currentPage, location.hash]));
  await page.goForward(); await page.waitForTimeout(200);
  ok('forward → admin again', await page.evaluate(() => window._currentPage === 'admin'), '');
  // 3. viewer cannot deep-link into admin
  await page.evaluate(() => { currentUser.role = 'viewer'; showPage('admin'); });
  ok('viewer deep link to admin falls back to dash', await page.evaluate(() => window._currentPage === 'dash'), '');
  await page.evaluate(() => { currentUser.role = 'superadmin'; });
  // 4. Escape closes a small modal, not the donor card; focus returns to opener
  await page.evaluate(() => { document.getElementById('navDonors')?.focus(); openQuickDonationModal(); });
  await page.waitForTimeout(200);
  const focusIn = await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('#quickDonModal'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  const closed = await page.evaluate(() => !document.getElementById('quickDonModal').classList.contains('open'));
  ok('small modal: focus moves in, Escape closes', focusIn && closed, { focusIn, closed });
  await page.evaluate(() => openDonorModal('D1')); await page.waitForTimeout(150);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  ok('donor card ignores Escape (no data loss)', await page.evaluate(() => document.getElementById('donorModal').classList.contains('open')), '');
  ok('dialog semantics set', await page.evaluate(() => document.getElementById('donorModal').getAttribute('role') === 'dialog' && !!document.getElementById('donorModal').getAttribute('aria-labelledby')), '');
  await page.evaluate(() => closeModal('donorModal'));
  // 5. labels associated by the a11y pass
  const lab = await page.evaluate(() => { openDonorModal('D1'); const inp = document.getElementById('f_firstName'); return { hasFor: !!document.querySelector('label[for="f_firstName"]'), anyUnlabeled: [...document.querySelectorAll('#donorModal input:not([type=hidden]):not([type=checkbox]), #donorModal select')].filter(c => !c.getAttribute('aria-label') && !(c.id && document.querySelector('label[for="' + c.id + '"]')) && !c.closest('label')).map(c => c.id || c.className).slice(0, 5) }; });
  ok('donor form controls are labelled', lab.hasFor && lab.anyUnlabeled.length === 0, lab);
  await page.evaluate(() => closeModal('donorModal'));
  // 6. cache falls back to IndexedDB when localStorage is over quota
  const cache = await page.evaluate(async () => {
    const origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (k === 'donorDB_v6') throw new DOMException('quota', 'QuotaExceededError'); return origSet.call(this, k, v); };
    DB.donors[0].phone = '09-777';
    saveDB();
    await new Promise(r => setTimeout(r, 300));
    Storage.prototype.setItem = origSet;
    const ls = localStorage.getItem('donorDB_v6');
    const idb = await _idb.get('donorDB_v6');
    const got = await _cacheGet('donorDB_v6');
    return { lsNull: ls === null, idbHas: !!idb && idb.includes('09-777'), getHas: !!got && got.includes('09-777') };
  });
  ok('localStorage over quota → IndexedDB copy serves the cache', cache.lsNull && cache.idbHas && cache.getHas, cache);
  // 7. reload with dirty flag but LS cache gone → boot merge recovers from IDB
  await page.evaluate(() => { DB.donors[0].mobile = '050-IDB'; localStorage.setItem('donorDB_dirty', '1'); _cacheSet('donorDB_v6', JSON.stringify(DB)); localStorage.removeItem('donorDB_v6'); });
  await page.waitForTimeout(300);
  await boot((process.env.QA_URL || 'http://localhost:8123/index.html'));
  await page.waitForTimeout(2500);
  ok('boot merge reads the IndexedDB cache', await page.evaluate(() => DB.donors[0].mobile === '050-IDB') && S.rows.main.data.donors[0].mobile === '050-IDB', { local: await page.evaluate(() => DB.donors[0].mobile), srv: S.rows.main.data.donors[0].mobile });
  T.forEach(t => console.log(t));
  console.log('page errors:', errors.filter(e => !/Failed to fetch/.test(e)).join(' | ') || 'none');
  console.log(T.some(t => t.startsWith('FAIL')) ? 'ROUTING/CACHE FAILURES' : 'ALL ROUTING/CACHE TESTS PASS');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
