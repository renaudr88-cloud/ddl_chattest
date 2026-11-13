'use strict';
/*
 * DDL Chat — WebSocket server
 * One process handles ~1000 connected players comfortably. Protocol is JSON over a plain WebSocket
 * (React Native has WebSocket built in, no client library needed). See README.md for every message type.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

// --- tiny .env loader (no extra dependency) ---
(function loadEnv() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
})();

const { WebSocketServer, WebSocket } = require('ws');
const db = require('./db');
const { hasBad, isQuestion } = require('./filter');

const CFG = {
  port: +(process.env.PORT || 8080),
  path: process.env.WS_PATH || '/chat',
  secret: process.env.CHAT_SECRET || '',
  uploadBase: process.env.UPLOAD_BASE_URL || '',
  rateMax: +(process.env.RATE_LIMIT || 6), // posts per 6 seconds per player
  // Each platform gets its own General chat, Friendlies, Dartswap, Help desk and private chats.
  // Add one later (e.g. dartcounter) by adding it here and in app/src/config.js.
  platforms: (process.env.PLATFORMS || 'dartsmind,scolia').split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
  // Test mode (no database, no PHP): only allowed together with DB_DRIVER=memory. Start with `npm run dev`.
  dev: process.env.DEV_MODE === '1' && process.env.DB_DRIVER === 'memory',
  origins: (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
};
if (CFG.secret.length < 32) { console.error('CHAT_SECRET must be set (32+ characters, same value as in php/chat-config.php)'); process.exit(1); }

const MIN = 60_000;
const now = () => Date.now();

/* ---------------- state ---------------- */
const users = new Map();      // id -> {id,name,role,avatar,last_seen}
const sanctions = new Map();  // id -> {user_id,muted_until,kicked_until,banned}
const sockets = new Map();    // id -> Set<ws>
const rate = new Map();       // id -> [timestamps]

/* ---------------- helpers ---------------- */
function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', CFG.secret).update(body).digest('base64url');
  const a = Buffer.from(sig || ''), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!p.uid || !p.name || !p.exp || p.exp * 1000 < now()) return null;
    return { id: String(p.uid), name: String(p.name).slice(0, 80), role: p.role === 'admin' ? 'admin' : 'player', avatar: p.avatar || null };
  } catch { return null; }
}

const pubUser = id => {
  const u = users.get(String(id));
  return u ? { id: u.id, name: u.name, role: u.role, avatar: u.avatar || null } : { id: String(id), name: 'Unknown', role: 'player', avatar: null };
};
const sanctionOf = id => {
  const s = sanctions.get(id) || {};
  const t = now();
  return {
    muted_until: s.muted_until > t ? +s.muted_until : 0,
    kicked_until: s.kicked_until > t ? +s.kicked_until : 0,
    banned: !!s.banned,
  };
};
const isAdmin = id => users.get(id)?.role === 'admin';
// Rooms: "general:<platform>" and "dm:<platform>:<idA>:<idB>" (ids sorted)
const isPlatform = p => CFG.platforms.includes(p);
function platformArg(p) { p = String(p || '').toLowerCase(); if (!isPlatform(p)) fail('bad_platform', 'Pick Dartsmind or Scolia first.'); return p; }
const generalRoom = p => 'general:' + p;
const dmRoom = (p, a, b) => `dm:${p}:` + [String(a), String(b)].sort().join(':');
const roomPlatform = room => room.split(':')[1];
const dmMembers = room => room.split(':').slice(2);
const isGeneral = room => room.startsWith('general:') && isPlatform(roomPlatform(room));
const canSee = (room, uid) => isGeneral(room) ||
  (room.startsWith('dm:') && isPlatform(roomPlatform(room)) && dmMembers(room).length === 2 && dmMembers(room).includes(uid));

function send(ws, obj) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }
function sendTo(uid, obj) { for (const ws of sockets.get(uid) || []) send(ws, obj); }
function broadcast(obj, onlyAdmins = false) {
  const data = JSON.stringify(obj);
  for (const [uid, set] of sockets) {
    if (onlyAdmins && !isAdmin(uid)) continue;
    for (const ws of set) if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}
function toRoom(room, obj) { isGeneral(room) ? broadcast(obj) : dmMembers(room).forEach(u => sendTo(u, obj)); }

function rateOk(uid, max = CFG.rateMax, windowMs = 6000) {
  const t = now();
  const list = (rate.get(uid) || []).filter(x => t - x < windowMs);
  if (list.length >= max) return false;
  list.push(t); rate.set(uid, list);
  return true;
}

class Fail extends Error { constructor(code, message) { super(message); this.code = code; } }
const fail = (code, message) => { throw new Fail(code, message); };
const str = (v, max) => String(v ?? '').trim().slice(0, max);
function clean(text, what = 'Your message') {
  if (hasBad(text)) fail('blocked_word', `${what} contains a word that is not allowed in the DDL community.`);
}
function canPost(uid) {
  const s = sanctionOf(uid);
  if (s.muted_until) fail('muted', 'You are muted until ' + new Date(s.muted_until).toISOString());
  if (!rateOk(uid)) fail('slow_down', 'You are sending too fast. Wait a few seconds.');
}
function checkImage(url) {
  if (!url) return null;
  if (CFG.dev && typeof url === 'string' && /^https?:\/\/[^/]+\/uploads\/dev-[a-f0-9]{24}\.(jpg|png|gif|webp)$/.test(url)
      && fs.existsSync(path.join(DEV_UPLOADS, url.split('/').pop()))) return url;
  if (!CFG.uploadBase || typeof url !== 'string' || !url.startsWith(CFG.uploadBase) || url.length > 255) fail('bad_image', 'Pictures must be uploaded through the DDL app.');
  return url;
}

/* ---------------- output shapes ---------------- */
const outMsg = m => ({ id: +m.id, room: m.room, user: pubUser(m.user_id), text: m.body || '', imageUrl: m.image_url || null, ts: +m.created_at });
const outFriendly = f => ({ id: f.id, platform: f.platform, user: pubUser(f.user_id), format: f.format, custom: f.custom || '', game: f.game, note: f.note || '',
  status: f.status, matchedWith: f.matched_with ? pubUser(f.matched_with) : null, ts: +f.created_at });
const outSwap = s => ({ id: s.id, platform: s.platform, user: pubUser(s.user_id), kind: s.kind, title: s.title, price: s.price || '', cond: s.cond,
  desc: s.descr || '', imageUrl: s.image_url || null, status: s.status, ts: +s.created_at });
const outHelp = h => ({ id: h.id, platform: h.platform, user: pubUser(h.user_id), text: h.question, status: h.status, ts: +h.created_at,
  answers: (h.answers || []).map(a => ({ user: pubUser(a.user_id), text: a.body, ts: +a.created_at })) });

const pushFriendlies = async p => broadcast({ type: 'friendlies', platform: p, list: (await db.friendlies.list(p)).map(outFriendly) });
const pushSwap = async p => broadcast({ type: 'swap', platform: p, list: (await db.swap.list(p)).map(outSwap) });
// Players see their own questions plus solved ones (a public FAQ). Staff see everything.
const helpFor = (uid, all) => all.filter(h => isAdmin(uid) || h.status === 'solved' || h.user_id === uid).map(outHelp);
async function pushHelp(p) {
  const all = await db.help.list(p);
  for (const uid of sockets.keys()) sendTo(uid, { type: 'help', platform: p, list: helpFor(uid, all) });
}
async function pushLog() { broadcast({ type: 'modlog', list: await modLog() }, true); }
async function modLog() {
  return (await db.log.list(50)).map(l => ({ id: l.id, admin: pubUser(l.admin_id), action: l.action,
    target: l.target_id ? pubUser(l.target_id) : null, detail: l.detail || '', ts: +l.created_at }));
}
async function dmList(uid) {
  return (await db.dmRooms(uid)).filter(r => canSee(r.room, uid)).map(r => {
    const other = dmMembers(r.room).find(x => x !== uid) || uid;
    return { room: r.room, platform: roomPlatform(r.room), other: pubUser(other), lastId: +r.last_id, lastAt: +r.last_at, online: sockets.has(other) };
  });
}
async function postMessage(room, uid, text, imageUrl) {
  const m = { room, user_id: uid, body: text || null, image_url: imageUrl || null, created_at: now() };
  m.id = await db.insertMessage(m);
  toRoom(room, { type: 'message', message: outMsg(m) });
  return m;
}

/* ---------------- request handlers ---------------- */
const H = {
  async history(uid, { room, before }) {
    room = str(room, 140);
    if (!canSee(room, uid)) fail('forbidden', 'You cannot read this chat.');
    const rows = await db.history(room, +before || 0, 50);
    return { room, messages: rows.map(outMsg), more: rows.length === 50 };
  },

  async send(uid, { room, text, imageUrl }) {
    room = str(room, 140); text = str(text, 1000);
    if (!canSee(room, uid)) fail('forbidden', 'You cannot post in this chat.');
    if (!text && !imageUrl) fail('empty', 'Write a message or add a picture.');
    canPost(uid); clean(text);
    if (room.startsWith('dm:')) {
      const other = dmMembers(room).find(x => x !== uid);
      if (other && sanctionOf(other).banned) fail('forbidden', 'This player is banned from the chat.');
    }
    const m = await postMessage(room, uid, text, checkImage(imageUrl));
    return { id: m.id };
  },

  async delete(uid, { id }) {
    const m = await db.getMessage(+id);
    if (!m || m.deleted) return {};
    if (m.user_id !== uid && !isAdmin(uid)) fail('forbidden', 'You can only delete your own messages.');
    await db.markDeleted(m.id);
    toRoom(m.room, { type: 'deleted', id: +m.id, room: m.room });
    if (m.user_id !== uid) { await db.log.add({ admin_id: uid, action: 'delete', target_id: m.user_id, detail: `[${roomPlatform(m.room)}] ` + (m.body || '[picture]').slice(0, 110), created_at: now() }); await pushLog(); }
    return {};
  },

  async 'dm.open'(uid, { userId, platform }) {
    const p = platformArg(platform);
    userId = String(userId || '');
    if (!users.has(userId) || userId === uid) fail('not_found', 'Player not found.');
    const room = dmRoom(p, uid, userId);
    return { room, other: pubUser(userId), online: sockets.has(userId), ...(await H.history(uid, { room })) };
  },
  async 'dm.list'(uid) { return { list: await dmList(uid) }; },

  async 'users.search'(uid, { q }) {
    const s = str(q, 40).toLowerCase();
    const list = [...users.values()]
      .filter(u => u.id !== uid && !sanctionOf(u.id).banned && (!s || u.name.toLowerCase().includes(s)))
      .sort((a, b) => (sockets.has(b.id) - sockets.has(a.id)) || a.name.localeCompare(b.name))
      .slice(0, 25).map(u => ({ ...pubUser(u.id), online: sockets.has(u.id) }));
    return { list };
  },

  /* friendlies */
  async 'friendly.post'(uid, { platform, format, custom, game, note }) {
    const p = platformArg(platform);
    if (!['FT3', 'FT5', 'Other'].includes(format)) fail('bad_input', 'Pick FT3, FT5 or Other.');
    custom = format === 'Other' ? str(custom, 40) : '';
    if (format === 'Other' && !custom) fail('bad_input', 'Describe the format, for example "Best of 7 sets".');
    game = ['501', '301', '701', 'Cricket'].includes(game) ? game : '501';
    note = str(note, 120);
    canPost(uid); clean(custom + ' ' + note);
    await db.friendlies.cancelOpenBy(uid, p); // one open friendly per player per platform
    const id = await db.friendlies.add({ platform: p, user_id: uid, format, custom: custom || null, game, note: note || null, status: 'open', created_at: now() });
    await pushFriendlies(p);
    return { id };
  },
  async 'friendly.cancel'(uid, { id }) {
    const f = await db.friendlies.get(+id);
    if (!f || f.status !== 'open') return {};
    if (f.user_id !== uid && !isAdmin(uid)) fail('forbidden', 'This is not your friendly.');
    await db.friendlies.update(f.id, { status: 'cancelled' });
    await pushFriendlies(f.platform);
    return {};
  },
  async 'friendly.accept'(uid, { id }) {
    const f = await db.friendlies.get(+id);
    if (!f || f.status !== 'open') fail('gone', 'This friendly was already taken.');
    if (f.user_id === uid) fail('forbidden', 'You cannot accept your own friendly.');
    canPost(uid);
    await db.friendlies.update(f.id, { status: 'matched', matched_with: uid });
    const room = dmRoom(f.platform, uid, f.user_id);
    const fmt = f.format === 'Other' ? f.custom : f.format;
    await postMessage(room, uid, `🎯 I accepted your ${fmt} friendly (${f.game}). Ready when you are!`, null);
    await pushFriendlies(f.platform);
    return { room, other: pubUser(f.user_id) };
  },

  /* dartswap */
  async 'swap.post'(uid, { platform, kind, title, price, cond, desc, imageUrl }) {
    const p = platformArg(platform);
    if (!['Sell', 'Swap', 'Wanted'].includes(kind)) fail('bad_input', 'Pick Sell, Swap or Wanted.');
    title = str(title, 70); desc = str(desc, 400); cond = str(cond, 20) || 'Used';
    price = kind === 'Sell' ? str(price, 12).replace(/[^\d.,]/g, '') : '';
    if (!title) fail('bad_input', 'Add a title.');
    canPost(uid); clean(title + ' ' + desc, 'Your listing');
    const id = await db.swap.add({ platform: p, user_id: uid, kind, title, price: price || null, cond, descr: desc || null,
      image_url: checkImage(imageUrl), status: 'open', created_at: now() });
    await pushSwap(p);
    return { id };
  },
  async 'swap.done'(uid, { id }) {
    const s = await db.swap.get(+id);
    if (!s) return {};
    if (s.user_id !== uid) fail('forbidden', 'This is not your listing.');
    await db.swap.update(s.id, { status: 'done' }); await pushSwap(s.platform); return {};
  },
  async 'swap.delete'(uid, { id }) {
    const s = await db.swap.get(+id);
    if (!s) return {};
    if (s.user_id !== uid && !isAdmin(uid)) fail('forbidden', 'This is not your listing.');
    await db.swap.update(s.id, { status: 'deleted' });
    if (s.user_id !== uid) { await db.log.add({ admin_id: uid, action: 'swap_delete', target_id: s.user_id, detail: `[${s.platform}] ${s.title}`, created_at: now() }); await pushLog(); }
    await pushSwap(s.platform); return {};
  },

  /* help desk */
  async 'help.ask'(uid, { platform, text }) {
    const p = platformArg(platform);
    text = str(text, 300);
    if (!isQuestion(text)) fail('not_question', 'The help desk is for questions only. Ask a question, or use General chat.');
    canPost(uid); clean(text, 'Your question');
    const id = await db.help.add({ platform: p, user_id: uid, question: text, status: 'open', created_at: now() });
    await pushHelp(p);
    return { id };
  },
  async 'help.answer'(uid, { id, text }) {
    if (!isAdmin(uid)) fail('forbidden', 'Only staff can answer help questions.');
    text = str(text, 1000);
    if (!text) fail('empty', 'Write an answer.');
    clean(text, 'Your answer');
    const h = await db.help.get(+id); if (!h) fail('not_found', 'Question not found.');
    await db.help.addAnswer({ help_id: h.id, user_id: uid, body: text, created_at: now() });
    await db.help.update(h.id, { status: 'solved' });
    await pushHelp(h.platform); return {};
  },
  async 'help.status'(uid, { id, status }) {
    const h = await db.help.get(+id); if (!h) return {};
    const own = h.user_id === uid;
    if (!isAdmin(uid) && !(own && status === 'solved')) fail('forbidden', 'Only staff can change this.');
    if (!['open', 'solved', 'deleted'].includes(status)) fail('bad_input', 'Unknown status.');
    await db.help.update(h.id, { status }); await pushHelp(h.platform); return {};
  },
  async 'help.private'(uid, { id }) {
    if (!isAdmin(uid)) fail('forbidden', 'Only staff can do this.');
    const h = await db.help.get(+id); if (!h) fail('not_found', 'Question not found.');
    const room = dmRoom(h.platform, uid, h.user_id);
    await postMessage(room, uid, `About your help desk question: “${h.question}”\nLet's sort it out here.`, null);
    await db.help.addAnswer({ help_id: h.id, user_id: uid, body: 'Continued in a private chat.', created_at: now() });
    await pushHelp(h.platform);
    return { room, other: pubUser(h.user_id) };
  },

  /* moderation */
  async 'admin.members'(uid) {
    if (!isAdmin(uid)) fail('forbidden', 'Staff only.');
    const list = [...users.values()]
      .map(u => ({ ...pubUser(u.id), online: sockets.has(u.id), lastSeen: +u.last_seen, sanction: sanctionOf(u.id) }))
      .sort((a, b) => (b.online - a.online) || (b.lastSeen - a.lastSeen)).slice(0, 1000);
    return { list, log: await modLog() };
  },
  async mod(uid, { action, userId, minutes }) {
    if (!isAdmin(uid)) fail('forbidden', 'Staff only.');
    userId = String(userId || '');
    if (!users.has(userId)) fail('not_found', 'Player not found.');
    if (isAdmin(userId)) fail('forbidden', 'Staff members cannot be moderated here.');
    const s = { user_id: userId, ...sanctionOf(userId), updated_by: uid, updated_at: now() };
    const req = +minutes > 0 ? Math.min(60 * 24 * 30, Math.round(+minutes)) : 0;
    let detail = '';
    switch (action) {
      case 'mute': { const m = req || 10; s.muted_until = now() + m * MIN; detail = `${m} min`; break; }
      case 'unmute': s.muted_until = 0; break;
      case 'kick': { const m = req || 30; s.kicked_until = now() + m * MIN; detail = `${m} min`; break; }
      case 'unkick': s.kicked_until = 0; break;
      case 'ban': s.banned = 1; break;
      case 'unban': s.banned = 0; break;
      default: fail('bad_input', 'Unknown action.');
    }
    s.banned = s.banned ? 1 : 0;
    await db.sanctions.set(s);
    sanctions.set(userId, s);
    await db.log.add({ admin_id: uid, action, target_id: userId, detail, created_at: now() });

    const st = sanctionOf(userId);
    if (st.banned || st.kicked_until) {
      for (const ws of sockets.get(userId) || []) { send(ws, { type: 'blocked', reason: st.banned ? 'banned' : 'kicked', until: st.kicked_until }); ws.close(4003, 'blocked'); }
    } else sendTo(userId, { type: 'sanction', sanction: st });
    broadcast({ type: 'member', member: { ...pubUser(userId), online: sockets.has(userId), sanction: st } }, true);
    await pushLog();
    return { sanction: st };
  },
};

/* ---------------- connection lifecycle ---------------- */
async function onAuth(ws, token) {
  const u = verifyToken(token);
  if (!u) { send(ws, { type: 'auth_failed', message: 'Your session expired. Log in again.' }); return ws.close(4001, 'auth'); }
  const st = sanctionOf(u.id);
  if (st.banned || st.kicked_until) { send(ws, { type: 'blocked', reason: st.banned ? 'banned' : 'kicked', until: st.kicked_until }); return ws.close(4003, 'blocked'); }

  u.last_seen = now();
  users.set(u.id, u);
  await db.upsertUser(u);
  ws.uid = u.id;
  const first = !sockets.has(u.id);
  if (first) sockets.set(u.id, new Set());
  sockets.get(u.id).add(ws);

  // Everything per platform: { dartsmind: [...], scolia: [...] }
  const per = {};
  await Promise.all(CFG.platforms.map(async p => {
    const [general, friendlies, swap, help] = await Promise.all([
      db.history(generalRoom(p), 0, 50), db.friendlies.list(p), db.swap.list(p), db.help.list(p)]);
    per[p] = { general: general.map(outMsg), generalMore: general.length === 50,
      friendlies: friendlies.map(outFriendly), swap: swap.map(outSwap), help: helpFor(u.id, help) };
  }));
  const pick = k => Object.fromEntries(CFG.platforms.map(p => [p, per[p][k]]));
  send(ws, {
    type: 'ready',
    me: { ...pubUser(u.id), sanction: st },
    online: sockets.size,
    platforms: CFG.platforms,
    general: pick('general'),
    generalMore: pick('generalMore'),
    friendlies: pick('friendlies'),
    swap: pick('swap'),
    help: pick('help'),
    dms: await dmList(u.id),
  });
  if (first) broadcast({ type: 'presence', online: sockets.size, userId: u.id, status: 'online' });
}

/* ---------------- test mode: login + picture upload without PHP ---------------- */
const DEV_UPLOADS = path.join(__dirname, 'dev-uploads');
const DEV_ADMINS = (process.env.DEV_ADMINS || 'renaud').split(',').map(s => s.trim().toLowerCase());
const IMG_TYPES = { jpg: [0xff, 0xd8], png: [0x89, 0x50], gif: [0x47, 0x49], webp: [0x52, 0x49] };
function devToken(name) {
  const clean = String(name || '').trim().slice(0, 30);
  const uid = 'dev-' + clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const role = DEV_ADMINS.includes(clean.toLowerCase()) ? 'admin' : 'player';
  const body = Buffer.from(JSON.stringify({ uid, name: clean, role, exp: Math.floor(now() / 1000) + 30 * 86400 })).toString('base64url');
  return { token: body + '.' + crypto.createHmac('sha256', CFG.secret).update(body).digest('base64url'), user: { id: uid, name: clean, role, avatar: null } };
}
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const parts = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > max) { reject(new Error('too_large')); req.destroy(); } else parts.push(c); });
    req.on('end', () => resolve(Buffer.concat(parts))); req.on('error', reject);
  });
}
// Minimal multipart/form-data reader: returns the bytes of the field called "image".
function multipartImage(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || ''); if (!m) return null;
  const boundary = Buffer.from('--' + (m[1] || m[2]));
  let pos = buf.indexOf(boundary);
  while (pos !== -1) {
    const headEnd = buf.indexOf('\r\n\r\n', pos); if (headEnd === -1) return null;
    const head = buf.slice(pos, headEnd).toString('utf8');
    const next = buf.indexOf(boundary, headEnd);
    if (/name="image"/i.test(head) && next !== -1) return buf.slice(headEnd + 4, next - 2);
    pos = next;
  }
  return null;
}
async function devHttp(req, res) {
  const json = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  try {
    if (req.method === 'POST' && req.url === '/dev-login') {
      let data = {}; try { data = JSON.parse((await readBody(req, 10_000)).toString('utf8') || '{}'); } catch {}
      if (!String(data.login || '').trim()) return json(400, { error: 'Enter a name to test with.' });
      return json(200, devToken(data.login));
    }
    if (req.method === 'POST' && req.url === '/dev-upload') {
      if (!verifyToken(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''))) return json(401, { error: 'Log in again.' });
      const img = multipartImage(await readBody(req, 10 * 1024 * 1024), req.headers['content-type']);
      const ext = img && Object.keys(IMG_TYPES).find(k => img[0] === IMG_TYPES[k][0] && img[1] === IMG_TYPES[k][1]);
      if (!ext) return json(415, { error: 'Use a JPG, PNG, WebP or GIF picture.' });
      fs.mkdirSync(DEV_UPLOADS, { recursive: true });
      const name = 'dev-' + crypto.randomBytes(12).toString('hex') + '.' + ext;
      fs.writeFileSync(path.join(DEV_UPLOADS, name), img);
      return json(200, { url: `http://${req.headers.host}/uploads/${name}` });
    }
    const up = /^\/uploads\/(dev-[a-f0-9]{24}\.(jpg|png|gif|webp))$/.exec(req.url);
    if (req.method === 'GET' && up && fs.existsSync(path.join(DEV_UPLOADS, up[1]))) {
      res.writeHead(200, { 'content-type': up[2] === 'jpg' ? 'image/jpeg' : 'image/' + up[2], 'cache-control': 'max-age=86400' });
      return fs.createReadStream(path.join(DEV_UPLOADS, up[1])).pipe(res);
    }
  } catch (e) { return json(e.message === 'too_large' ? 413 : 500, { error: e.message === 'too_large' ? 'That picture is too big (max 10 MB).' : 'Something went wrong.' }); }
  return false;
}

const server = http.createServer(async (req, res) => {
  if (CFG.dev) {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'content-type, authorization');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if ((await devHttp(req, res)) !== false) return;
  }
  if (req.url === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, online: sockets.size })); }
  res.writeHead(404); res.end();
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  const origin = req.headers.origin;
  // Native apps send no Origin header; browsers do. Only browser origins in the list are allowed.
  if (url.pathname !== CFG.path || (origin && CFG.origins.length && !CFG.origins.includes(origin))) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});

wss.on('connection', ws => {
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  const authTimer = setTimeout(() => { if (!ws.uid) ws.close(4001, 'auth timeout'); }, 10_000);

  ws.on('message', async raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;
    try {
      if (msg.type === 'auth') { clearTimeout(authTimer); return await onAuth(ws, msg.token); }
      if (msg.type === 'ping') return send(ws, { type: 'pong' });
      if (!ws.uid) return send(ws, { type: 'error', rid: msg.rid, code: 'auth', message: 'Log in first.' });
      const handler = H[msg.type];
      if (!handler) return send(ws, { type: 'error', rid: msg.rid, code: 'unknown', message: 'Unknown request.' });
      const data = await handler(ws.uid, msg);
      send(ws, { type: 'ack', rid: msg.rid, data });
    } catch (e) {
      if (!(e instanceof Fail)) console.error(`[${msg.type}]`, e);
      send(ws, { type: 'error', rid: msg.rid, code: e.code || 'server', message: e instanceof Fail ? e.message : 'Something went wrong on the server. Try again.' });
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimer);
    const set = ws.uid && sockets.get(ws.uid);
    if (!set) return;
    set.delete(ws);
    if (!set.size) {
      sockets.delete(ws.uid);
      const u = users.get(ws.uid);
      if (u) { u.last_seen = now(); db.upsertUser(u).catch(() => {}); }
      broadcast({ type: 'presence', online: sockets.size, userId: ws.uid, status: 'offline' });
    }
  });
});

// Drop dead connections (phones that lost signal) every 30 s.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false; ws.ping();
  }
}, 30_000);

(async () => {
  await db.init();
  for (const u of await db.allUsers()) users.set(String(u.id), { ...u, id: String(u.id) });
  for (const s of await db.sanctions.all()) sanctions.set(String(s.user_id), { ...s, user_id: String(s.user_id) });
  server.listen(CFG.port, () => {
    console.log(`DDL Chat listening on :${CFG.port}${CFG.path} (${process.env.DB_DRIVER || 'mysql'})`);
    if (CFG.dev) console.log('TEST MODE: no database, log in with any name (admins: ' + DEV_ADMINS.join(', ') + '). Messages are lost when you stop the server.');
  });
})().catch(e => { console.error('Startup failed:', e); process.exit(1); });
