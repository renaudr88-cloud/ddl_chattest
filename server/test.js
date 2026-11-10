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

    ok(JSON.stringify(r2.platforms) === '["dartsmind","scolia"]', 'both platforms announced');
    const DM = 'dartsmind', SC = 'scolia';
    const GD = 'general:dartsmind', GS = 'general:scolia';

    console.log('General chat');
    await kev.req('send', { room: GD, text: 'Evening all! Who plays tonight?' });
    const m = await admin.next('message');
    ok(m.message.text.includes('Evening') && m.message.user.name === 'Kevin V.', 'message reaches the other player live');
    await kev.req('send', { room: GD, text: 'pic', imageUrl: UPLOAD + 'abc.jpg' });
    ok((await admin.next('message')).message.imageUrl === UPLOAD + 'abc.jpg', 'picture message delivered');
    await rejects(kev.req('send', { room: GD, text: 'look', imageUrl: 'https://evil.example/x.jpg' }), 'bad_image', 'foreign picture URL refused');
    await rejects(kev.req('send', { room: GD, text: 'what the f.u.c.k' }), 'blocked_word', 'bad word blocked (English, split up)');
    await rejects(kev.req('send', { room: GD, text: 'jij k4nker' }), 'blocked_word', 'bad word blocked (Dutch, leetspeak)');
    const h = await kev.req('history', { room: GD });
    ok(h.messages.length === 2, 'history returns the stored messages');

    console.log('Platforms stay separate');
    await kev.req('send', { room: GS, text: 'Scolia crew, anyone online?' });
    ok((await admin.next('message')).message.room === GS, 'Scolia message goes to the Scolia room');
    ok((await kev.req('history', { room: GS })).messages.length === 1, 'Scolia chat has only its own message');
    ok((await kev.req('history', { room: GD })).messages.length === 2, 'Dartsmind chat unchanged');
    await rejects(kev.req('send', { room: 'general', text: 'hi' }), 'forbidden', 'old room without platform refused');
    await rejects(kev.req('send', { room: 'general:dartcounter', text: 'hi' }), 'forbidden', 'unknown platform refused');

    console.log('Private chat');
    const dm = await admin.req('dm.open', { userId: '3', platform: DM });
    ok(dm.room === 'dm:dartsmind:1:3', 'private chat belongs to one platform');
    await admin.req('send', { room: dm.room, text: 'Hi Kevin, welcome!' });
    ok(!!(await kev.next('message', e => e.message.room === dm.room)), 'private message delivered to recipient');
    const dmS = await admin.req('dm.open', { userId: '3', platform: SC });
    ok(dmS.room !== dm.room && dmS.messages.length === 0, 'Scolia private chat is a separate conversation');
    await rejects(admin.req('dm.open', { userId: '3' }), 'bad_platform', 'private chat needs a platform');
    const outsider = await client(token(9, 'Tom B.', 'player')); await outsider.next('ready');
    await rejects(outsider.req('history', { room: dm.room }), 'forbidden', 'outsider cannot read the private chat');
    const dl = (await kev.req('dm.list')).list;
    ok(dl[0].other.name === 'Renaud' && dl[0].platform === DM, 'private chat appears in the list with its platform');

    console.log('Friendlies');
    const f = await kev.req('friendly.post', { platform: DM, format: 'FT5', game: '501', note: 'warm-up' });
    const fe = await admin.next('friendlies');
    ok(fe.platform === DM && fe.list[0].format === 'FT5', 'friendly card broadcast on Dartsmind');
    await kev.req('friendly.post', { platform: SC, format: 'FT3', game: '501' });
    const fs2 = await admin.next('friendlies');
    ok(fs2.platform === SC && fs2.list.length === 1 && fs2.list[0].format === 'FT3', 'Scolia friendly listed separately, Dartsmind one still open');
    const acc = await outsider.req('friendly.accept', { id: f.id });
    ok(acc.other.name === 'Kevin V.' && acc.room.startsWith('dm:dartsmind:'), 'friendly accepted, Dartsmind private chat opened');
    await rejects(admin.req('friendly.accept', { id: f.id }), 'gone', 'cannot accept a taken friendly');

    console.log('Dartswap');
    const s = await kev.req('swap.post', { platform: SC, kind: 'Sell', title: 'Target 23g', price: '€65', cond: 'Used – good', desc: 'with case' });
    const sw = await admin.next('swap');
    ok(sw.platform === SC && sw.list[0].price === '65', 'listing broadcast on Scolia with clean price');
    await kev.req('swap.done', { id: s.id });

    console.log('Help desk');
    await rejects(kev.req('help.ask', { platform: DM, text: 'hello everyone nice day' }), 'not_question', 'non-question refused');
    const q = await kev.req('help.ask', { platform: DM, text: 'How do I report a no-show?' });
    await rejects(outsider.req('help.answer', { id: q.id, text: 'dunno' }), 'forbidden', 'players cannot answer');
    await admin.req('help.answer', { id: q.id, text: 'Use the report button on the match page.' });
    const hl = await kev.next('help', e => e.list.some(x => x.id === q.id && x.status === 'solved'));
    ok(hl.platform === DM, 'help list updates on the right platform');
    const pv = await admin.req('help.private', { id: q.id });
    ok(pv.other.name === 'Kevin V.' && pv.room === dm.room, 'admin moved question to the Dartsmind private chat');

    console.log('Rate limit is configurable (RATE_LIMIT, default 6 posts / 6 s)');
    console.log('Moderation');
    await rejects(kev.req('mod', { action: 'ban', userId: '9' }), 'forbidden', 'players cannot moderate');
    await admin.req('mod', { action: 'mute', userId: '3', minutes: 10 });
    ok((await kev.next('sanction')).sanction.muted_until > Date.now(), 'mute reaches the player');
    await rejects(kev.req('send', { room: GD, text: 'hello?' }), 'muted', 'muted player cannot post');
    await rejects(kev.req('send', { room: GS, text: 'hello?' }), 'muted', 'mute also applies on the other platform');
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
