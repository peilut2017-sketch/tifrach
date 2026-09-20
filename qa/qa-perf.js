// Scale test: 3,000 donors (~4,500 donations, ~2.3 MB of JSON).
// Measures the hot paths against a budget and checks that the big tables
// paginate instead of pushing thousands of rows into the DOM.
const { chromium } = require('playwright');
const S = require('./fake-sb.js');
const { bigFixture } = require('./fixture.js');

// Budgets are generous (CI machines are slow) but catch a return to the
// quadratic renders that used to cost hundreds of milliseconds per click.
const BUDGET = {
  'boot to app': 6000, 'renderAll': 400, 'showPage donors': 400, 'showPage donations': 250,
  'showPage dash': 400, 'donors filter': 250, 'donations search keystroke': 150,
  'openDonorModal': 400, 'findDuplicateDonors': 250, 'checkAllFieldDuplicates': 250,
  'saveDB': 500, '_merge3DB self': 250, 'showPage expenses': 250, 'expenses search keystroke': 150,
};

(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
  const T = []; const ok = (n, c, x) => T.push((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' | ' + JSON.stringify(x)));
  S.seed(); S.rows.main.data = bigFixture(3000);
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.on('pageerror', e => T.push('FAIL pageerror | ' + e.message.split('\n')[0]));
  page.on('dialog', d => d.accept());
  await page.exposeFunction('__srv', req => JSON.stringify(S.serve(JSON.parse(req))));
  await page.addInitScript(S.FAKE_CLIENT);
  const t0 = Date.now();
  await page.goto((process.env.QA_URL || 'http://localhost:8123/index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof currentUser !== 'undefined' && currentUser && document.getElementById('appWrapper').style.display === 'flex', null, { timeout: 30000 });
  const bootMs = Date.now() - t0;

  const r = await page.evaluate(() => {
    const T = {};
    const time = (name, fn) => { const s = performance.now(); fn(); T[name] = Math.round(performance.now() - s); };
    time('renderAll', () => renderAll());
    time('showPage donors', () => showPage('donors'));
    T.donorRowsInDom = document.getElementById('donorsBody').children.length;
    const ms = document.getElementById('mainSearch');
    time('donors filter', () => { ms.value = 'כהן'; ms.dispatchEvent(new Event('input')); });
    ms.value = ''; ms.dispatchEvent(new Event('input'));
    time('showPage donations', () => showPage('donations'));
    T.donationRowsInDom = document.getElementById('donsPanelBody').children.length;
    T.donationsTotalLabel = document.getElementById('donsPanelCount').textContent;
    T.donationsPagerShown = !!document.getElementById('donsPagination').innerHTML;
    T.donationsExportRows = _lastDonsRows.length;    // print / Excel see every row
    const ds = document.getElementById('donsSearch');
    time('donations search keystroke', () => { ds.value = 'כהן'; ds.dispatchEvent(new Event('input')); });
    ds.value = ''; ds.dispatchEvent(new Event('input'));
    // paging keeps the totals and moves the window
    const firstPageTop = document.getElementById('donsPanelBody').children[0].textContent;
    _donsPage = 2; renderDonationsPanel();
    T.page2Differs = document.getElementById('donsPanelBody').children[0].textContent !== firstPageTop;
    T.page2Total = document.getElementById('donsPanelCount').textContent;
    // a filter change resets to page 1
    ds.value = 'כהן'; ds.dispatchEvent(new Event('input'));
    T.pageResetOnFilter = _donsPage === 1;
    ds.value = ''; ds.dispatchEvent(new Event('input'));
    time('showPage expenses', () => showPage('expenses'));
    T.expenseRowsInDom = document.getElementById('expListBody').children.length;
    T.expensePagerShown = !!document.getElementById('expPagination').innerHTML;
    T.expenseSummaryDepts = document.getElementById('expDeptSummary').children.length;
    const es = document.getElementById('expSearch');
    time('expenses search keystroke', () => { es.value = 'הוצאה'; es.dispatchEvent(new Event('input')); });
    es.value = ''; es.dispatchEvent(new Event('input'));
    time('showPage dash', () => showPage('dash'));
    time('openDonorModal', () => openDonorModal('D5'));
    closeModal('donorModal');
    time('checkAllFieldDuplicates', () => checkAllFieldDuplicates());
    time('findDuplicateDonors', () => findDuplicateDonors());
    time('saveDB', () => saveDB());
    time('_merge3DB self', () => _merge3DB(_baseDB, DB, _baseDB));
    T.pagerLabels = document.querySelectorAll('#expPagination button[aria-label]').length;
    T.jsonKB = Math.round(JSON.stringify(DB).length / 1024);
    return T;
  });

  r['boot to app'] = bootMs;
  Object.entries(BUDGET).forEach(([k, max]) => ok(`${k} ≤ ${max}ms`, r[k] <= max, r[k] + 'ms'));
  ok('donors table paginates (200 rows in the DOM)', r.donorRowsInDom === 200, r.donorRowsInDom);
  ok('donations table paginates (200 rows in the DOM)', r.donationRowsInDom === 200, r.donationRowsInDom);
  ok('donations pager is shown', r.donationsPagerShown, r);
  ok('donations count covers every filtered row', /4,?\d\d\d תרומות/.test(r.donationsTotalLabel), r.donationsTotalLabel);
  ok('print/export set holds every filtered row', r.donationsExportRows > 1000, r.donationsExportRows);
  ok('page 2 shows a different window', r.page2Differs, r);
  ok('totals stay whole-set across pages', r.page2Total === r.donationsTotalLabel, [r.page2Total, r.donationsTotalLabel]);
  ok('changing a filter returns to page 1', r.pageResetOnFilter, r);
  ok('expenses table paginates (200 rows in the DOM)', r.expenseRowsInDom === 200, r.expenseRowsInDom);
  ok('expenses pager is shown', r.expensePagerShown, r);
  ok('expense summary still covers every filtered row', r.expenseSummaryDepts === 3, r.expenseSummaryDepts);
  ok('pager buttons are labelled', r.pagerLabels >= 4, r.pagerLabels);

  console.log(JSON.stringify(r, null, 1));
  T.forEach(l => console.log(l));
  console.log(T.some(l => l.startsWith('FAIL')) ? 'SCALE FAILURES' : 'ALL SCALE TESTS PASS');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
