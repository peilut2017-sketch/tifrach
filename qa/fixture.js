// Rich, realistic fixture shared by the crash-hunt / a11y / perf tests.
function bigFixture(nDonors = 60) {
  const first = ['משה', 'דוד', 'יוסף', 'אברהם', 'יצחק', 'יעקב', 'שמעון', 'לוי', 'ראובן', 'בנימין', 'אליהו', 'מאיר'];
  const last = ['כהן', 'לוי', 'ישראלי', 'מזרחי', 'פרץ', 'ביטון', 'אוחיון', 'דהן', 'אזולאי', 'פרידמן', 'שפירא', 'גולדברג'];
  const streets = ['הרצל', 'יפו', 'בן יהודה', 'המלך ג\'ורג\'', 'רמות', 'שמואל הנביא', 'בר אילן', 'סורוצקין', 'מלכי ישראל', 'עזרא'];
  const cities = ['ירושלים', 'בני ברק', 'בית שמש', 'אלעד', 'מודיעין עילית'];
  const affils = ['בוגר', 'תלמיד', 'הורה תלמיד', 'מכר', 'עסקי'];
  const methods = ['מזומן', 'אשראי', "צ'ק", 'העברה בנקאית'];
  const donors = [];
  for (let i = 0; i < nDonors; i++) {
    const fn = first[i % first.length], ln = last[(i * 7) % last.length];
    const donations = [];
    for (let k = 0; k < (i % 4); k++) donations.push({ id: 'dn' + i + '_' + k, amount: 100 + (i * 37 + k * 50) % 900, date: `202${5 + (k % 2)}-0${1 + (k % 9)}-1${k}`, method: methods[(i + k) % methods.length], campaignId: k % 2 ? 'C1' : 'C2', fundraiserId: i % 3 === 0 ? 'F1' : '', groupId: i % 5 === 0 ? 'G1' : '' });
    donors.push({
      id: 'D' + i, code: String(1001 + i), title: i % 5 === 0 ? 'הרב' : '', firstName: fn, lastName: ln,
      address: `${streets[i % streets.length]} ${1 + i % 40}, ${cities[i % cities.length]}`, entrance: i % 3 ? '' : 'קומה 2', zip: i % 2 ? '9100000' : '',
      phone: i % 2 ? `02-${5000000 + i}` : '', mobile: `05${i % 9}-${1000000 + i * 13}`, email: i % 3 ? `d${i}@mail.com` : '',
      idNumber: i % 4 ? String(100000000 + i) : '', affil: affils[i % affils.length], affils: [affils[i % affils.length]],
      prefTime: i % 2 ? 'טלפוני לפני פורים' : 'פורים בבית', marriageYear: i % 3 ? 'תשע"ה' : '', marriageMonth: i % 3 ? 'ניסן' : '', cohort: i % 2 ? 'תשס"ט' : '',
      notes: i % 6 === 0 ? 'הערה חשובה' : '', cardNotes: '', status: i % 17 === 0 ? 'inactive' : 'active', rating: String(1 + i % 5),
      lat: i % 7 ? 31.78 + (i % 20) * 0.003 : null, lng: i % 7 ? 35.21 + (i % 20) * 0.003 : null, geocodedCity: i % 7 ? cities[i % cities.length] : '', geocodedNbh: i % 14 ? '' : 'רמות',
      donations, futureDonations: i % 5 === 0 ? [{ id: 'fd' + i, date: '2026-12-01', expectedAmount: 500, campaignId: 'C1', notes: '' }] : [],
      relations: i % 8 === 0 ? [{ donorId: 'D' + ((i + 1) % nDonors), type: 'הורה' }] : [],
      createdAt: '2025-01-01T00:00:00', updatedAt: '2026-01-01T00:00:00',
    });
  }
  return {
    users: [
      { email: 'a@a.com', username: 'a@a.com', displayName: 'אברהם כהן', role: 'superadmin', firstLogin: false },
      { email: 'b@b.com', username: 'b@b.com', displayName: 'ברוך לוי', role: 'editor', firstLogin: false },
    ],
    donors,
    campaigns: [{ id: 'C1', name: 'מגבית פורים תשפ"ז', goal: 250000, active: true, deadline: '2027-03-01', year: 'תשפ"ז' }, { id: 'C2', name: 'מגבית פסח', goal: 80000, active: false, year: 'תשפ"ו' }],
    fundraisers: [{ id: 'F1', code: '1', firstName: 'תלמיד', lastName: 'ראשון', vaad: 'וועד א', parentMobile: '050-1111111', studentMobile: '', idNumber: '', campaignTargets: { C1: 5000 }, target: 5000 }, { id: 'F2', code: '2', firstName: 'תלמיד', lastName: 'שני', vaad: 'וועד ב', parentMobile: '', studentMobile: '', idNumber: '', campaignTargets: {}, target: 0 }],
    groups: [{ id: 'G1', code: '1101', name: 'קבוצה א', vaad: 'וועד א', memberIds: ['F1', 'F2'], donorIds: donors.slice(0, 8).map(d => d.id), routeIds: ['r1'], target: 12000, fundraisingDateId: '' }],
    routes: [{ id: 'r1', code: 'ירושלים-001', city: 'ירושלים', neighborhood: 'רמות', area: 'הרצל', color: '#2360d8', donors: donors.slice(0, 6).filter(d => d.lat).map(d => d.id), createdAt: '2026-08-01' }],
    expenses: [{ id: 'E1', date: '2026-02-01', amount: 1200, dept: 'מגבית פורים', method: 'אשראי', status: 'שולם', desc: 'הדפסות', notes: '' }],
    fundraisingDates: [{ id: 'FD1', date: '2026-03-01', label: 'פורים' }],
    pendingEdits: [
      { id: 'PE1', donorId: 'D1', edits: { address: 'חדש 5', affils: ['בוגר'] }, ts: '2026-08-20T10:00:00Z', token: 'T' },
      { id: 'PE2', donorId: null, edits: { _newDonor: { firstName: 'חדש', lastName: 'מהטופס', mobile: '050-9999999', affils: ['מכר'] } }, ts: '2026-08-21T10:00:00Z', token: 'public-add' },
      { id: 'PE3', donorId: null, edits: { _phoneDonation: { phone: '0501000013', amount: 180, date: '2026-08-22', method: 'טלפון' } }, ts: '2026-08-22T10:00:00Z', token: 'yemot' },
    ],
    chats: [], messages: [{ id: 'MSG1', from: 'b@b.com', to: 'a@a.com', subject: 'שלום', body: 'בדיקה', ts: '2026-08-01T10:00:00Z', read: false }],
    auditLog: [{ id: 'AL1', type: 'edit', description: 'עריכת פרטים — משה כהן: טלפון: "1"→"2"', user: 'אברהם כהן', ts: '2026-08-01T10:00:00Z', undoData: null, meta: { donorId: 'D0', kind: 'donor' } }],
    selfServiceTokens: { D1: 'T' },
    settings: { titles: ['', 'הרב', 'ד"ר'], affiliations: ['תלמיד', 'בוגר', 'הורה תלמיד', 'הורה בוגר', 'סבא תלמיד', 'סבא בוגר', 'מכר', 'עסקי', 'אחר'], closingNames: ['בברכה', 'בכבוד רב'], prefTimes: ['טלפוני לפני פורים', 'פורים בבית'], payMethods: methods, relTypes: ['הורה', 'סבא', 'בן', 'אח'] },
    nbhRules: { 'סורוצקין': 'גאולה' }, neighborhoods: {},
    nextCode: 1001 + nDonors, nextFRCode: 3, nextGrpSeq: { 'וועד א': 2 },
    expenseDepts: ['מגבית פורים', 'מענק פסח', 'אחר'], expenseMethods: methods, expenseStatuses: ['לתשלום', 'שולם'],
    emailSettings: { publicKey: 'x', serviceId: 'y', tplMessage: 't', orgName: 'עזר תורה' },
  };
}
module.exports = { bigFixture };
