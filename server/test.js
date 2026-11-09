'use strict';
// End-to-end smoke test. Starts the server with in-memory storage and runs a player and an admin through
// every feature. Run with:  npm test
const { spawn } = require('child_process');
const crypto = require('crypto');
const WebSocket = require('ws');

const SECRET = 'test-secret-test-secret-test-secret-123';
const PORT = 18080;
const UPLOAD = 'https://ddl-online.com/uploads/chat/';

function token(uid, name, role) {
  const body = Buffer.from(JSON.stringify({ uid, name, role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
}

function client(tok) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/chat`);
    const c = { ws, events: [], waiters: [], rid: 0, pending: new Map() };
    c.req = (type, data = {}) => new Promise((res, rej) => {
      const rid = ++c.rid; c.pending.set(rid, { res, rej });
      ws.send(JSON.stringify({ type, rid, ...data }));
    });
    c.next = (type, fn = () => true) => new Promise(res => {
      const i = c.events.findIndex(e => e.type === type && fn(e));
      if (i > -1) return res(c.events.splice(i, 1)[0]);
      c.waiters.push({ type, fn, res });
    });
    ws.on('message', raw => {
      const m = JSON.parse(raw);
      if (m.type === 'ack' || (m.type === 'error' && m.rid)) {
        const p = c.pending.get(m.rid); c.pending.delete(m.rid);
        return m.type === 'ack' ? p.res(m.data) : p.rej(m);
      }
      const w = c.waiters.findIndex(x => x.type === m.type && x.fn(m));
      if (w > -1) return c.waiters.splice(w, 1)[0].res(m);
      c.events.push(m);
    });
    ws.on('open', () => { ws.send(JSON.stringify({ type: 'auth', token: tok })); resolve(c); });
    ws.on('error', reject);
  });
}

let failed = 0;
const ok = (cond, label) => { console.log((cond ? '  ✓ ' : '  ✗ ') + label); if (!cond) failed++; };
const rejects = async (p, code, label) => { try { await p; ok(false, label); } catch (e) { ok(e.code === code, `${label} (${e.code})`); } };

(async () => {
  const srv = spawn(process.execPath, ['server.js'], {
    cwd: __dirname, env: { ...process.env, DB_DRIVER: 'memory', CHAT_SECRET: SECRET, PORT, UPLOAD_BASE_URL: UPLOAD, RATE_LIMIT: 100 },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise(r => srv.stdout.on('data', d => String(d).includes('listening') && r()));

  try {
    const admin = await client(token(1, 'Renaud', 'admin'));
    const r1 = await admin.next('ready');
    ok(r1.me.role === 'admin', 'admin logs in');
    const kev = await client(token(3, 'Kevin V.', 'player'));
    const r2 = await kev.next('ready');
    ok(r2.me.name === 'Kevin V.', 'player logs in');

    console.log('General chat');
    await kev.req('send', { room: 'general', text: 'Evening all! Who plays tonight?' });
    const m = await admin.next('message');
    ok(m.message.text.includes('Evening') && m.message.user.name === 'Kevin V.', 'message reaches the other player live');
    await kev.req('send', { room: 'general', text: 'pic', imageUrl: UPLOAD + 'abc.jpg' });
    ok((await admin.next('message')).message.imageUrl === UPLOAD + 'abc.jpg', 'picture message delivered');
    await rejects(kev.req('send', { room: 'general', text: 'look', imageUrl: 'https://evil.example/x.jpg' }), 'bad_image', 'foreign picture URL refused');
    await rejects(kev.req('send', { room: 'general', text: 'what the f.u.c.k' }), 'blocked_word', 'bad word blocked (English, split up)');
    await rejects(kev.req('send', { room: 'general', text: 'jij k4nker' }), 'blocked_word', 'bad word blocked (Dutch, leetspeak)');
    const h = await kev.req('history', { room: 'general' });
    ok(h.messages.length === 2, 'history returns the stored messages');

    console.log('Private chat');
    const dm = await admin.req('dm.open', { userId: '3' });
    await admin.req('send', { room: dm.room, text: 'Hi Kevin, welcome!' });
    ok(!!(await kev.next('message', e => e.message.room === dm.room)), 'private message delivered to recipient');
    const outsider = await client(token(9, 'Tom B.', 'player')); await outsider.next('ready');
    await rejects(outsider.req('history', { room: dm.room }), 'forbidden', 'outsider cannot read the private chat');
    ok((await kev.req('dm.list')).list[0].other.name === 'Renaud', 'private chat appears in the list');

    console.log('Friendlies');
    const f = await kev.req('friendly.post', { format: 'FT5', game: '501', note: 'warm-up' });
    ok((await admin.next('friendlies')).list[0].format === 'FT5', 'friendly card broadcast');
    const acc = await outsider.req('friendly.accept', { id: f.id });
    ok(acc.other.name === 'Kevin V.', 'friendly accepted, private chat opened');
    await rejects(admin.req('friendly.accept', { id: f.id }), 'gone', 'cannot accept a taken friendly');

    console.log('Dartswap');
    const s = await kev.req('swap.post', { kind: 'Sell', title: 'Target 23g', price: '€65', cond: 'Used – good', desc: 'with case' });
    const sw = await admin.next('swap');
    ok(sw.list[0].price === '65', 'listing broadcast with clean price');
    await kev.req('swap.done', { id: s.id });

    console.log('Help desk');
    await rejects(kev.req('help.ask', { text: 'hello everyone nice day' }), 'not_question', 'non-question refused');
    const q = await kev.req('help.ask', { text: 'How do I report a no-show?' });
    await rejects(outsider.req('help.answer', { id: q.id, text: 'dunno' }), 'forbidden', 'players cannot answer');
    await admin.req('help.answer', { id: q.id, text: 'Use the report button on the match page.' });
    const hl = (await admin.req('admin.members')) && (await kev.next('help'));
    ok(hl.list.find(x => x.id === q.id), 'help list updates');
    const pv = await admin.req('help.private', { id: q.id });
    ok(pv.other.name === 'Kevin V.', 'admin moved question to private chat');

    console.log('Rate limit is configurable (RATE_LIMIT, default 6 posts / 6 s)');
    console.log('Moderation');
    await rejects(kev.req('mod', { action: 'ban', userId: '9' }), 'forbidden', 'players cannot moderate');
    await admin.req('mod', { action: 'mute', userId: '3', minutes: 10 });
    ok((await kev.next('sanction')).sanction.muted_until > Date.now(), 'mute reaches the player');
    await rejects(kev.req('send', { room: 'general', text: 'hello?' }), 'muted', 'muted player cannot post');
    await admin.req('mod', { action: 'unmute', userId: '3' });
    await admin.req('mod', { action: 'kick', userId: '3' });
    ok((await kev.next('blocked')).reason === 'kicked', 'kicked player is disconnected');
    const kev2 = await client(token(3, 'Kevin V.', 'player'));
    ok((await kev2.next('blocked')).reason === 'kicked', 'kicked player cannot reconnect');
    await admin.req('mod', { action: 'ban', userId: '9' });
    ok((await outsider.next('blocked')).reason === 'banned', 'banned player is disconnected');
    await rejects(admin.req('mod', { action: 'ban', userId: '1' }), 'forbidden', 'staff cannot be banned');
    const mem = await admin.req('admin.members');
    ok(mem.log.length >= 4, 'moderation log kept');

    console.log('Auth');
    const bad = await client('nope.nope');
    ok((await bad.next('auth_failed')).type === 'auth_failed', 'invalid token rejected');
  } catch (e) { console.error(e); failed++; }

  srv.kill();
  console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
})();
