const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto((process.env.QA_URL || 'http://localhost:8123/index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const out = await page.evaluate(async () => {
    const T = [];
    const ok = (n,c,x)=>T.push((c?'PASS ':'FAIL ')+n+(c?'':' | '+x));
    currentUser={id:'U2',email:'v@v.com',username:'v@v.com',displayName:'מבקר',role:'viewer',firstLogin:false};
    DB.users=[{email:'v@v.com',username:'v@v.com',displayName:'מבקר',role:'viewer'}];
    DB.donors=[{id:'D1',code:'T1',firstName:'א',lastName:'ב',donations:[{id:'d1',amount:10,date:'2026-01-01',method:'מזומן'}],futureDonations:[],relations:[]}];
    DB.campaigns=[]; DB.fundraisers=[]; DB.groups=[]; DB.routes=[]; DB.expenses=[];
    document.getElementById('loginScreen').style.display='none';
    document.getElementById('appWrapper').style.display='flex';
    initSidebar(); setupNavForRole();
    showPage('donors'); await new Promise(r=>setTimeout(r,200));
    ok('sidebar admin hidden', document.getElementById('sb-admin').style.display==='none','');
    ok('sidebar add-donor hidden', document.getElementById('sb-add-donor').style.display==='none','');
    ok('sidebar IO hidden', document.getElementById('sb-exportwiz').style.display==='none','');
    // gates actually block
    const before=DB.donors.length;
    openNewDonorModal();
    ok('new donor blocked', !document.getElementById('donorModal').classList.contains('open'),'');
    openIOCenter('excel');
    ok('IO center blocked', !document.getElementById('ioCenterModal').classList.contains('open'),'');
    quickExcelExport('donors');
    exportExpensesExcel();
    rpPrint();
    printCampaignSummary();
    ok('no donors added', DB.donors.length===before,'');
    // rows show no edit/delete buttons
    ok('no row delete btn', !document.getElementById('donorsBody').innerHTML.includes('deleteDonorRow'),'');
    // donor modal opens read-only (view allowed) without save/delete buttons
    openDonorModal('D1');
    ok('save btn hidden', document.getElementById('saveDonorBtnTop').style.display==='none','');
    ok('delete btn hidden', document.getElementById('deleteDonorBtn').style.display==='none','');
    closeModal('donorModal');
    return T;
  });
  out.forEach(t=>console.log(t));
  console.log(errors.filter(e=>!e.includes('ERR_')).join('\n')||'(no page errors)');
  await browser.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
