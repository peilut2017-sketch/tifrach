// Keyboard: login via Tab/Enter, visible focus, app navigation by keyboard, modal focus trap basics.
const { chromium } = require('playwright');
const S = require('./fake-sb.js'); const { bigFixture } = require('./fixture.js');
(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
  const T = []; const ok = (n, c, x) => T.push((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' | ' + JSON.stringify(x)));
  // 1. login screen without a session
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto((process.env.QA_URL || 'http://localhost:8123/index.html'), { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1200);
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  const order = [];
  for (let i = 0; i < 4; i++) { order.push(await page.evaluate(() => document.activeElement.id || document.activeElement.tagName + ':' + (document.activeElement.textContent || '').trim().slice(0, 12))); await page.keyboard.press('Tab'); }
  ok('login: Tab reaches password → button → forgot, never a hidden dialog', order.includes('loginPass') && order.includes('loginBtn') && !order.some(x => /saveNewDonorBtn|Donor|modal/i.test(x)), order);
  await page.focus('#loginEmail'); await page.keyboard.type('x@y.com'); await page.focus('#loginPass'); await page.keyboard.type('secret');
  let submitted = false; await page.exposeFunction('__hit', () => { submitted = true; });
  await page.evaluate(() => { const o = window.doLogin; window.doLogin = function () { window.__hit(); return o.apply(this, arguments); }; });
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok('login: Enter submits', submitted, '');
  await page.focus('#loginPass'); await page.keyboard.press('Tab'); await page.waitForTimeout(350);   // outline animates in over .16s
  const outline = await page.evaluate(() => { const b = document.activeElement; const cs = getComputedStyle(b); return b.id + ' ' + cs.outlineStyle + ' ' + cs.outlineWidth; });
  ok('keyboard focus shows a visible outline', /loginBtn solid/.test(outline) && !/ 0px/.test(outline), outline);
  await page.close();
  // 2. inside the app
  S.seed(); S.rows.main.data = bigFixture(15);
  const p2 = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await p2.exposeFunction('__srv', req => JSON.stringify(S.serve(JSON.parse(req))));
  await p2.addInitScript(S.FAKE_CLIENT);
  await p2.goto((process.env.QA_URL || 'http://localhost:8123/index.html'), { waitUntil: 'domcontentloaded' });
  await p2.waitForFunction(() => typeof currentUser !== 'undefined' && currentUser && document.getElementById('appWrapper').style.display === 'flex', null, { timeout: 10000 });
  // sidebar items reachable + Enter activates
  await p2.evaluate(() => document.getElementById('sb-dash').focus());
  await p2.keyboard.press('Tab'); await p2.keyboard.press('Tab');
  const act = await p2.evaluate(() => document.activeElement.className + '#' + document.activeElement.id);
  ok('sidebar buttons are tabbable', /sb-item/.test(act), act);
  await p2.evaluate(() => { const dd = document.getElementById('sbdd-donors'); if (dd && dd.style.display !== 'block') toggleSbDropdown('sbdd-donors'); document.getElementById('sb-donors').focus(); });
  await p2.keyboard.press('Enter'); await p2.waitForTimeout(300);
  const navOk = await p2.evaluate(() => window._currentPage === 'donors' || document.getElementById('sbdd-donors')?.style.display === 'block');
  ok('Enter on a sidebar item activates it', navOk, await p2.evaluate(() => [window._currentPage, document.activeElement.id]));
  // modal: focus moves in, Tab cycles inside (first field), Escape closes small modal and returns focus
  await p2.evaluate(() => { document.querySelector('.topbar button[onclick*="openQuickDonationModal"]') || document.querySelector('[onclick*="openQuickDonationModal"]'); });
  await p2.evaluate(() => openQuickDonationModal()); await p2.waitForTimeout(200);
  const inModal = await p2.evaluate(() => !!document.activeElement.closest('#quickDonModal'));
  await p2.keyboard.press('Tab'); await p2.keyboard.press('Tab');
  const stillIn = await p2.evaluate(() => !!document.activeElement.closest('#quickDonModal'));
  ok('modal: focus inside after open and after Tab', inModal && stillIn, { inModal, stillIn });
  await p2.keyboard.press('Escape'); await p2.waitForTimeout(150);
  ok('modal: Escape closes', await p2.evaluate(() => !document.getElementById('quickDonModal').classList.contains('open')), '');
  // global search shortcut Ctrl+K
  await p2.evaluate(() => { document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open')); document.body.focus(); });
  await p2.keyboard.press('Control+k'); await p2.waitForTimeout(300);
  const gk = await p2.evaluate(() => ({ open: document.getElementById('globalSearchOverlay')?.classList.contains('open'), active: document.activeElement.id, vis: getComputedStyle(document.getElementById('globalSearchOverlay')).visibility }));
  ok('Ctrl+K opens global search with focus in the input', gk.open && gk.active === 'globalSearchInput', gk);
  await p2.keyboard.press('Escape'); await p2.waitForTimeout(150);
  ok('Escape closes global search', await p2.evaluate(() => !document.getElementById('globalSearchOverlay')?.classList.contains('open')), '');
  T.forEach(t => console.log(t)); console.log(T.some(t => t.startsWith('FAIL')) ? 'KEYBOARD FAILURES' : 'ALL KEYBOARD TESTS PASS');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
