// Performance probe with a large dataset: how long do the hot paths take?
const { chromium } = require('playwright');
const S = require('./fake-sb.js');
const { bigFixture } = require('./fixture.js');
(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
  S.seed(); S.rows.main.data = bigFixture(3000);
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.on('dialog', d => d.accept());
  await page.exposeFunction('__srv', req => JSON.stringify(S.serve(JSON.parse(req))));
  await page.addInitScript(S.FAKE_CLIENT);
  const t0 = Date.now();
  await page.goto((process.env.QA_URL || 'http://localhost:8123/index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof currentUser !== 'undefined' && currentUser && document.getElementById('appWrapper').style.display === 'flex', null, { timeout: 20000 });
  console.log('boot to app (3000 donors):', Date.now() - t0, 'ms');
  const timings = await page.evaluate(async () => {
    const T = {};
    const time = (name, fn) => { const s = performance.now(); fn(); T[name] = Math.round(performance.now() - s); };
    T.appReadyAt = Math.round(performance.now());
    time('JSON.stringify(DB)', () => JSON.stringify(DB));
    time('_dbClone(DB)', () => _dbClone(DB));
    time('_stripForCloud(DB)', () => _stripForCloud(DB));
    time('localStorage.setItem', () => { try { localStorage.setItem('perf_tmp', JSON.stringify(DB)); localStorage.removeItem('perf_tmp'); } catch(e) { T.lsErr = e.message; } });
    time('_ensureRecordIds', () => _ensureRecordIds());
    time('initMessaging', () => initMessaging());
    time('renderGlobalStats', () => renderGlobalStats());
    time('renderAll', () => renderAll());
    time('showPage donors', () => showPage('donors'));
    const si = document.querySelector('#pageDonors input.search-input, #pageDonors input[type=search], #pageDonors input[type=text]');
    time('donors filter "כהן"', () => { if (si) { si.value = 'כהן'; si.dispatchEvent(new Event('input')); } });
    if (si) { si.value = ''; si.dispatchEvent(new Event('input')); }
    time('showPage donations', () => showPage('donations'));
    time('showPage dash', () => showPage('dash'));
    time('showPage future', () => showPage('future'));
    time('showPage campaign', () => showPage('campaign'));
    time('showPage groups', () => showPage('groups'));
    time('showPage admin', () => showPage('admin'));
    time('openDonorModal', () => openDonorModal('D5'));
    time('checkAllFieldDuplicates', () => checkAllFieldDuplicates());
    time('findDuplicateDonors', () => findDuplicateDonors());
    time('saveDB (stringify+localStorage)', () => saveDB());
    time('_merge3DB self', () => _merge3DB(_baseDB, DB, _baseDB));
    time('globalSearch "כהן"', () => { const i = document.getElementById('globalSearchInput'); if (i) { i.value = 'כהן'; (window.runGlobalSearch || window.doGlobalSearch || (() => {}))(); } });
    T.jsonKB = Math.round(JSON.stringify(DB).length / 1024);
    return T;
  });
  console.log(JSON.stringify(timings, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
