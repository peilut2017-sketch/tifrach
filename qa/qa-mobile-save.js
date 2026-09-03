// Mobile/tablet: is the donor-card save button reachable and does a real tap save?
const { chromium } = require('playwright');
const S = require('./fake-sb.js');
(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
  const T = []; const ok = (n, c, x) => T.push((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' | ' + JSON.stringify(x)));
  for (const [name, vp] of [['phone', { width: 390, height: 780 }], ['tablet', { width: 820, height: 1100 }], ['desktop', { width: 1366, height: 800 }]]) {
    S.seed();
    const ctx = await browser.newContext({ viewport: vp, isMobile: name !== 'desktop', hasTouch: name !== 'desktop' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.exposeFunction('__srv', req => JSON.stringify(S.serve(JSON.parse(req))));
    await page.addInitScript(S.FAKE_CLIENT);
    await page.goto((process.env.QA_URL || 'http://localhost:8123/index.html'), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof currentUser !== 'undefined' && currentUser && document.getElementById('appWrapper').style.display === 'flex', null, { timeout: 8000 });
    await page.evaluate(() => showPage('donors'));
    await page.waitForTimeout(300);
    // open the card the way a user does: tap the row/card
    const opened = await page.evaluate(() => { const el = document.querySelector('[onclick*="openDonorModal(\'D1\')"]'); if (!el) return false; el.click(); return true; });
    await page.waitForTimeout(400);
    const btn = await page.evaluate(() => {
      const b = document.getElementById('saveDonorBtnTop'); const r = b.getBoundingClientRect();
      const vis = getComputedStyle(b).display !== 'none' && r.width > 0;
      const inView = r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
      const topEl = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { vis, inView, r: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], covered: !(topEl === b || b.contains(topEl)), top: topEl && (topEl.id || topEl.className) };
    });
    ok(name + ': donor card opened from list', opened && (await page.evaluate(() => document.getElementById('donorModal').classList.contains('open'))), {});
    ok(name + ': save button visible, in viewport, not covered', btn.vis && btn.inView && !btn.covered, btn);
    await page.fill('#f_phone', '03-555');
    const geo = await page.evaluate(() => { const b = document.getElementById('saveDonorBtnTop'); const r = b.getBoundingClientRect(); const vv = window.visualViewport; return { btn: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], vv: vv && { x: vv.offsetLeft, y: vv.offsetTop, w: vv.width, h: vv.height, scale: vv.scale }, docScroll: [document.scrollingElement.scrollLeft, document.scrollingElement.scrollTop], inner: [innerWidth, innerHeight], focused: document.activeElement && document.activeElement.id }; });
    console.log(name, 'geometry before click', JSON.stringify(geo));
    await page.screenshot({ path: `save-${name}-before.png` });
    try { await page.tap('#saveDonorBtnTop', { timeout: 4000 }); } catch (e) { console.log(name, 'tap failed:', e.message.split('\n')[0]); try { await page.click('#saveDonorBtnTop', { timeout: 4000 }); } catch (e2) { console.log(name, 'click failed:', e2.message.split('\n')[0]); } }
    await page.waitForTimeout(2500);
    const srv = S.rows.main.data.donors.find(d => d.id === 'D1').phone;
    const closed = await page.evaluate(() => !document.getElementById('donorModal').classList.contains('open'));
    ok(name + ': tap on save persisted to server + modal closed', srv === '03-555' && closed, { srv, closed });
    // fields below the fold: can the user reach the notes/save via scrolling inside the modal?
    const scrollOk = await page.evaluate(() => { const body = document.querySelector('#donorModal .modal-body') || document.querySelector('#donorModal .modal'); return !!body && getComputedStyle(body).overflowY !== 'visible'; });
    ok(name + ': modal body scrollable', scrollOk, {});
    ok(name + ': no page errors', errors.length === 0, errors);
    await page.screenshot({ path: `save-${name}.png` });
    await ctx.close();
  }
  T.forEach(t => console.log(t));
  console.log(T.some(t => t.startsWith('FAIL')) ? 'FAILURES' : 'ALL MOBILE SAVE TESTS PASS');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
