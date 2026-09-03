const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto((process.env.QA_URL || 'http://localhost:8123/index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const out = await page.evaluate(async () => {
    const T = [];
    const ok = (n, c, x) => T.push((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' | ' + x));
    currentUser = { id:'U1', email:'a@a.com', username:'a@a.com', displayName:'בודק', role:'superadmin', firstLogin:false };
    DB.users=[{email:'a@a.com',username:'a@a.com',displayName:'בודק',role:'superadmin'}];
    DB.donors=[]; DB.campaigns=[{id:'C1',name:'מגבית',goal:1000,active:true}];
    DB.fundraisers=[]; DB.groups=[]; DB.nextFRCode=1; DB.settings={};
    document.getElementById('loginScreen').style.display='none';
    document.getElementById('appWrapper').style.display='flex';

    // 1. donor import via column mapper (no XLSX needed — inject parsed rows)
    _impHeaders = ['שם פרטי','שם משפחה','כתובת','פלאפון','מייל'];
    _impRawRows = [
      ['ראובן','כהן','הרצל 3, ירושלים','0501112222','r@x.com'],
      ['','','', '', ''],                    // empty row → skipped
      ['שמעון','לוי','','',''],
    ];
    _impColMap = {0:'firstName',1:'lastName',2:'address',3:'mobile',4:'email'};
    impDoImport();
    ok('import added 2 donors', DB.donors.length===2, DB.donors.length);
    ok('import codes unique', new Set(DB.donors.map(d=>d.code)).size===2, JSON.stringify(DB.donors.map(d=>d.code)));

    // duplicate import run — same names, no code column → generates new codes, does NOT dedupe (documented)
    // 2. Nedarim import matches by phone
    importNedarimRows([
      {'שם פרטי':'ראובן','שם משפחה':'כהן','נייד':'0501112222','סכום':180,'תאריך':45718,'אמצעי תשלום':'אשראי'},
      {'שם פרטי':'חדש','שם משפחה':'תורם','נייד':'0530000000','סכום':90,'תאריך':'2026-01-15'},
      {'שם פרטי':'בלי','שם משפחה':'סכום'},
    ]);
    const reuven = DB.donors.find(d=>d.firstName==='ראובן');
    ok('nedarim matched to existing', reuven.donations.length===1, JSON.stringify(reuven.donations));
    ok('nedarim excel-serial date parsed', /^202\d-\d\d-\d\d$/.test(reuven.donations[0].date), reuven.donations[0].date);
    ok('nedarim new donor created', DB.donors.some(d=>d.firstName==='חדש'), '');
    ok('nedarim rerun dedupes', (()=>{ importNedarimRows([{'שם פרטי':'ראובן','שם משפחה':'כהן','נייד':'0501112222','סכום':180,'תאריך':45718}]); return reuven.donations.length===1; })(), reuven.donations.length);

    // 3. Hebrew date correctness (Purim 5786 = 3 Mar 2026 → י"ד אדר)
    const heb = toHeb('2026-03-03');
    ok('toHeb Purim', heb.includes('יד') && heb.includes('אדר'), heb);
    const heb2 = toHeb('2025-09-23'); // Rosh Hashana 5786 eve → א תשרי is 23 Sep 2025
    ok('toHeb Tishrei', heb2.includes('תשרי'), heb2);

    // 4. FR import via mapper
    frImpRows = [{'שם פרטי':'תלמיד','שם משפחה':'אחד','שיעור':'וועד א','יעד':'1200'}];
    frImpHeaders = Object.keys(frImpRows[0]);
    document.getElementById('frImpMapperBody').innerHTML = frImpHeaders.map(h=>`<select data-col="${h}"><option selected value="${({'שם פרטי':'firstName','שם משפחה':'lastName','שיעור':'vaad','יעד':'target'})[h]}"></option></select>`).join('');
    frImpDoImport();
    ok('FR imported', DB.fundraisers.length===1 && DB.fundraisers[0].target===1200, JSON.stringify(DB.fundraisers));

    // 5. self-service portal with stubbed edge function
    // (run in a detached iframe-like flow: stub fetch, call the two functions)
    const realFetch = window.fetch;
    let submitted = null;
    window.fetch = async (url, opts) => {
      const body = JSON.parse(opts.body);
      if (body.action==='get') return { ok:true, json: async()=>({ donor:{ firstName:'ראובן', lastName:'כהן', address:'הרצל 3', phone:'', mobile:'0501112222', email:'r@x.com', _name:'ראובן כהן' } }) };
      submitted = body; return { ok:true, json: async()=>({ ok:true }) };
    };
    const bodyBackup = document.body.innerHTML;
    showSelfEditForm({ id:'D1', firstName:'ראובן', lastName:'כהן', address:'הרצל 3', phone:'', mobile:'0501112222', email:'r@x.com' }, 'TOK');
    document.getElementById('ss_firstName').value='ראובן משה';
    await submitSelfEdit('D1','TOK');
    ok('self-service submit posts edits', submitted && submitted.edits.firstName==='ראובן משה' && submitted.token==='TOK', JSON.stringify(submitted));
    ok('self-service success msg', document.getElementById('ss_result').textContent.includes('תודה') && !document.body.innerHTML.includes('לאישור המנהל'), document.getElementById('ss_result').textContent);
    window.fetch = realFetch;
    document.body.innerHTML = bodyBackup;

    // public add-donor form (stub server)
    let reg=null;
    window.fetch = async (url, opts) => { const b=JSON.parse(opts.body); if(b.action==='info') return {ok:true,json:async()=>({affiliations:['בוגר','מכר']})}; reg=b; return {ok:true,json:async()=>({ok:true})}; };
    const bk2=document.body.innerHTML;
    await showPublicAddForm();
    ok('public form rendered', !!document.getElementById('ss_affils') && document.getElementById('ss_affils').innerHTML.includes('מכר'), '');
    document.getElementById('ss_firstName').value='חדש'; document.getElementById('ss_lastName').value='מהטופס'; document.getElementById('ss_mobile').value='0501112223';
    document.querySelector('#ss_affils input').checked=true;
    await submitPublicAdd();
    ok('public form posts register', reg && reg.action==='register' && reg.edits.firstName==='חדש' && reg.edits.affils.length===1 && reg.edits.mobile==='0501112223', JSON.stringify(reg));
    ok('public form success text', document.getElementById('ss_result').textContent.includes('בהצלחה'), '');
    window.fetch = realFetch; document.body.innerHTML = bk2;

    // failed submit must show the server's reason (not a bare "try again")
    window.fetch = async (url, opts) => { const b=JSON.parse(opts.body); if(b.action==='get') return {ok:true,json:async()=>({donor:{firstName:'א',lastName:'ב'}})}; return {ok:false,json:async()=>({error:'save failed',detail:'read failed: permission denied'})}; };
    const bk3=document.body.innerHTML;
    showSelfEditForm({ id:'D1', firstName:'א', lastName:'ב' }, 'TOK', ['בוגר']);
    await submitSelfEdit('D1','TOK');
    ok('failed submit shows server reason', document.getElementById('ss_result').textContent.includes('permission denied'), document.getElementById('ss_result').textContent);
    window.fetch = realFetch; document.body.innerHTML = bk3;

    // admin diagnostics button explains a missing migration
    window.fetch = async () => ({ ok:true, json:async()=>({ ok:true, version:'t', dbRead:true, rpc:'missing', rpcError:'PGRST202 Could not find the function' }) });
    openSelfServicePanel();
    await runSelfServiceDiag();
    const diag = document.getElementById('ssDiagOut').textContent;
    ok('diag explains missing 0002 helpers', diag.includes('0002') && diag.includes('מסלול חלופי') && diag.includes('PGRST202'), diag);
    window.fetch = async () => ({ ok:false, json:async()=>({ error:'unknown action' }) });
    await runSelfServiceDiag();
    ok('diag detects old function version', document.getElementById('ssDiagOut').textContent.includes('גרסה ישנה'), document.getElementById('ssDiagOut').textContent);
    window.fetch = realFetch; closeModal('selfServiceModal');
    return { T };
  });

  out.T.forEach(t => console.log(t));
  console.log(errors.filter(e=>!e.includes('ERR_')).join('\n'));
  const fails = out.T.filter(t=>t.startsWith('FAIL')).length;
  console.log(fails ? fails + ' FAILURES' : 'ALL FLOW TESTS PASS');

  // 6. print generation: donor sheet opens a popup with table rows
  const page2 = await ctx.newPage();
  await page2.goto((process.env.QA_URL || 'http://localhost:8123/index.html'), { waitUntil: 'domcontentloaded' });
  await page2.waitForTimeout(1200);
  const [popup] = await Promise.all([
    ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null),
    page2.evaluate(() => {
      currentUser = { role:'superadmin', email:'a@a.com', username:'a@a.com', displayName:'x' };
      DB.donors=[{id:'D1',code:'T1',firstName:'משה',lastName:'לוי',address:'הרצל 1, ירושלים',phone:'02-1',mobile:'050-1',donations:[{id:'d1',amount:100,date:'2025-01-01',method:'מזומן',campaignId:'C1'}],futureDonations:[],relations:[],lat:31.7,lng:35.2}];
      DB.campaigns=[{id:'C1',name:'מגבית',goal:1000,active:true,year:'תשפ"ו'}];
      DB.groups=[{id:'G1',code:'1101',name:'קבוצה',vaad:'וועד א',memberIds:[],donorIds:['D1'],routeIds:[],target:0}];
      printFundraisingSheet('G1');
    }),
  ]);
  if (popup) {
    await popup.waitForTimeout(700);
    const rows = await popup.evaluate(() => document.querySelectorAll('tbody tr').length);
    const hasCur = await popup.evaluate(() => !!document.querySelector('.curc'));
    console.log(rows === 1 && hasCur ? 'PASS print sheet generated' : 'FAIL print sheet | rows=' + rows);
  } else console.log('FAIL print popup did not open');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
