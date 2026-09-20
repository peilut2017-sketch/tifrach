const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto((process.env.QA_URL || 'http://localhost:8123/index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    currentUser={id:'U1',email:'t@t.com',username:'t@t.com',displayName:'בודק',role:'superadmin',firstLogin:false};
    DB.users=[{email:'t@t.com',role:'superadmin'}];
    DB.campaigns=[{id:'C1',name:'מגבית פורים',goal:100000,deadline:'2026-12-01',active:true}];
    DB.donors=Array.from({length:12},(_,i)=>({id:'D'+i,code:'T10'+i,firstName:'תורם',lastName:'מס '+i,address:'הרצל '+i+', ירושלים',phone:'02-555000'+i,mobile:'05212345'+String(i).padStart(2,'0'),email:'d'+i+'@x.com',donations:[{id:'dn'+i,amount:100*(i+1),date:'2026-01-0'+(i%9+1),method:'מזומן',campaignId:'C1'}],futureDonations:[],relations:[]}));
    DB.fundraisers=[];DB.groups=[];DB.routes=[];DB.expenses=[];
    document.getElementById('loginScreen').style.display='none';
    document.getElementById('appWrapper').style.display='flex';
    initSidebar(); setupNavForRole(); showPage('donors');
  });
  await page.waitForTimeout(600);
  const vis = await page.evaluate(() => {
    const cards = document.getElementById('donorsCardsMobile');
    const table = document.querySelector('.donor-table-desktop');
    return {
      cardsVisible: cards && getComputedStyle(cards).display !== 'none' && cards.children.length,
      tableHidden: table && getComputedStyle(table).display === 'none',
      hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    };
  });
  console.log('mobile donors:', JSON.stringify(vis));
  await page.screenshot({ path: 'mob-donors.png', fullPage: false });
  await page.evaluate(() => showPage('dash'));
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'mob-dash.png', fullPage: false });
  const hs2 = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  console.log('dash h-scroll:', hs2);
  console.log(errors.filter(e=>!e.includes('ERR_')).join('\n')||'(no page errors)');
  await browser.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
