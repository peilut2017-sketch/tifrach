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

// deliver a broadcast into a page (called from Node for every OTHER page)
const RT_DELIVER = `window.__rtDeliver = (json) => { const m = JSON.parse(json); ((window.__rtHandlers||{})[m.event]||[]).forEach(cb => { try { cb({ event: m.event, type: 'broadcast', payload: m.payload }); } catch(e) { console.error('rt handler', e); } }); };`;
const FAKE_CLIENT = RT_DELIVER + `
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
    channel: () => { const h = {}; window.__rtHandlers = h; return { on(t, f, cb){ (h[f.event] = h[f.event] || []).push(cb); return this; }, subscribe(){ return this; }, send: async (m) => { if (window.__rtSend) await window.__rtSend(JSON.stringify(m)); return 'ok'; }, unsubscribe: async()=>({}) }; },
    removeChannel: async()=>({}),
    functions: { invoke: async () => ({ data:null, error:null }) },
    rpc: async () => ({ data:null, error:null }),
  };
}};`;


// wire N pages into one relay: each page's send() fans out to the others
async function wireRelay(pages) {
  for (const pg of pages) {
    await pg.exposeFunction('__rtSend', async (json) => { for (const other of pages) if (other !== pg) { try { await other.evaluate(j => window.__rtDeliver(j), json); } catch(e) {} } });
  }
}
module.exports = { rows, seed, serve, log, pgNow, serverAppendPending, serverEditDonor, FAKE_CLIENT, wireRelay };
