// Two real users (two browser contexts) chatting through the fake server + realtime relay.
const { chromium } = require('playwright');
const S = require('./fake-sb.js');
(async () => {
  const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
  S.seed();
  const D = S.rows.main.data;
  D.users = [
    { email: 'a@a.com', username: 'a@a.com', displayName: 'אברהם כהן', role: 'superadmin', firstLogin: false },
    { email: 'b@b.com', username: 'b@b.com', displayName: 'ברוך לוי', role: 'editor', firstLogin: false },
    { email: 'c@c.com', username: 'c@c.com', displayName: 'גד מזרחי', role: 'viewer', firstLogin: false },
  ];
  // legacy messages (old model) → must migrate into chats
  D.messages = [
    { id: 'MSG1', from: 'b@b.com', fromDisplay: 'ברוך לוי', to: 'a@a.com', subject: 'שאלה', body: 'מתי הפגישה?', ts: '2026-08-01T10:00:00.000Z', read: false },
    { id: 'MSG2', from: 'a@a.com', to: 'b@b.com', subject: 'תשובה', body: 'מחר', ts: '2026-08-01T11:00:00.000Z', read: true },
    { id: 'MSG3', from: 'a@a.com', to: 'b@b.com', subject: 'שידור', body: 'לכולם', ts: '2026-08-02T09:00:00.000Z', read: false, broadcast: true },
    { id: 'MSG4', from: 'a@a.com', to: 'c@c.com', subject: 'שידור', body: 'לכולם', ts: '2026-08-02T09:00:00.000Z', read: false, broadcast: true },
  ];
  const T = []; const ok = (n, c, x) => T.push((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : ' | ' + JSON.stringify(x)));
  const errors = [];
  const mk = async (email, viewport) => {
    const ctx = await browser.newContext({ viewport: viewport || { width: 1300, height: 820 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(email + ': ' + e.message));
    page.on('dialog', d => d.accept());
    await page.exposeFunction('__srv', req => JSON.stringify(S.serve(JSON.parse(req))));
    await page.addInitScript(S.FAKE_CLIENT.replace(/a@a\.com/g, email).replace("id:'U1'", "id:'U_" + email + "'"));
    return page;
  };
  const A = await mk('a@a.com'), B = await mk('b@b.com');
  await S.wireRelay([A, B]);
  for (const pg of [A, B]) {
    await pg.goto((process.env.QA_URL || 'http://localhost:8123/index.html'), { waitUntil: 'domcontentloaded' });
    await pg.waitForFunction(() => typeof currentUser !== 'undefined' && currentUser && document.getElementById('appWrapper').style.display === 'flex', null, { timeout: 8000 });
    await pg.evaluate(() => showPage('messages'));
    await pg.waitForTimeout(300);
  }
  // 1. migration
  const migA = await A.evaluate(() => ({ chats: DB.chats.map(c => c.id), msgs: DB.messages.map(m => [m.id, m.chatId]), unread: document.getElementById('topMsgBadge').textContent }));
  ok('legacy messages migrated (dm + all, broadcast deduped)', migA.chats.includes('all') && migA.chats.includes('dm:a@a.com|b@b.com') && migA.msgs.length === 3 && migA.msgs.some(x => x[0] === 'MSG3' && x[1] === 'all') && !migA.msgs.some(x => x[0] === 'MSG4'), migA);
  ok('A has 1 unread (legacy unread from B)', migA.unread.includes('1'), migA.unread);
  // 2. A opens DM with B and sends → B gets it instantly via broadcast (before any poll)
  await A.evaluate(() => openChat('dm:a@a.com|b@b.com'));
  await A.waitForTimeout(200);
  await A.fill('#waInput', 'שלום ברוך, מה נשמע?');
  await A.press('#waInput', 'Enter');
  await B.waitForTimeout(400);
  const bList = await B.evaluate(() => ({ html: document.getElementById('waList').innerHTML, badge: document.getElementById('topMsgBadge').textContent, has: DB.messages.some(m => m.text === 'שלום ברוך, מה נשמע?') }));
  ok('B received the message instantly (realtime)', bList.has && bList.html.includes('שלום ברוך') && bList.html.includes('wa-badge'), { badge: bList.badge, has: bList.has });
  // ticks on A: sent (single) since the fake server has not confirmed... wait for push
  await A.waitForTimeout(1800);
  const ticksA = await A.evaluate(() => { const ms = [...document.querySelectorAll('#waMsgs .wa-msg.me')]; const last = ms[ms.length - 1]; return last ? last.querySelector('.wa-tick')?.className : null; });
  ok('A shows delivered ticks after sync (grey ✓✓)', ticksA === 'wa-tick', ticksA);
  // 3. B opens the chat → read receipt → A's ticks turn blue
  await B.evaluate(() => openChat('dm:a@a.com|b@b.com'));
  await B.waitForTimeout(500);
  const blue = await A.evaluate(() => { const ms = [...document.querySelectorAll('#waMsgs .wa-msg.me')]; const last = ms[ms.length - 1]; return last ? last.querySelector('.wa-tick')?.className : null; });
  ok('A sees blue ticks after B read', blue === 'wa-tick blue', blue);
  ok('B: DM has no unread left (only the legacy broadcast remains)', (await B.evaluate(() => _unreadIn('dm:a@a.com|b@b.com').length === 0 && _unreadIn('all').length === 1)), '');
  // 4. typing indicator
  await B.fill('#waInput', 'אני מקליד');
  await A.waitForTimeout(300);
  const typing = await A.evaluate(() => ({ sub: document.getElementById('waChatSub').textContent, dots: document.getElementById('waTyping').style.display }));
  ok('A sees typing indicator', typing.sub.includes('מקליד') && typing.dots === 'flex', typing);
  await B.fill('#waInput', '');
  // 5. group with mention, edit, delete
  await A.evaluate(() => { openNewChatModal(); ncTab('group'); document.getElementById('ncGroupName').value = 'מגבית פורים'; document.querySelector('#ncMemberList input[value="b@b.com"]').checked = true; createGroupFromModal(); });
  await A.waitForTimeout(200);
  await A.fill('#waInput', '@ברוך לוי תבדוק בבקשה');
  await A.press('#waInput', 'Enter');
  await B.waitForTimeout(400);
  const grpB = await B.evaluate(() => { const c = DB.chats.find(x => x.name === 'מגבית פורים'); return { has: !!c, members: c && c.members, listAt: document.getElementById('waList').innerHTML.includes('wa-at'), mention: DB.messages.some(m => (m.mentions||[]).includes('b@b.com')) }; });
  ok('B got the new group + mention badge via broadcast', grpB.has && grpB.members.includes('b@b.com') && grpB.listAt && grpB.mention, grpB);
  await B.evaluate(() => openChat(DB.chats.find(x => x.name === 'מגבית פורים').id));
  await B.waitForTimeout(200);
  const rendered = await B.evaluate(() => ({ mention: !!document.querySelector('#waMsgs .wa-mention'), sender: document.querySelector('#waMsgs .wa-sender')?.textContent, highlighted: !!document.querySelector('#waMsgs .wa-msg.mentioned') }));
  ok('mention rendered + sender name in group', rendered.mention && rendered.sender === 'אברהם כהן' && rendered.highlighted, rendered);
  const msgId = await A.evaluate(() => DB.messages.find(m => m.text.includes('תבדוק')).id);
  await A.evaluate(id => startEditMsg(id), msgId);
  await A.fill('#waInput', '@ברוך לוי תבדוק בבקשה היום');
  await A.press('#waInput', 'Enter');
  await B.waitForTimeout(300);
  const edited = await B.evaluate(id => { const m = DB.messages.find(x => x.id === id); return { text: m.text, edited: !!m.editedAt, label: document.getElementById('waMsgs').innerHTML.includes('נערכה') }; }, msgId);
  ok('edit propagated with "נערכה"', edited.text.endsWith('היום') && edited.edited && edited.label, edited);
  await A.evaluate(id => deleteChatMessage(id), msgId);
  await B.waitForTimeout(300);
  ok('delete propagated', await B.evaluate(id => DB.messages.find(x => x.id === id).deleted && document.getElementById('waMsgs').innerHTML.includes('נמחקה'), msgId), '');
  // 6. read receipts opt-out (admin): B (editor) cannot, A (superadmin) can
  const bCan = await B.evaluate(() => { toggleReadReceipts(); return _receiptsOn('b@b.com'); });
  ok('editor cannot switch receipts off', bCan === true, bCan);
  await A.evaluate(() => toggleReadReceipts());
  await A.waitForTimeout(100);
  await B.fill('#waInput', 'הודעה לקבוצה');
  await B.press('#waInput', 'Enter');
  await A.waitForTimeout(300);
  await A.evaluate(() => openChat(DB.chats.find(x => x.name === 'מגבית פורים').id));
  await A.waitForTimeout(400);
  const rec = await A.evaluate(() => { const m = DB.messages.find(x => x.text === 'הודעה לקבוצה'); return { readBy: Object.keys(m.readBy||{}), seenBy: Object.keys(m.seenBy||{}), off: !_receiptsOn('a@a.com') }; });
  ok('receipts off → seenBy instead of readBy', rec.off && !rec.readBy.includes('a@a.com') && rec.seenBy.includes('a@a.com'), rec);
  // admin with hidden receipts STILL sees who read his own messages
  await A.fill('#waInput', 'הודעה של המנהל'); await A.press('#waInput', 'Enter');
  await B.waitForTimeout(400);
  const stillBlue = await A.evaluate(() => { const ms = [...document.querySelectorAll('#waMsgs .wa-msg.me')]; const last = ms[ms.length - 1]; return last ? last.querySelector('.wa-tick')?.className : null; });
  ok('hidden receipts: admin still sees blue ticks on his messages', stillBlue === 'wa-tick blue', stillBlue);
  await A.evaluate(() => toggleReadReceipts()); // back on
  // members after creation: B (plain member) adds C; A (admin) removes C; C's client learns instantly
  await B.evaluate(() => { openChatInfo(); document.getElementById('ciAdd').value = 'c@c.com'; addChatMember(); closeModal('chatInfoModal'); });
  await A.waitForTimeout(300);
  const memb = await A.evaluate(() => DB.chats.find(x => x.name === 'מגבית פורים').members);
  ok('member (non-admin) can add a member after creation', memb.includes('c@c.com'), memb);
  const bCanRemove = await B.evaluate(() => !!document.querySelector('#ciBody button.btn-danger[onclick^="removeChatMember"]') === false);
  await A.evaluate(() => { openChatInfo(); removeChatMember('c@c.com'); closeModal('chatInfoModal'); });
  await B.waitForTimeout(300);
  ok('admin removes a member; other client updated', !(await B.evaluate(() => DB.chats.find(x => x.name === 'מגבית פורים').members.includes('c@c.com'))), '');
  // admin deletes another member's message; editor cannot delete admin's
  const bMsgId = await A.evaluate(() => DB.messages.find(m => m.text === 'הודעה לקבוצה').id);
  await A.evaluate(id => deleteChatMessage(id), bMsgId);
  await B.waitForTimeout(300);
  const delByAdmin = await B.evaluate(id => { const m = DB.messages.find(x => x.id === id); return { deleted: m.deleted, by: m.deletedBy, label: document.getElementById('waMsgs').innerHTML.includes('(מנהל)') }; }, bMsgId);
  ok('admin deleted a member\'s message (labelled)', delByAdmin.deleted && delByAdmin.by === 'a@a.com' && delByAdmin.label, delByAdmin);
  const aMsgId = await A.evaluate(() => DB.messages.find(m => m.text === 'הודעה של המנהל').id);
  const editorBlocked = await B.evaluate(id => { deleteChatMessage(id); return !DB.messages.find(x => x.id === id).deleted && !_canDeleteMsg(DB.messages.find(x => x.id === id)); }, aMsgId);
  ok('editor cannot delete admin\'s message', editorBlocked, '');
  // 7. server has everything after sync + merge kept both sides' receipts
  await A.waitForTimeout(2500); await B.waitForTimeout(2500);
  const srv = S.rows.main.data;
  ok('server holds chats + messages', (srv.chats||[]).some(c => c.name === 'מגבית פורים') && (srv.messages||[]).some(m => m.text === 'שלום ברוך, מה נשמע?' && m.readBy && m.readBy['b@b.com']), { chats: (srv.chats||[]).length, msgs: (srv.messages||[]).length });
  // 8. mobile layout: list → chat full screen with back button
  const M = await mk('b@b.com', { width: 390, height: 780 });
  await S.wireRelay([M]);
  await M.goto((process.env.QA_URL || 'http://localhost:8123/index.html'), { waitUntil: 'domcontentloaded' });
  await M.waitForFunction(() => typeof currentUser !== 'undefined' && currentUser && document.getElementById('appWrapper').style.display === 'flex', null, { timeout: 8000 });
  await M.evaluate(() => showPage('messages'));
  await M.waitForTimeout(300);
  const m1 = await M.evaluate(() => ({ side: getComputedStyle(document.getElementById('waSide')).display, main: getComputedStyle(document.getElementById('waMain')).display, sw: document.documentElement.scrollWidth <= document.documentElement.clientWidth }));
  await M.screenshot({ path: 'chat-mobile-list.png' });
  await M.evaluate(() => openChat('dm:a@a.com|b@b.com'));
  await M.waitForTimeout(300);
  const m2 = await M.evaluate(() => ({ side: getComputedStyle(document.getElementById('waSide')).display, main: getComputedStyle(document.getElementById('waMain')).display, back: getComputedStyle(document.querySelector('.wa-back')).display, inputIn: document.getElementById('waInput').getBoundingClientRect().bottom <= innerHeight }));
  await M.screenshot({ path: 'chat-mobile-chat.png' });
  ok('mobile: list then full-screen chat with back button', m1.side === 'flex' && m1.main === 'none' && m1.sw && m2.side === 'none' && m2.main === 'flex' && m2.back !== 'none' && m2.inputIn, { m1, m2 });
  await A.screenshot({ path: 'chat-desktop.png' });
  T.forEach(t => console.log(t));
  console.log('page errors:', errors.length ? errors.join('\n') : 'none');
  console.log(T.some(t => t.startsWith('FAIL')) ? 'CHAT FAILURES' : 'ALL CHAT TESTS PASS');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
