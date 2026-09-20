const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto((process.env.QA_URL || 'http://localhost:8123/index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const out = await page.evaluate(async () => {
    const X = `<img src=x onerror="window.__xss=(window.__xss||0)+1">`;
    const log = [];
    const step = (n, f) => { try { f(); log.push('OK ' + n); } catch (e) { log.push('FAIL ' + n + ' :: ' + e.message); } };
    currentUser = { id: 'U1', email: 'x@x.com', username: 'x@x.com', displayName: X, role: 'superadmin', firstLogin: false };
    DB.users = [{ email: 'x@x.com', username: 'x@x.com', displayName: X, role: 'superadmin' }, { email: 'b@b.com', username: 'b@b.com', displayName: X, role: 'viewer' }];
    DB.campaigns = [{ id: 'C1', name: X, year: X, goal: 1000, deadline: '2026-12-01', active: true, desc: X }];
    DB.fundraisers = [{ id: 'FR1', code: X, firstName: X, lastName: X, vaad: X, homePhone: X, parentMobile: X, studentMobile: X, availPhone: 'parentMobile', target: 100, campaignTargets: {} }];
    DB.fundraisingDates = [{ id: 'FD1', label: X, date: '2026-01-01', orderIndex: 1, notes: X }];
    DB.groups = [{ id: 'G1', code: X, name: X, vaad: X, fundraisingDateId: 'FD1', routeIds: ['r_1'], target: 100, notes: X, memberIds: ['FR1'], donorIds: ['D1'] }];
    DB.routes = [{ id: 'r_1', code: X, neighborhood: X, city: X, color: 'red;background:url(x)', donors: ['D1'], groupIds: ['G1'] }];
    DB.donors = [{ id: 'D1', code: X, title: X, firstName: X, lastName: X, closingName: X, affil: X, address: X, entrance: X, phone: X, mobile: X, email: X, idNumber: X, prefTime: X, notes: X, marriageYear: X, cohort: X, lat: 31.7, lng: 35.2, geocodedCity: X, geocodedNbh: X, createdAt: '2024-01-01T00:00:00',
      donations: [{ id: 'dn1', amount: 100, date: '2025-01-01', method: X, campaignId: 'C1', fundraiserId: 'FR1', groupId: '', notes: X, originalAmount: 30, originalCurrency: X }],
      futureDonations: [{ id: 'fd1', date: '2026-01-01', expectedAmount: 10, campaignId: 'C1', notes: X }], relations: [{ donorId: 'fr_FR1', type: X }] }];
    DB.expenses = [{ id: 'E1', dept: X, date: '2026-01-01', purpose: X, amount: 5, method: X, payer: X, payee: X, payeePhone: X, status: X, details: X, notes: X }];
    DB.messages = [{ id: 'M1', from: 'b@b.com', fromDisplay: X, to: 'x@x.com', subject: X, body: X, ts: new Date().toISOString(), read: false }];
    DB.pendingEdits = [{ id: 'PE1', donorId: 'D1', edits: { firstName: X, address: X }, ts: new Date().toISOString(), token: X }];
    DB.auditLog = [{ id: 'AL1', type: 'edit', description: X, user: X, ts: new Date().toISOString() }];
    DB.nbhRules = { [X]: X };
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appWrapper').style.display = 'flex';
    initSidebar(); setupNavForRole();
    for (const pg of ['dash', 'donors', 'donations', 'future', 'campaign', 'fundraisers', 'groups', 'routes', 'expenses', 'messages', 'admin']) {
      step('page:' + pg, () => showPage(pg));
      await new Promise(r => setTimeout(r, 120));
    }
    step('donor modal', () => { openDonorModal('D1'); ['donations','future','relations','bond','history'].forEach(t=>switchDTab(t)); closeModal('donorModal'); });
    step('msg thread', () => { DB.chats = [{ id: 'g1', type: 'group', name: X, members: ['x@x.com', 'b@b.com'], createdBy: 'b@b.com', createdAt: new Date().toISOString() }]; DB.messages.push({ id: 'M2', chatId: 'g1', from: 'b@b.com', text: X + ' @' + X, ts: new Date().toISOString(), readBy: {}, mentions: ['b@b.com'] }); showPage('messages'); openChat('dm:b@b.com|x@x.com'); openChat('g1'); openChatInfo(); closeModal('chatInfoModal'); openNewChatModal(); closeModal('newChatModal'); });
    step('audit', () => { openAuditLog(); closeModal('auditModal'); });
    step('pending', () => { openPendingEdits(); closeModal('pendingEditsModal'); });
    step('dup detect', () => { openDuplicateDetection(); closeModal('duplicateModal'); });
    step('groups modal', () => { openGroupModal('G1'); closeModal('groupModal'); });
    step('nbh editor', () => { openNbhEditor(); closeModal('rpNbhModal'); });
    step('global search', () => { openGlobalSearch(); document.getElementById('globalSearchInput').value='<img'; runGlobalSearch(); closeGlobalSearch(); });
    step('labels preview', () => { openLabelsWizard(); previewLabel(); closeModal('labelsWizardModal'); });
    step('users modal', () => { openUsersModal(); closeModal('usersModal'); });
    await new Promise(r => setTimeout(r, 800));
    return { log, xss: window.__xss || 0 };
  });
  console.log(out.log.filter(l => l.startsWith('FAIL')).join('\n') || '(all steps OK)');
  console.log('XSS executions:', out.xss);
  console.log(errors.filter(e => !e.includes('ERR_')).slice(0, 10).join('\n'));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
