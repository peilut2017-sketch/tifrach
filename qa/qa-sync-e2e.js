// End-to-end sync test: real app boot (session restore → loadDB → _setupSession)
// against a fake Supabase server that emulates PostgREST + the updated_at trigger
// + compare-and-swap semantics. Verifies that donor edits reach the server,
// survive concurrent writes, polling, and a page reload.
const { chromium } = require('playwright');

// ── fake server (Node side, survives page reloads) ──
let _t = Date.now();
const pgNow = () => { _t = Math.max(_t + 1, Date.now()); const d = new Date(_t); return d.toISOString().replace('Z', '') + '123+00:00'; };
const rows = {};
const seed = () => {
  rows.main = { id: 'main', updated_at: pgNow(), data: {
    users: [{ email: 'a@a.com', username: 'a@a.com', displayName: 'בודק', role: 'superadmin', firstLogin: false }],
    donors: [
      { id: 'D1', code: '1001', firstName: 'משה', lastName: 'לוי', phone: '02-111', mobile: '', address: 'הרצל 1', affil: 'בוגר', fundraiserId: '', donations: [{ id: 'dn1', amount: 100, date: '2026-01-01', method: 'מזומן', campaignId: 'C1' }], futureDonations: [], relations: [], createdAt: '2025-01-01T00:00:00', updatedAt: '2025-01-01T00:00:00' },
      { id: 'D2', code: '1002', firstName: 'דוד', lastName: 'כהן', phone: '', mobile: '050-222', address: 'יפו 2', affil: 'מכר', donations: [], futureDonations: [], relations: [], createdAt: '2025-01-01T00:00:00', updatedAt: '2025-01-01T00:00:00' },
    ],
    campaigns: [{ id: 'C1', name: 'מגבית', goal: 1000, active: true }],
    fundraisers: [], groups: [], routes: [], expenses: [], pendingEdits: [],
    selfServiceTokens: { D1: 'TOK' },
    settings: { affiliations: ['תלמיד', 'בוגר', 'מכר'] },
    nextCode: 1003,
  } };
};
seed();
const log = [];
function serve(req) {
  const { table, op, payload, eqs, like, single, cols } = req;
  log.push(op + ' ' + JSON.stringify(eqs));
  const match = r => (eqs || []).every(([k, v]) => String(r[k]) === String(v)) && (!like || new RegExp('^' + like[1].replace('%', '.*') + '$').test(r[like[0]]));
  const pick = r => { const o = {}; (cols || 'id,data,updated_at').split(',').forEach(c => o[c.trim()] = r[c.trim()]); return JSON.parse(JSON.stringify(o)); };
  let out = [];
  if (op === 'select') out = Object.values(rows).filter(match).map(pick);
  else if (op === 'update') {
    Object.values(rows).filter(match).forEach(r => { Object.assign(r, JSON.parse(JSON.stringify(payload))); r.updated_at = pgNow(); out.push(pick(r)); });
  } else if (op === 'upsert') {
    const r = rows[payload.id] || (rows[payload.id] = { id: payload.id });
    Object.assign(r, JSON.parse(JSON.stringify(payload))); r.updated_at = pgNow(); out.push(pick(r));
  } else if (op === 'insert') {
    if (rows[payload.id]) return { data: null, error: { message: 'duplicate key' } };
    rows[payload.id] = { ...JSON.parse(JSON.stringify(payload)), updated_at: pgNow() }; out.push(pick(rows[payload.id]));
  } else if (op === 'delete') { Object.values(rows).filter(match).forEach(r => delete rows[r.id]); }
  if (single === 'single') return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } };
  if (single === 'maybeSingle') return { data: out[0] || null, error: null };
  return { data: out, error: null };
}
// what an Edge Function does (SQL append via RPC → trigger bumps updated_at)
function serverAppendPending(pe) { rows.main.data.pendingEdits = rows.main.data.pendingEdits || []; rows.main.data.pendingEdits.push(pe); rows.main.updated_at = pgNow(); }
function serverEditDonor(id, patch) { const d = rows.main.data.donors.find(x => x.id === id); Object.assign(d, patch); rows.main.updated_at = pgNow(); }

const FAKE_CLIENT = `
window.supabase = { createClient: () => {
  class Q { constructor(t){ this.t=t; this.op='select'; this.eqs=[]; this.cols='*'; }
    select(c){ if(this.op==='select') this.cols=c; else this.retCols=c; return this; }
    eq(k,v){ this.eqs.push([k,v]); return this; }
    like(k,v){ this.lk=[k,v]; return this; } limit(){ return this; } order(){ return this; }
    update(p){ this.op='update'; this.payload=p; return this; }
    upsert(p){ this.op='upsert'; this.payload=p; return this; }
    insert(p){ this.op='insert'; this.payload=p; return this; }
    delete(){ this.op='delete'; return this; }
    single(){ this.sg='single'; return this; }
    maybeSingle(){ this.sg='maybeSingle'; return this; }
    then(res, rej){ return window.__srv(JSON.stringify({ table:this.t, op:this.op, payload:this.payload, eqs:this.eqs, like:this.lk, single:this.sg, cols:(this.op==='select'?this.cols:this.retCols)==='*'?undefined:(this.op==='select'?this.cols:this.retCols) })).then(r=>res(JSON.parse(r)), rej); }
  }
  return {
    auth: {
      getSession: async () => ({ data: { session: { user: { id:'U1', email:'a@a.com' } } } }),
      getUser: async () => ({ data: { user: { id:'U1', email:'a@a.com' } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe(){} } } }),
      signOut: async () => ({}), signInWithPassword: async () => ({ data: { user: { id:'U1', email:'a@a.com' } } }),
    },
    from: t => new Q(t),
    channel: () => ({ on(){ return this; }, subscribe(){ return this; }, send: async()=>({}), unsubscribe: async()=>({}) }),
    removeChannel: async()=>({}),
    functions: { invoke: async () => ({ data:null, error:null }) },
    rpc: async () => ({ data:null, error:null }),
  };
}};`;

(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') { const t = m.text(); if (!t.includes('Failed to load resource')) errors.push('CONSOLE: ' + t); } });
  page.on('dialog', d => { errors.push('DIALOG: ' + d.message()); d.accept(); });
  await page.exposeFunction('__srv', req => JSON.stringify(serve(JSON.parse(req))));
  await page.addInitScript(FAKE_CLIENT);
  const T = [];
  const ok = (n, c, x) => T.push((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' | ' + (typeof x === 'string' ? x : JSON.stringify(x))));
  const boot = async () => {
    await page.goto((process.env.QA_URL || 'http://localhost:8123/index.html'), { waitUntil: 'domcontentloaded' });
    try { await page.waitForFunction(() => (typeof currentUser!=='undefined' && currentUser) && document.getElementById('appWrapper').style.display === 'flex', null, { timeout: 8000 }); }
    catch (e) {
      const diag = await page.evaluate(() => ({ cu: (typeof currentUser!=='undefined' && !!currentUser), login: document.getElementById('loginScreen').style.display, loader: !!document.getElementById('bootLoader'), donors: (window.DB && DB.donors || []).length, err: document.getElementById('loginError')?.textContent, sbType: typeof supabase }));
      console.log('BOOT DIAG', JSON.stringify(diag), '\nERRORS', errors.join('\n'), '\nSERVER LOG', log.join(' ; '));
      throw e;
    }
  };
  const srvDonor = id => rows.main.data.donors.find(d => d.id === id);

  // 1. boot from a real session
  await boot();
  const b = await page.evaluate(() => ({ known: _lastKnownCloudUpdatedAt, base: !!_baseDB, n: DB.donors.length, affils: DB.donors[0].affils, loader: !!document.getElementById('bootLoader'), login: document.getElementById('loginScreen').style.display }));
  ok('boot: session restored, DB loaded from server', b.known && b.base && b.n === 2, b);
  ok('boot: affils migrated', Array.isArray(b.affils) && b.affils[0] === 'בוגר', b);
  ok('boot: loader gone, login hidden', !b.loader && b.login === 'none', b);

  // 2. edit a donor through the real UI → saved on the server?
  await page.evaluate(() => openDonorModal('D1'));
  await page.fill('#f_phone', '03-999');
  await page.fill('#f_zip', '91000');
  await page.click('#saveDonorBtnTop');
  await page.waitForTimeout(2500);
  let st = await page.evaluate(() => ({ dirty: _dirty, dot: document.getElementById('syncStatusDot')?.title, local: DB.donors.find(d => d.id === 'D1').phone, dirtyFlag: localStorage.getItem('donorDB_dirty') }));
  ok('edit: phone saved on server', srvDonor('D1').phone === '03-999' && srvDonor('D1').zip === '91000', { srv: srvDonor('D1').phone, st });
  ok('edit: client clean after push', st.dirty === false && st.dirtyFlag === '0' && /מסונכרן/.test(st.dot || ''), st);
  ok('edit: audit entry on server carries donorId', (rows.main.data.auditLog || []).some(e => e.meta && e.meta.donorId === 'D1' && /03-999/.test(e.description)), (rows.main.data.auditLog || []).slice(0, 2));

  // 3. concurrent writes: Edge Function appends a pending edit + another client edits D2 → CAS conflict on our next push
  serverAppendPending({ id: 'PE1', donorId: 'D1', edits: { address: 'חדש 5', affils: ['בוגר', 'מכר'], zip: '12345' }, ts: new Date().toISOString(), token: 'TOK' });
  serverEditDonor('D2', { mobile: '050-333', updatedAt: new Date().toISOString() });
  await page.evaluate(() => openDonorModal('D1'));
  await page.fill('#f_mobile', '050-111');
  await page.click('#saveDonorBtnTop');
  await page.waitForTimeout(3000);
  st = await page.evaluate(() => ({ dirty: _dirty, d1: DB.donors.find(d => d.id === 'D1'), d2: DB.donors.find(d => d.id === 'D2').mobile, pe: (DB.pendingEdits || []).length }));
  ok('CAS conflict: our edit reached the server', srvDonor('D1').mobile === '050-111' && srvDonor('D1').phone === '03-999', srvDonor('D1'));
  ok('CAS conflict: their edits kept on server', srvDonor('D2').mobile === '050-333' && (rows.main.data.pendingEdits || []).length === 1, { d2: srvDonor('D2').mobile, pe: rows.main.data.pendingEdits });
  ok('CAS conflict: local merged both sides', st.dirty === false && st.d2 === '050-333' && st.pe === 1 && st.d1.mobile === '050-111', st);

  // 4. the 10s poll must not revert anything
  await page.waitForTimeout(11000);
  st = await page.evaluate(() => ({ d1: DB.donors.find(d => d.id === 'D1'), known: _lastKnownCloudUpdatedAt }));
  ok('poll: no revert after 10s poll', st.d1.phone === '03-999' && st.d1.mobile === '050-111' && st.known === rows.main.updated_at, { st, srv: rows.main.updated_at });

  // 5. approve the pending self-service edit → applied + pushed
  await page.evaluate(() => approvePendingEdit(0));
  await page.waitForTimeout(2500);
  ok('approve: pending edit applied on server', srvDonor('D1').address === 'חדש 5' && srvDonor('D1').zip === '12345' && JSON.stringify(srvDonor('D1').affils) === '["בוגר","מכר"]' && srvDonor('D1').affil === 'בוגר, מכר' && (rows.main.data.pendingEdits || []).length === 0, srvDonor('D1'));

  // 6. edit then reload immediately (before the 800ms debounce) → boot merge must recover it
  await page.evaluate(() => openDonorModal('D1'));
  await page.fill('#f_email', 'm@l.com');
  await page.click('#saveDonorBtnTop');
  await page.waitForTimeout(100);
  const dirtyBefore = await page.evaluate(() => localStorage.getItem('donorDB_dirty'));
  await boot();
  await page.waitForTimeout(2500);
  st = await page.evaluate(() => ({ d1: DB.donors.find(d => d.id === 'D1'), dirty: _dirty }));
  ok('reload: unsynced edit recovered and pushed', dirtyBefore === '1' && st.d1.email === 'm@l.com' && srvDonor('D1').email === 'm@l.com' && st.dirty === false, { dirtyBefore, local: st.d1.email, srv: srvDonor('D1').email });
  ok('reload: earlier edits intact', st.d1.phone === '03-999' && st.d1.mobile === '050-111' && st.d1.address === 'חדש 5', st.d1);

  // 7. server changed while the modal is open (another user) → after our save both survive
  await page.evaluate(() => openDonorModal('D1'));
  serverEditDonor('D1', { notes: 'הערה מהמשתמש השני', updatedAt: new Date(Date.now() - 1000).toISOString() });
  await page.waitForTimeout(500);
  await page.fill('#f_cohort', 'תשע"ה');
  await page.click('#saveDonorBtnTop');
  await page.waitForTimeout(3000);
  st = await page.evaluate(() => DB.donors.find(d => d.id === 'D1'));
  ok('field-level merge: both users\' fields kept', srvDonor('D1').cohort === 'תשע"ה' && srvDonor('D1').notes === 'הערה מהמשתמש השני' && st.notes === 'הערה מהמשתמש השני', { srv: srvDonor('D1'), local: st });

  // 8. quick donation + donor create → on server
  await page.evaluate(() => { openNewDonorModal(); });
  await page.fill('#f_firstName', 'חדש');
  await page.fill('#f_lastName', 'תורם');
  await page.click('#saveDonorBtnTop');
  await page.waitForTimeout(2500);
  ok('create: new donor on server', rows.main.data.donors.some(d => d.firstName === 'חדש'), rows.main.data.donors.map(d => d.firstName));

  T.forEach(t => console.log(t));
  console.log('page errors:', errors.length ? errors.join('\n') : 'none');
  console.log('server ops:', log.length);
  const fails = T.filter(t => t.startsWith('FAIL')).length;
  console.log(fails ? fails + ' FAILURES' : 'ALL SYNC E2E TESTS PASS');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
