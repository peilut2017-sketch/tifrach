const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto((process.env.QA_URL || 'http://localhost:8123/index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const results = await page.evaluate(() => {
    const T = [];
    const eq = (name, got, want) => T.push((JSON.stringify(got) === JSON.stringify(want) ? 'PASS ' : 'FAIL ') + name + (JSON.stringify(got) === JSON.stringify(want) ? '' : ` | got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
    const ok = (name, cond, extra) => T.push((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' | ' + (extra||'')));
    const D = (o) => JSON.parse(JSON.stringify(o));

    const donor = (over) => ({ id:'D1', code:'T1', firstName:'משה', lastName:'לוי', phone:'02-1', address:'רחוב א', updatedAt:'2026-01-01T00:00:00Z', donations:[{id:'dn1',amount:100,date:'2026-01-01',method:'מזומן'}], futureDonations:[], relations:[], ...over });
    const mkdb = (donors, over) => ({ donors, users:[], campaigns:[], fundraisers:[], groups:[], fundraisingDates:[], routes:[], expenses:[], messages:[], pendingEdits:[], auditLog:[], settings:{}, nextCode:1001, nextFRCode:1, nextGrpSeq:{}, ...over });

    // 1. non-overlapping field edits on the SAME donor merge per-field
    {
      const base = mkdb([donor()]);
      const local = mkdb([donor({ phone:'02-9', updatedAt:'2026-01-02T00:00:00Z' })]);
      const remote = mkdb([donor({ address:'רחוב ב', updatedAt:'2026-01-03T00:00:00Z' })]);
      const r = _merge3DB(D(base), D(local), D(remote)).merged.donors[0];
      eq('field-merge phone', r.phone, '02-9');
      eq('field-merge address', r.address, 'רחוב ב');
    }
    // 2. same field changed on both sides → newer updatedAt wins
    {
      const base = mkdb([donor()]);
      const local = mkdb([donor({ phone:'LOCAL', updatedAt:'2026-01-05T00:00:00Z' })]);
      const remote = mkdb([donor({ phone:'REMOTE', updatedAt:'2026-01-04T00:00:00Z' })]);
      const r = _merge3DB(D(base), D(local), D(remote)).merged.donors[0];
      eq('conflict newer wins (local newer)', r.phone, 'LOCAL');
      const r2 = _merge3DB(D(base), D(mkdb([donor({ phone:'LOCAL', updatedAt:'2026-01-04T00:00:00Z' })])), D(mkdb([donor({ phone:'REMOTE', updatedAt:'2026-01-05T00:00:00Z' })]))).merged.donors[0];
      eq('conflict newer wins (remote newer)', r2.phone, 'REMOTE');
    }
    // 3. donation added on both sides → both kept
    {
      const base = mkdb([donor()]);
      const l = donor({ updatedAt:'2026-01-02T00:00:00Z' }); l.donations = [...l.donations, {id:'dnL',amount:50,date:'2026-01-02',method:'מזומן'}];
      const rm = donor({ updatedAt:'2026-01-03T00:00:00Z' }); rm.donations = [...rm.donations, {id:'dnR',amount:70,date:'2026-01-03',method:'אשראי'}];
      const r = _merge3DB(D(base), D(mkdb([l])), D(mkdb([rm]))).merged.donors[0];
      eq('both new donations kept', r.donations.map(d=>d.id).sort(), ['dn1','dnL','dnR']);
    }
    // 4. remote deleted donor, local unchanged → stays deleted
    {
      const base = mkdb([donor()]);
      const r = _merge3DB(D(base), D(base), D(mkdb([]))).merged.donors;
      eq('delete propagates', r.length, 0);
    }
    // 5. remote deleted donor, local EDITED → edit survives
    {
      const base = mkdb([donor()]);
      const local = mkdb([donor({ phone:'02-9', updatedAt:'2026-01-02T00:00:00Z' })]);
      const r = _merge3DB(D(base), D(local), D(mkdb([]))).merged.donors;
      eq('edit survives delete', r.map(d=>d.id), ['D1']);
    }
    // 6. counters take the max
    {
      const base = mkdb([], { nextCode: 1005 });
      const r = _merge3DB(D(base), D(mkdb([], { nextCode: 1007 })), D(mkdb([], { nextCode: 1010 }))).merged;
      eq('nextCode max', r.nextCode, 1010);
    }
    // 7. same donation edited on both sides (same id) → one record, newer donor wins that field set
    {
      const base = mkdb([donor()]);
      const l = donor({ updatedAt:'2026-01-05T00:00:00Z' }); l.donations = [{id:'dn1',amount:150,date:'2026-01-01',method:'מזומן'}];
      const rm = donor({ updatedAt:'2026-01-04T00:00:00Z' }); rm.donations = [{id:'dn1',amount:200,date:'2026-01-01',method:'מזומן'}];
      const r = _merge3DB(D(base), D(mkdb([l])), D(mkdb([rm]))).merged.donors[0];
      ok('edited donation stays single', r.donations.length === 1, JSON.stringify(r.donations));
    }
    // 8. donation deleted locally, untouched remotely → stays deleted (no resurrection)
    {
      const base = mkdb([donor()]);
      const l = donor({ updatedAt:'2026-01-05T00:00:00Z' }); l.donations = [];
      const r = _merge3DB(D(base), D(mkdb([l])), D(base)).merged.donors[0];
      eq('donation delete propagates', r.donations.length, 0);
    }
    // 9. no base (fresh client) — union without data loss
    {
      const local = mkdb([donor({ id:'D1' })]);
      const remote = mkdb([donor({ id:'D2', code:'T2' })]);
      const r = _merge3DB(null, D(local), D(remote)).merged.donors.map(d=>d.id).sort();
      eq('no-base union', r, ['D1','D2']);
    }
    // 10. settings object merge: local adds key, remote adds key
    {
      const base = mkdb([], { settings: { titles:['א'] } });
      const l = mkdb([], { settings: { titles:['א'], googleMapsKey:'K' } });
      const rm = mkdb([], { settings: { titles:['א','ב'] } });
      const r = _merge3DB(D(base), D(l), D(rm)).merged.settings;
      ok('settings both keys', r.googleMapsKey === 'K' && JSON.stringify(r.titles) === JSON.stringify(['א','ב']), JSON.stringify(r));
    }
    return T;
  });

  results.forEach(r => console.log(r));
  const fails = results.filter(r => r.startsWith('FAIL')).length;
  console.log(fails ? `${fails} FAILURES` : 'ALL MERGE TESTS PASS');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
