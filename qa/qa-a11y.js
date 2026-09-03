// axe-core accessibility scan over every page and every modal (desktop + phone)
const { chromium } = require('playwright');
const S = require('./fake-sb.js');
const { bigFixture } = require('./fixture.js');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
  S.seed(); S.rows.main.data = bigFixture(40);
  const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  const agg = {};
  for (const [label, vp] of [['desktop', { width: 1366, height: 900 }], ['phone', { width: 390, height: 780 }]]) {
    const ctx = await browser.newContext({ viewport: vp, isMobile: label === 'phone', hasTouch: label === 'phone' });
    const page = await ctx.newPage();
    page.on('dialog', d => d.accept());
    await page.exposeFunction('__srv', req => JSON.stringify(S.serve(JSON.parse(req))));
    await page.addInitScript(S.FAKE_CLIENT);
    await page.goto((process.env.QA_URL || 'http://localhost:8123/index.html'), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof currentUser !== 'undefined' && currentUser && document.getElementById('appWrapper').style.display === 'flex', null, { timeout: 10000 });
    await page.addScriptTag({ content: axeSrc });
    const scan = async (name, context) => {
      const res = await page.evaluate(async (c) => {
        const r = await axe.run(c || document, { runOnly: ['wcag2a', 'wcag2aa', 'best-practice'], resultTypes: ['violations'] });
        return r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, ex: v.nodes.slice(0, 2).map(nd => nd.target.join(' ').slice(0, 90)) }));
      }, context);
      res.forEach(v => { const k = v.id; agg[k] = agg[k] || { impact: v.impact, help: v.help, n: 0, where: new Set(), ex: v.ex }; agg[k].n += v.n; agg[k].where.add(label + ':' + name); });
    };
    for (const pg of ['dash', 'donors', 'donations', 'future', 'campaign', 'fundraisers', 'groups', 'routes', 'expenses', 'messages', 'admin']) {
      await page.evaluate(p => showPage(p), pg); await page.waitForTimeout(200);
      await scan(pg, '#page' + pg.charAt(0).toUpperCase() + pg.slice(1));
    }
    await scan('shell', '#sidebar, .topbar');
    for (const [mid, opener] of [['donorModal', "openDonorModal('D1')"], ['quickDonationModal', 'openQuickDonationModal()'], ['expModal', 'openExpenseModal && openExpenseModal()'], ['settingsModal', 'openSettingsModal()'], ['usersModal', 'openUsersModal()'], ['newChatModal', 'openNewChatModal()'], ['pendingEditsModal', 'openPendingEditsModal && openPendingEditsModal()'], ['importModal', 'openImportModal && openImportModal()']]) {
      await page.evaluate(o => { try { eval(o); } catch (e) { return 'ERR ' + e.message; } return true; }, opener);
      await page.waitForTimeout(150);
      const isOpen = await page.evaluate(id => !!document.querySelector('#' + id + '.open'), mid);
      if (isOpen) await scan(mid, '#' + mid + ' .modal, #' + mid + ' .modal-box');
      await page.evaluate(() => document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open')));
    }
    await ctx.close();
  }
  const rows = Object.entries(agg).sort((a, b) => ({ critical: 0, serious: 1, moderate: 2, minor: 3 }[a[1].impact] - { critical: 0, serious: 1, moderate: 2, minor: 3 }[b[1].impact]) || b[1].n - a[1].n);
  console.log('violation types:', rows.length);
  rows.forEach(([id, v]) => console.log(`${v.impact.padEnd(8)} ${String(v.n).padStart(4)}  ${id}  — ${v.help}\n           e.g. ${v.ex.join(' | ')}\n           in: ${[...v.where].slice(0, 6).join(', ')}${v.where.size > 6 ? ' …' : ''}`));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
