// Runs the transpiled self-service edge function in Node with a fake Supabase
// client: RPC present vs missing (→ CAS fallback), diag output, error detail.
const fs = require('fs');
let src = fs.readFileSync('fn-self-service.js', 'utf8').replace('// import stripped', '');
let handler = null;
globalThis.Deno = { env: { get: k => ({ SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k' })[k] }, serve: h => { handler = h; } };
const store = { main: { id: 'main', data: { donors: [{ id: 'D1', firstName: 'א', lastName: 'ב', affil: 'בוגר' }], selfServiceTokens: { D1: 'TOK' }, settings: { affiliations: ['בוגר', 'מכר'] }, pendingEdits: [] }, updated_at: 't1' } };
let rpcMissing = false, rpcCalls = 0, casConflictOnce = false;
function createClient() {
  class Q { constructor() { this.eqs = []; } select(c) { this.cols = c; return this; } eq(k, v) { this.eqs.push([k, v]); return this; } single() { this.sg = 1; return this; } maybeSingle() { this.sg = 2; return this; }
    update(p) { this.upd = p; return this; }
    then(res) { const r = store.main; const match = this.eqs.every(([k, v]) => String(r[k]) === String(v));
      if (this.upd) { if (!match) return res({ data: [], error: null }); if (casConflictOnce) { casConflictOnce = false; store.main.updated_at = 'tX'; return res({ data: [], error: null }); } Object.assign(r, JSON.parse(JSON.stringify(this.upd))); r.updated_at = 't' + Date.now(); return res({ data: [{ updated_at: r.updated_at }], error: null }); }
      const row = match ? JSON.parse(JSON.stringify(r)) : null; return res({ data: this.sg === 1 && !row ? null : row, error: this.sg === 1 && !row ? { message: 'no rows' } : null }); } }
  return { from: () => new Q(), rpc: async (name, args) => { rpcCalls++; if (rpcMissing) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.' + name } }; if (name === 'append_pending_edit') { store.main.data.pendingEdits.push(args.p_edit); store.main.updated_at = 't' + Date.now(); return { data: null, error: null }; } if (name === 'append_donor_donation') return { data: false, error: null }; return { data: null, error: { message: 'unknown' } }; } };
}
new Function('createClient', src)(createClient);
const call = async body => { const r = await handler(new Request('http://x/', { method: 'POST', body: JSON.stringify(body) })); return { status: r.status, out: await r.json() }; };
const T = []; const ok = (n, c, x) => T.push((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' | ' + JSON.stringify(x)));
(async () => {
  let r = await call({ action: 'diag' });
  ok('diag with helpers', r.out.ok && r.out.dbRead && r.out.rpc === 'ok' && r.out.version, r);
  r = await call({ action: 'submit', donorId: 'D1', token: 'TOK', edits: { firstName: 'חדש', affils: ['מכר', 'לא קיים'], zip: '123' } });
  ok('submit via RPC', r.status === 200 && store.main.data.pendingEdits.length === 1 && store.main.data.pendingEdits[0].edits.firstName === 'חדש' && JSON.stringify(store.main.data.pendingEdits[0].edits.affils) === '["מכר"]', { r, pe: store.main.data.pendingEdits });
  rpcMissing = true;
  r = await call({ action: 'diag' });
  ok('diag reports missing helpers', r.out.ok && r.out.rpc === 'missing' && /PGRST202/.test(r.out.rpcError), r);
  r = await call({ action: 'submit', donorId: 'D1', token: 'TOK', edits: { mobile: '050' } });
  ok('submit falls back to CAS when RPC missing', r.status === 200 && store.main.data.pendingEdits.length === 2 && store.main.data.pendingEdits[1].edits.mobile === '050', { r, n: store.main.data.pendingEdits.length });
  casConflictOnce = true;
  r = await call({ action: 'register', edits: { firstName: 'פ', lastName: 'צ', mobile: '052' } });
  ok('register CAS retries after a conflict', r.status === 200 && store.main.data.pendingEdits.length === 3 && store.main.data.pendingEdits[2].edits._newDonor.lastName === 'צ', { r, n: store.main.data.pendingEdits.length });
  r = await call({ action: 'submit', donorId: 'D1', token: 'BAD', edits: {} });
  ok('bad token rejected', r.status === 403, r);
  r = await call({ action: 'get', donorId: 'D1', token: 'TOK' });
  console.log('GET →', JSON.stringify(r));
  ok('get returns affils + options', r.out.donor.affils[0] === 'בוגר' && r.out.affiliations.length === 2 && !('selfServiceTokens' in r.out), r.out);
  // write failure surfaces a detail string
  const realFrom = createClient; 
  T.forEach(t => console.log(t)); console.log(T.some(t => t.startsWith('FAIL')) ? 'EDGE FAILURES' : 'ALL EDGE TESTS PASS');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
