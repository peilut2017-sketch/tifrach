// Roles are enforced in the client, so every write path has to refuse by
// itself — hiding a button is not the same as refusing the action. This drives
// each entry point directly (as a deep link or a stray click would) and checks
// that the database is untouched and no modal opened.
const { chromium } = require('playwright');
const S = require('./fake-sb.js');
const { bigFixture } = require('./fixture.js');

const EDIT_ONLY = ['confirmAddAffil','confirmAddOpt','addCustomExpOption','saveDonation','deleteDonation',
  'saveFutureDonation','deleteFuture','deleteFutureFromPage','saveQuickDonation','saveQuickDonationAndNew',
  'openNewCampaignModal','saveCampaign','openCampaignMgmtModal','deleteCampaign','openFundraisingDateModal',
  'saveFundraisingDate','deleteFundraisingDate','openFRModal','deleteFRById','openGroupModal','saveGroup',
  'deleteGroup','openExpenseModal','saveExpense','deleteExpense','openMergeModal','confirmMerge','deleteRel',
  'openAddRelPanel','confirmNewRel','generateSelfServiceToken','approvePendingEdit','rejectPendingEdit',
  'rpGenerate','rpSaveDragOrder','rpDeleteRoute','rpClearAll','openNbhEditor','rpAddNbhRule','rpDelNbhRule',
  'openNewDonorModal','saveDonor','openQuickDonationModal'];
const ADMIN_ONLY = ['openSettingsModal','saveSettings','saveUsers','openUsersModal','openGeocodeBatchModal',
  'runGeocodeBatch','undoAuditEntry','saveNedarimSettings','saveEmailSettings','saveYemotSettings','saveGmapsKey'];
const IMPORT_ONLY = ['openImportModal','openNedarimImport','openFRImportModal'];
const EXPORT_ONLY = ['openReportsModal','openLabelsWizard','openSendEmailModal','openIOCenter'];

(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
  const T = []; const ok = (n, c, x) => T.push((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' | ' + JSON.stringify(x)));
  S.seed(); S.rows.main.data = bigFixture(20);
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message.split('\n')[0]));
  page.on('dialog', d => d.accept());
  await page.exposeFunction('__srv', req => JSON.stringify(S.serve(JSON.parse(req))));
  await page.addInitScript(S.FAKE_CLIENT);
  await page.goto((process.env.QA_URL || 'http://localhost:8123/index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof currentUser !== 'undefined' && currentUser && document.getElementById('appWrapper').style.display === 'flex', null, { timeout: 15000 });

  // roles that must be refused for each set: [role, [sets...]]
  const MATRIX = [
    ['viewer', [['edit', EDIT_ONLY], ['admin', ADMIN_ONLY], ['import', IMPORT_ONLY], ['export', EXPORT_ONLY]]],
    ['editor', [['admin', ADMIN_ONLY], ['import', IMPORT_ONLY]]],
  ];
  for (const [role, sets] of MATRIX) {
    for (const [perm, fns] of sets) {
      const res = await page.evaluate(async ({ role, fns }) => {
        currentUser.role = role;
        const before = JSON.stringify(DB);
        const leaked = [], opened = [], threw = [];
        for (const name of fns) {
          document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
          const fn = window[name];
          if (typeof fn !== 'function') { threw.push(name + ' (missing)'); continue; }
          try { await fn(); } catch (e) { threw.push(name + ': ' + e.message); }
          const open = [...document.querySelectorAll('.modal-overlay.open')].map(m => m.id)
            .filter(id => id !== 'pwConfirmModal' && id !== 'infoDialog');
          if (open.length) opened.push(name + ' → ' + open.join(','));
          if (JSON.stringify(DB) !== before) { leaked.push(name); break; }
        }
        document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
        currentUser.role = 'superadmin';
        return { leaked, opened, threw };
      }, { role, fns });
      ok(`${role} cannot write via ${perm} actions`, res.leaked.length === 0, res.leaked);
      ok(`${role} sees no ${perm} dialog`, res.opened.length === 0, res.opened);
      ok(`${role}/${perm} actions refuse without throwing`, res.threw.length === 0, res.threw);
    }
  }

  // a superadmin is still allowed through
  const allowed = await page.evaluate(() => {
    currentUser.role = 'superadmin';
    openFRModal();
    const frOpen = document.getElementById('frModal').classList.contains('open');
    closeModal('frModal');
    openSettingsModal();
    const setOpen = document.getElementById('settingsModal').classList.contains('open');
    closeModal('settingsModal');
    return { frOpen, setOpen };
  });
  ok('superadmin still opens the fundraiser form', allowed.frOpen, allowed);
  ok('superadmin still opens settings', allowed.setOpen, allowed);

  T.forEach(t => console.log(t));
  if (pageErrors.length) console.log('PAGEERROR ' + pageErrors.slice(0, 5).join(' | '));
  console.log(T.some(t => t.startsWith('FAIL')) ? 'ROLE FAILURES' : 'ALL ROLE TESTS PASS');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
