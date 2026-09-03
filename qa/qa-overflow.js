const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  await page.goto((process.env.QA_URL || 'http://localhost:8123/index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    currentUser={id:'U1',email:'t@t.com',username:'t@t.com',displayName:'בודק',role:'superadmin',firstLogin:false};
    DB.users=[{email:'t@t.com',role:'superadmin'}];
    DB.campaigns=[{id:'C1',name:'מגבית פורים',goal:100000,deadline:'2026-12-01',active:true}];
    DB.donors=[{id:'D1',code:'T1',firstName:'א',lastName:'ב',address:'הרצל 1',donations:[{id:'d1',amount:100,date:'2026-01-01',method:'מזומן',campaignId:'C1'}],futureDonations:[],relations:[]}];
    DB.fundraisers=[];DB.groups=[];DB.routes=[];DB.expenses=[];
    document.getElementById('loginScreen').style.display='none';
    document.getElementById('appWrapper').style.display='flex';
    initSidebar(); setupNavForRole();
  });
  for (const pg of ['dash','donors']) {
    await page.evaluate(p => showPage(p), pg);
    await page.waitForTimeout(400);
    const wide = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const out = [];
      const sb = document.getElementById('sidebar');
      document.querySelectorAll('body *').forEach(el => {
        if (sb && !sb.classList.contains('mobile-open') && (el === sb || sb.contains(el))) return; // closed drawer is parked off-canvas by design
        const r = el.getBoundingClientRect();
        if (r.width > vw + 3 || r.right > vw + 3 && r.width > 50) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || !el.offsetParent && cs.position !== 'fixed') return;
          out.push(`${el.tagName}.${(el.className||'').toString().slice(0,40)}#${el.id||''} w=${Math.round(r.width)} right=${Math.round(r.right)}`);
        }
      });
      return out.slice(0, 12);
    });
    console.log('== ' + pg + ' ==');
    wide.forEach(w => console.log(w));
  }
  await browser.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
