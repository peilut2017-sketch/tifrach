const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  const netFail = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });
  page.on('requestfailed', r => netFail.push(r.url().slice(0, 90)));

  await page.goto((process.env.QA_URL || 'http://localhost:8123/index.html'), { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  console.log('== libs ==');
  console.log(await page.evaluate(() => ({
    supabase: typeof supabase !== 'undefined',
    L: typeof L !== 'undefined',
    lucide: typeof lucide !== 'undefined',
    XLSX: typeof XLSX !== 'undefined',
    Chart: typeof Chart !== 'undefined',
    emailjs: typeof emailjs !== 'undefined',
  })));

  // Simulate a logged-in session with fixture data (no cloud)
  const steps = await page.evaluate(async () => {
    const log = [];
    const step = (name, fn) => { try { fn(); log.push('OK ' + name); } catch (e) { log.push('FAIL ' + name + ' :: ' + e.message); } };

    // fixture
    step('fixture', () => {
      currentUser = { id: 'U1', email: 'test@test.com', username: 'test@test.com', displayName: 'בודק', role: 'superadmin', firstLogin: false };
      DB.users = [{ email: 'test@test.com', username: 'test@test.com', displayName: 'בודק', role: 'superadmin', firstLogin: false }];
      DB.campaigns = [{ id: 'C1', name: 'מגבית בדיקה', year: 'תשפ"ו', goal: 100000, deadline: '2026-12-01', deadlineTime: '23:59', active: true, desc: '' }];
      DB.fundraisers = [
        { id: 'FR1', code: 'M0001', firstName: 'דוד', lastName: 'כהן', vaad: 'וועד א', homePhone: '02-1111111', parentMobile: '0501111111', studentMobile: '', availPhone: 'parentMobile', target: 5000, campaignTargets: { C1: 5000 } },
        { id: 'FR2', code: 'M0002', firstName: 'יוסי', lastName: 'לוי', vaad: 'וועד ב', homePhone: '', parentMobile: '0502222222', studentMobile: '0503333333', availPhone: 'studentMobile', target: 3000, campaignTargets: {} },
      ];
      DB.fundraisingDates = [{ id: 'FD1', label: 'ערב פורים', date: '2026-03-02', orderIndex: 1, notes: '' }];
      DB.groups = [{ id: 'G1', code: '1101', name: 'קבוצת בדיקה', vaad: 'וועד א', fundraisingDateId: 'FD1', routeIds: [], target: 8000, notes: '', memberIds: ['FR1', 'FR2'], donorIds: ['D1'] }];
      DB.routes = [{ id: 'r_1', code: 'ירושלים-001', neighborhood: 'רמות', city: 'ירושלים', color: '#2360d8', donors: ['D1'], groupIds: [], createdAt: new Date().toISOString() }];
      DB.donors = [
        { id: 'D1', code: 'T1001', title: 'הרב', firstName: 'משה', lastName: 'ישראלי', closingName: 'בברכה', affil: 'בוגר', address: 'הרצל 10, ירושלים', entrance: '', phone: '02-5550000', mobile: '0521234567', email: 'm@example.com', idNumber: '', prefTime: 'פורים בבית', notes: '', lat: 31.79, lng: 35.19, geocodedCity: 'ירושלים', geocodedNbh: 'רמות', createdAt: '2024-01-01T00:00:00', donations: [{ id: 'dn1', amount: 500, date: '2025-03-10', method: 'מזומן', campaignId: 'C1', fundraiserId: 'FR1', groupId: '', notes: '' }, { id: 'dn2', amount: 300, date: '2026-01-05', method: 'אשראי', campaignId: 'C1', fundraiserId: '', groupId: 'G1', notes: 'קבוצתי' }], futureDonations: [{ id: 'fd1', date: '2026-10-01', expectedAmount: 800, campaignId: 'C1', notes: 'לבדוק' }], relations: [] },
        { id: 'D2', code: 'T1002', firstName: 'יעקב', lastName: 'כהן', affil: 'מכר', address: '', phone: '', mobile: '', email: '', donations: [], futureDonations: [], relations: [] },
      ];
      DB.expenses = [{ id: 'E1', dept: 'מגבית פורים', date: '2026-02-01', purpose: 'דלק', amount: 200, method: 'מזומן', payer: 'א', payee: 'ב', payeePhone: '', status: 'שולם', details: '', notes: '' }];
      DB.messages = []; DB.pendingEdits = []; DB.auditLog = [];
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('appWrapper').style.display = 'flex';
      initSidebar(); setupNavForRole();
    });

    for (const pg of ['dash', 'donors', 'donations', 'future', 'campaign', 'fundraisers', 'groups', 'routes', 'expenses', 'messages', 'admin']) {
      step('page:' + pg, () => showPage(pg));
      await new Promise(r => setTimeout(r, 150));
    }

    // modals
    step('openDonorModal', () => openDonorModal('D1'));
    step('donor tabs', () => { ['donations', 'future', 'relations', 'bond', 'history', 'details'].forEach(t => switchDTab(t)); });
    step('editDonation(0)', () => { switchDTab('donations'); editDonation(0); });
    step('editDonation(1) group', () => editDonation(1));
    step('attribution after group edit', () => {
      const a = getDonAttribution('nd');
      if (a.groupId !== 'G1') throw new Error('groupId lost: ' + JSON.stringify(a));
    });
    step('closeDonor', () => closeModal('donorModal'));
    step('quickDon', () => { openQuickDonationModal(); pickQDDonor('D1'); document.getElementById('qd_amount').value = '250'; saveQuickDonation(); });
    step('newDonorModal', () => { openNewDonorModal(); closeModal('donorModal'); });
    step('FR modal new', () => { openFRModal(); closeModal('frModal'); });
    step('FR modal edit', () => { openFRModal('FR1'); closeModal('frModal'); });
    step('group modal', () => { openGroupModal('G1'); closeModal('groupModal'); });
    step('fd modal', () => { openFundraisingDateModal('FD1'); closeModal('fundraisingDateModal'); });
    step('campaign mgmt', () => { openCampaignMgmtModal(); closeModal('campMgmtModal'); });
    step('campaign edit', () => { editCampaign('C1'); closeModal('campaignModal'); });
    step('users modal', () => { openUsersModal(); closeModal('usersModal'); });
    step('settings modal', () => { openSettingsModal(); closeModal('settingsModal'); });
    step('audit modal', () => { openAuditLog(); closeModal('auditModal'); });
    step('duplicates', () => { openDuplicateDetection(); closeModal('duplicateModal'); });
    step('pending edits', () => { openPendingEdits(); closeModal('pendingEditsModal'); });
    step('IO center', () => { openIOCenter('excel'); switchIOTab('print'); switchIOTab('labels'); switchIOTab('import'); closeModal('ioCenterModal'); });
    step('import modal', () => { openImportModal(); closeModal('importModal'); });
    step('fr import modal', () => { openFRImportModal(); closeModal('frImportModal'); });
    step('nedarim import', () => { openNedarimImport(); closeModal('nedarimImportModal'); });
    step('nedarim settings', () => { openNedarimSettings(); closeModal('nedarimSettingsModal'); });
    step('email settings', () => { openEmailSettings(); closeModal('emailSettingsModal'); });
    step('yemot settings', () => { openYemotSettings(); closeModal('yemotSettingsModal'); });
    step('gmaps settings', () => { openGmapsSettings(); closeModal('gmapsModal'); });
    step('geocode batch', () => { openGeocodeBatchModal(); closeModal('geocodeBatchModal'); });
    step('labels wizard', () => { openLabelsWizard(); previewLabel(); closeModal('labelsWizardModal'); });
    step('fr print modal', () => { openFundraisingPrint(); previewFrPrint(); closeModal('frPrintModal'); });
    step('reports modal', () => { openReportsModal(); runReport(); closeModal('reportsModal'); });
    step('self service panel', () => { openSelfServicePanel(); searchDonorForSS('משה'); closeModal('selfServiceModal'); });
    step('nbh editor', () => { openNbhEditor(); closeModal('rpNbhModal'); });
    step('routes wiz', () => { openCreateRoutesWiz(); rpWizPreview(); closeModal('rpWizModal'); });
    step('assign route', () => { openAssignRoute('r_1'); closeModal('assignRouteModal'); });
    step('failed geocode modal', () => { rpOpenFailedModal(); closeModal('rpFailedModal'); });
    step('compose msg', () => { openNewChatModal(); closeModal('newChatModal'); });
    step('global search', () => { openGlobalSearch(); document.getElementById('globalSearchInput').value = 'משה'; runGlobalSearch(); closeGlobalSearch(); });

    // new-donor pending buffers: donation + future + relation before first save
    step('newDonor buffers', () => {
      openNewDonorModal();
      document.getElementById('f_firstName').value='חדש';
      document.getElementById('f_lastName').value='בבדיקה';
      // buffer a donation
      switchDTab('donations');
      document.getElementById('nd_amount').value='120';
      document.getElementById('nd_date').value='2026-01-01';
      saveDonation();
      if(_pendingDonations.length!==1) throw new Error('donation not buffered');
      // buffer a future donation
      switchDTab('future');
      document.getElementById('nf_date').value='2026-06-01';
      document.getElementById('nf_amount').value='300';
      saveFutureDonation();
      if(_pendingFuture.length!==1) throw new Error('future not buffered');
      if(!document.getElementById('futureItemsList').innerHTML.includes('300')) throw new Error('pending future not displayed');
      // buffer a relation
      switchDTab('relations');
      openAddRelPanel();
      selectRelAddItem('D1','משה ישראלי');
      confirmNewRel();
      if(_pendingRelations.length!==1) throw new Error('relation not buffered');
      if(!document.getElementById('relList').innerHTML.includes('משה')) throw new Error('pending relation not displayed');
      // save → everything attached
      switchDTab('details');
      _lastActionAt.donor = 0; // bypass double-submit guard in fast test
      saveDonor();
      const nd = DB.donors[DB.donors.length-1];
      if(nd.firstName!=='חדש') throw new Error('donor not saved');
      if(nd.donations.length!==1 || nd.futureDonations.length!==1 || nd.relations.length!==1)
        throw new Error('buffers not flushed: '+JSON.stringify([nd.donations.length,nd.futureDonations.length,nd.relations.length]));
    });

    // v30 batch-2: multi-affiliation control, assignment block, live duplicates
    step('affil multi control', () => {
      openDonorModal('D1');
      if(!document.getElementById('f_affilOpts').innerHTML.includes('בוגר')) throw new Error('affil options not rendered');
      const cb=[...document.querySelectorAll('#f_affilOpts input')].find(c=>c.value==='מכר'); cb.checked=true; onAffilToggle(cb);
      if(!_donorAffils.includes('בוגר')||!_donorAffils.includes('מכר')) throw new Error('multi affils: '+JSON.stringify(_donorAffils));
      const pcb=[...document.querySelectorAll('#f_affilOpts input')].find(c=>c.value==='הורה תלמיד'); pcb.checked=true; onAffilToggle(pcb);
      if(currentDTab!=='relations') throw new Error('parent affil should switch to relations tab');
      if(!document.getElementById('relPromptBanner')) throw new Error('no relation prompt');
      switchDTab('details');
      _lastActionAt.donor=0; saveDonor();
      const d=DB.donors.find(x=>x.id==='D1');
      if(!(d.affils.length===3 && d.affil.includes('מכר'))) throw new Error('affils not saved: '+JSON.stringify(d.affils)+' / '+d.affil);
    });
    step('assignment derived+override', () => {
      openDonorModal('D1');
      const der=document.getElementById('f_assignDerived').innerHTML;
      if(!der.includes('קבוצת בדיקה')||!der.includes('ירושלים-001')) throw new Error('derived chips missing: '+der);
      document.getElementById('f_assignKind').value='fr'; onAssignKindChange();
      document.getElementById('f_assignId').value='FR2';
      _lastActionAt.donor=0; saveDonor();
      const d=DB.donors.find(x=>x.id==='D1');
      if(d.assignKind!=='fr'||d.assignId!=='FR2'||d.fundraiserId!=='FR2') throw new Error('override not saved');
      const ov=_overriddenDonors(['D1'],'group','G1');
      if(ov.length!==1) throw new Error('override notice detection failed');
      closeModal('donorModal');
    });
    step('live duplicates (cross-field + name + notes)', () => {
      openNewDonorModal();
      document.getElementById('f_phone').value='0521234567'; checkFieldDuplicate('phone','0521234567'); // D1 has it as MOBILE
      if(!document.getElementById('f_phone').classList.contains('has-dup')) throw new Error('cross-field phone dup not flagged');
      if(document.getElementById('dupTopBanner').style.display==='none') throw new Error('top banner hidden');
      document.getElementById('f_firstName').value='משה'; document.getElementById('f_lastName').value='ישראלי'; checkFieldDuplicate('name');
      if(!document.getElementById('f_lastName').classList.contains('has-dup')) throw new Error('name dup not flagged');
      DB.donors[0].idNumber='012345678';
      document.getElementById('f_notes').value='ת.ז. 012345678 של האבא'; checkFieldDuplicate('notes');
      if(!document.getElementById('f_notes').classList.contains('has-dup')) throw new Error('id-in-notes dup not flagged');
      const grp=findDuplicateDonors();
      closeModal('donorModal');
    });
    step('pending new-donor approval', () => {
      DB.pendingEdits=[{id:'PE9',donorId:null,edits:{_newDonor:{firstName:'טופס',lastName:'פתוח',mobile:'0509999999',affils:['בוגר'],zip:'9100000'}},ts:new Date().toISOString(),token:'public-add'},
                       {id:'PE8',donorId:null,edits:{_phoneDonation:{phone:'0521234567',amount:120,date:'2026-01-01',method:'טלפון'}},ts:new Date().toISOString(),token:'yemot'}];
      openPendingEdits();
      const h=document.getElementById('pendingEditsList').innerHTML;
      if(!h.includes('תורם חדש')||!h.includes('תרומה טלפונית')) throw new Error('pending types not rendered');
      approveNewDonorRequest(0);
      if(document.getElementById('f_firstName').value!=='טופס'||!_donorAffils.includes('בוגר')||document.getElementById('f_zip').value!=='9100000') throw new Error('prefill failed');
      _lastActionAt.donor=0; saveDonor();
      if(DB.pendingEdits.some(p=>p.id==='PE9')) throw new Error('request not closed after save');
      _lastActionAt['pending:0']=0; approvePhoneDonation(0);   // guard: same index twice within 0.8s is a double click
      if(qd_selectedId!=='D1'||document.getElementById('qd_amount').value!=='120') throw new Error('phone donation prefill failed');
      _lastActionAt.qdon=0; saveQuickDonation();
      if(DB.pendingEdits.length!==0) throw new Error('phone request not closed');
    });
    step('history meta + jump', () => {
      openDonorModal('D1'); switchDTab('history');
      const h=document.getElementById('donorHistoryContent').innerHTML;
      if(!h.includes('הצג תרומה')||!h.includes('הוספת תרומה')) throw new Error('structured history missing: '+h.slice(0,200));
      closeModal('donorModal');
      openAuditLog();
      if(!document.getElementById('auditBody').innerHTML.includes('↗ פתח')) throw new Error('admin log jump link missing');
      closeModal('auditModal');
    });
    step('import multi-column concat', () => {
      _impHeaders=['שם פרטי','שם משפחה','רחוב','מספר','עיר','מיקוד'];
      _impRawRows=[['לוי','כהן','הרצל','12','ירושלים','9100001']];
      _impColMap={0:'firstName',1:'lastName',2:'address',3:'address',4:'address',5:'zip'};
      const before=DB.donors.length; impDoImport();
      const nd=DB.donors[DB.donors.length-1];
      if(DB.donors.length!==before+1||nd.address!=='הרצל 12 ירושלים'||nd.zip!=='9100001') throw new Error('concat failed: '+nd.address);
    });
    step('mobile drawer toggles', () => { toggleMobileNav(); if(!document.getElementById('sidebar').classList.contains('mobile-open')) throw new Error('drawer not open'); showPage('dash'); if(document.getElementById('sidebar').classList.contains('mobile-open')) throw new Error('drawer not closed on nav'); });

    // export wizard walk-through
    step('wizard open', () => openExportWizard('donors'));
    step('wizard type+filter', () => { selectWizType('excel'); wizStep(1); wizComputeFilter(); });
    step('wizard step3+4', () => { wizStep(1); wizStep(1); });
    step('wizard preview', () => wizGeneratePreview());
    step('wizard close', () => closeModal('exportWizardModal'));

    // filters
    step('donors filters', () => { showPage('donors'); document.getElementById('mainSearch').value = 'משה'; applyFilters(); document.getElementById('mainSearch').value = ''; clearFilters(); });
    step('dons filters', () => { showPage('donations'); renderDonationsPanel(); clearDonsFilters(); });
    step('smart alert lapse', () => applyLapseFilter());
    step('smart alert noaddr', () => filterNoAddress());

    return log;
  });

  console.log('== steps ==');
  steps.forEach(s => console.log(s));
  console.log('== page errors ==');
  errors.slice(0, 40).forEach(e => console.log(e));
  console.log('== failed network (first 12) ==');
  [...new Set(netFail)].slice(0, 12).forEach(u => console.log(u));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
