// Every common phone/tablet size (mobile emulation): the page must never grow wider than
// the screen, and the donor-card save button must stay on screen after the modal opens.
const { chromium } = require('playwright');
const S = require('./fake-sb.js');
(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
  let fails = 0;
  for (const [w, h] of [[360, 740], [390, 780], [412, 915], [430, 932], [768, 1024], [820, 1100], [844, 390], [932, 430], [1024, 768], [1180, 820], [1366, 1024]]) {
    S.seed();
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.exposeFunction('__srv', req => JSON.stringify(S.serve(JSON.parse(req))));
    await page.addInitScript(S.FAKE_CLIENT);
    await page.goto((process.env.QA_URL || 'http://localhost:8123/index.html'), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof currentUser !== 'undefined' && currentUser && document.getElementById('appWrapper').style.display === 'flex', null, { timeout: 8000 });
    const res = {};
    for (const pg of ['dash', 'donors', 'donations', 'routes', 'admin']) {
      await page.evaluate(p => showPage(p), pg); await page.waitForTimeout(250);
      const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, iw: innerWidth }));
      if (m.sw > m.cw || m.iw !== m.cw) res[pg] = m;
    }
    await page.evaluate(() => { showPage('donors'); openDonorModal('D1'); }); await page.waitForTimeout(400);
    const geo = await page.evaluate(() => { const r = document.getElementById('saveDonorBtnTop').getBoundingClientRect(); const cw = document.documentElement.clientWidth; return { sw: document.documentElement.scrollWidth, cw, iw: innerWidth, btnIn: r.left >= 0 && r.right <= cw && r.top >= 0 && r.bottom <= innerHeight, btn: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] }; });
    await page.fill('#f_phone', '03-777');
    await page.tap('#saveDonorBtnTop', { timeout: 3000 }).catch(e => { geo.tapErr = e.message.split('\n')[0]; });
    await page.waitForTimeout(1800);
    const saved = S.rows.main.data.donors.find(d => d.id === 'D1').phone === '03-777';
    const good = Object.keys(res).length === 0 && geo.sw <= geo.cw && geo.iw === geo.cw && geo.btnIn && saved && !geo.tapErr && errors.length === 0;
    if (!good) fails++;
    console.log((good ? 'PASS ' : 'FAIL ') + `${w}x${h}` + (good ? '' : ' | ' + JSON.stringify({ pagesOverflow: res, modal: geo, saved, errors })));
    await ctx.close();
  }
  console.log(fails ? fails + ' VIEWPORT FAILURES' : 'ALL VIEWPORT TESTS PASS');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
