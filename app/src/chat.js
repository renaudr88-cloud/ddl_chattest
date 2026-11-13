// All chat data lives in Firebase (Firestore). This file keeps one shared state for the whole app and offers the
// same actions the screens already use: chat.request('send', {...}), chat.requestHere('friendly.post', {...}), ...
// Who may do what is decided by firebase/firestore.rules; the checks here only give quick, friendly feedback.
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  signInAnonymously, signInWithCustomToken, signOut, onAuthStateChanged,
} from 'firebase/auth';
import {
  collection, doc, query, where, orderBy, limit, startAfter, onSnapshot, getDoc, getDocs, setDoc, addDoc, updateDoc,
  deleteDoc, writeBatch, serverTimestamp, Timestamp, arrayUnion, getCountFromServer,
} from 'firebase/firestore';
import { auth, db, FIREBASE_READY } from './firebase';
import { TEST_MODE, LOGIN_URL, UPLOAD_URL } from './config';
import { PLATFORMS } from './platforms';
import { hasBad, isQuestion } from './filter';

const TOKEN_KEY = 'ddl-chat-token';       // DDL token for picture uploads (live mode)
const READ_KEY = 'ddl-chat-read';
const PLATFORM_KEY = 'ddl-chat-platform';
const PAGE = 40;                          // messages loaded per room (keeps Firestore reads low)
const MIN = 60_000;
const P_KEYS = PLATFORMS.map(p => p.key);

const initial = {
  status: 'idle',          // idle | connecting | online | offline
  me: null,                // {id,name,role,avatar,sanction}
  online: 0,
  rooms: {},               // room -> messages[] (oldest first)
  more: {},                // room -> bool (older messages available)
  platform: PLATFORMS[0].key,
  dms: [],                 // [{room, platform, other, lastAt}]
  read: {},                // room -> time (ms) of the last message seen
  friendlies: {}, swap: {}, help: {}, // per platform: { dartsmind: [...], scolia: [...] }
  members: [], log: [],
  blocked: null,           // {reason:'banned'|'kicked', until}
};

class Fail extends Error { constructor(code, message) { super(message); this.code = code; } }
const fail = (code, message) => { throw new Fail(code, message); };
const ms = t => (t && t.toMillis ? t.toMillis() : typeof t === 'number' ? t : Date.now());
const ts0 = Timestamp.fromMillis(0);
const sortedPair = (a, b) => [String(a), String(b)].sort();
const dmRoom = (p, a, b) => `dm:${p}:` + sortedPair(a, b).join(':');
const roomPlatform = room => room.split(':')[1];
const userOf = d => ({ id: d.uid, name: d.name || 'Unknown', role: d.role || 'player', avatar: d.avatar || null });
function friendly(e) {
  const c = e?.code || '';
  if (c === 'permission-denied') return new Fail(c, 'That is not allowed. If you are muted, you can only read.');
  if (c === 'unavailable') return new Fail(c, 'No connection. Check your internet and try again.');
  return e instanceof Fail ? e : new Fail(c || 'error', e?.message || 'Something went wrong. Try again.');
}
function sanctionFrom(d) {
  const now = Date.now(), mu = ms(d?.mutedUntil || 0), ku = ms(d?.kickedUntil || 0);
  return { muted_until: mu > now ? mu : 0, kicked_until: ku > now ? ku : 0, banned: !!d?.banned };
}

class ChatClient {
  state = initial;
  listeners = new Set();
  subs = new Map();          // name -> unsubscribe
  roomOf = new Map();        // message id -> room
  older = {};                // room -> older messages loaded with loadOlder()
  cursor = {};               // room -> oldest document snapshot (for loadOlder)
  live = {};                 // room -> live window
  posts = [];                // recent post times (spam brake)
  activeRoom = null;

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  set(patch) { this.state = { ...this.state, ...(typeof patch === 'function' ? patch(this.state) : patch) }; this.listeners.forEach(f => f(this.state)); }

  /* ---------- login ---------- */
  async restore() {
    try {
      const [r, p] = await Promise.all([AsyncStorage.getItem(READ_KEY), AsyncStorage.getItem(PLATFORM_KEY)]);
      if (r) this.set({ read: JSON.parse(r) });
      if (P_KEYS.includes(p)) this.set({ platform: p });
    } catch {}
    if (!FIREBASE_READY) return false;
    // Firebase remembers who was logged in.
    const user = await new Promise(res => { const off = onAuthStateChanged(auth, u => { off(); res(u); }); });
    if (!user) return false;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (!snap.exists()) { await signOut(auth); return false; }
      await this.start(snap.data().name);
      return true;
    } catch { this.set({ status: 'offline' }); return true; }
  }

  async login(name, password) {
    if (!FIREBASE_READY) throw new Error('Firebase is not set up yet: fill in app/src/firebaseConfig.js.');
    name = String(name || '').trim();
    if (TEST_MODE) {
      // Test version: pick a name. Staff type the staff code (Firestore: config/staff) as password.
      if (!name || name.length > 30) throw new Error('Pick a name (max 30 characters).');
      if (hasBad(name)) throw new Error('Pick another name.');
      try { await signInAnonymously(auth); }
      catch (e) { throw new Error(e?.code === 'auth/operation-not-allowed' ? 'Turn on "Anonymous" sign-in in Firebase (Authentication > Sign-in method).' : 'Could not log in. Check your internet.'); }
      if (password) { try { await setDoc(doc(db, 'staff', auth.currentUser.uid), { code: String(password) }); } catch {} }
      await this.start(name);
      return;
    }
    // Live: log in with the ddl-online.com account (php/chat-login.php gives a Firebase token).
    let res, data;
    try {
      res = await fetch(LOGIN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: name, password }) });
      data = await res.json();
    } catch { throw new Error('No connection to DDL. Check your internet and try again.'); }
    if (!res.ok) throw new Error(data?.error || 'Login failed.');
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await signInWithCustomToken(auth, data.firebaseToken);
    await this.start(data.user.name);
  }

  async logout() {
    this.stopAll();
    try { await signOut(auth); } catch {}
    await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
    this.older = {}; this.cursor = {}; this.live = {};
    this.set({ ...initial, status: 'idle', platform: this.state.platform, read: this.state.read });
  }

  /* ---------- start: profile + live data ---------- */
  async start(name) {
    this.set({ status: 'connecting' });
    this.name = name;
    this.uid = auth.currentUser.uid;
    if (!this.appSub) this.appSub = AppState.addEventListener('change', s => { if (s === 'active' && this.uid && this.state.status !== 'idle') this.heartbeat(); });
    try {
      const claims = (await auth.currentUser.getIdTokenResult()).claims;
      let admin = claims.ddlRole === 'admin';
      if (!admin) { try { admin = (await getDoc(doc(db, 'staff', this.uid))).exists(); } catch {} }
      this.role = admin ? 'admin' : 'player';
      await this.saveProfile();
      this.set({ me: { id: this.uid, name: this.name, role: this.role, avatar: null, sanction: sanctionFrom(null) } });
      this.connect();
    } catch (e) {
      this.set({ status: 'offline' });
      throw friendly(e);
    }
  }
  saveProfile() {
    return setDoc(doc(db, 'users', this.uid), {
      name: this.name, nameLower: this.name.toLowerCase(), role: this.role, avatar: null, lastSeen: serverTimestamp(),
    });
  }
  heartbeat() {
    this.saveProfile().catch(() => {});
    const since = Timestamp.fromMillis(Date.now() - 5 * MIN);
    getCountFromServer(query(collection(db, 'users'), where('lastSeen', '>', since)))
      .then(c => this.set({ online: c.data().count })).catch(() => {});
  }

  // (Re)start all live listeners. Called after login and by "Try again".
  connect() {
    if (!this.uid) { this.restore().then(ok => { if (!ok) this.set({ status: 'idle' }); }); return; }
    this.stopAll();
    this.set({ status: 'connecting', blocked: null });
    const onErr = e => { if (e?.code !== 'permission-denied') this.set({ status: 'offline' }); };

    // My own sanction: mute notice, or kicked / banned screen.
    this.sub('sanction', onSnapshot(doc(db, 'sanctions', this.uid), s => {
      const sanction = sanctionFrom(s.data());
      this.set(st => ({ me: st.me && { ...st.me, sanction } }));
      if (sanction.banned || sanction.kicked_until) {
        this.stopAll(['sanction']);
        this.set({ blocked: { reason: sanction.banned ? 'banned' : 'kicked', until: sanction.kicked_until } });
      } else if (this.state.blocked) this.connect();
    }, onErr));

    for (const p of P_KEYS) {
      this.watchRoom('general:' + p, () => this.set({ status: 'online' }));
      this.sub('friendlies:' + p, onSnapshot(query(collection(db, 'platforms', p, 'friendlies'), orderBy('ts', 'desc'), limit(60)), s => {
        const all = s.docs.map(d => this.outFriendly(d, p));
        const list = [...all.filter(f => f.status === 'open'), ...all.filter(f => f.status === 'matched').slice(0, 10)];
        this.set(st => ({ friendlies: { ...st.friendlies, [p]: list } }));
      }, onErr));
      this.sub('swap:' + p, onSnapshot(query(collection(db, 'platforms', p, 'swap'), orderBy('ts', 'desc'), limit(60)), s => {
        const list = s.docs.map(d => this.outSwap(d, p)).filter(x => x.status !== 'deleted')
          .sort((a, b) => (a.status === 'done') - (b.status === 'done') || b.ts - a.ts);
        this.set(st => ({ swap: { ...st.swap, [p]: list } }));
      }, onErr));
      this.watchHelp(p, onErr);
    }

    this.sub('dms', onSnapshot(query(collection(db, 'dms'), where('members', 'array-contains', this.uid)), s => {
      const dms = s.docs.map(d => {
        const x = d.data(), otherId = x.members.find(m => m !== this.uid) || this.uid;
        return { room: d.id, platform: x.platform, other: { id: otherId, ...(x.users?.[otherId] || { name: 'Player', role: 'player' }) }, lastAt: ms(x.lastAt), lastBy: x.lastBy };
      }).sort((a, b) => b.lastAt - a.lastAt);
      this.set({ dms });
    }, onErr));

    this.heartbeat();
    clearInterval(this.beat);
    this.beat = setInterval(() => this.heartbeat(), 2 * MIN);
    // Don't spin forever: if nothing arrives within 10 s, show the "Can't reach the chat" screen.
    clearTimeout(this.connectTimer);
    this.connectTimer = setTimeout(() => { if (this.state.status === 'connecting') this.set({ status: 'offline' }); }, 10000);
  }
  sub(name, off) { this.subs.get(name)?.(); this.subs.set(name, off); }
  stopAll(keep = []) {
    for (const [k, off] of this.subs) if (!keep.includes(k)) { off(); this.subs.delete(k); }
    if (!keep.length) { clearInterval(this.beat); clearTimeout(this.connectTimer); }
  }

  watchHelp(p, onErr) {
    const col = collection(db, 'platforms', p, 'help');
    const parts = {};
    const update = () => {
      const seen = new Map();
      for (const list of Object.values(parts)) for (const h of list) seen.set(h.id, h);
      const list = [...seen.values()].filter(h => h.status !== 'deleted').sort((a, b) => b.ts - a.ts);
      this.set(st => ({ help: { ...st.help, [p]: list } }));
    };
    const watch = (key, q) => this.sub(`help:${p}:${key}`, onSnapshot(q, s => { parts[key] = s.docs.map(d => this.outHelp(d, p)); update(); }, onErr));
    // Staff see every question; players their own plus the solved ones (that is what the rules allow).
    if (this.role === 'admin') watch('all', query(col, orderBy('ts', 'desc'), limit(100)));
    else { watch('mine', query(col, where('uid', '==', this.uid), limit(50))); watch('solved', query(col, where('status', '==', 'solved'), limit(50))); }
  }

  /* ---------- messages ---------- */
  watchRoom(room, onFirst) {
    if (this.subs.has('room:' + room)) { onFirst?.(); return Promise.resolve(); }
    return new Promise(resolve => {
      let first = true;
      const q = query(collection(db, 'rooms', room, 'messages'), orderBy('ts', 'desc'), limit(PAGE));
      this.sub('room:' + room, onSnapshot(q, s => {
        // A message that drops out of the live window because a new one arrived is kept as "older".
        const added = s.docChanges().some(c => c.type === 'added');
        for (const c of s.docChanges()) {
          if (c.type === 'removed' && added && !first) {
            this.older[room] = [...(this.older[room] || []), this.outMsg(c.doc, room)].sort((a, b) => a.ts - b.ts);
          }
        }
        this.live[room] = s.docs.map(d => this.outMsg(d, room)).reverse();
        if (first) { this.cursor[room] = s.docs[s.docs.length - 1]; }
        this.set(st => ({ rooms: { ...st.rooms, [room]: [...(this.older[room] || []), ...this.live[room]] },
          more: { ...st.more, [room]: first ? s.docs.length === PAGE : st.more[room] } }));
        const last = this.live[room][this.live[room].length - 1];
        if (last && (room === this.activeRoom || last.user.id === this.uid)) this.markRead(room, last.ts);
        if (first) { first = false; onFirst?.(); resolve(); }
      }, e => { if (e?.code !== 'permission-denied') this.set({ status: 'offline' }); resolve(); }));
    });
  }
  async loadRoom(room) {
    await this.watchRoom(room);
    const list = this.state.rooms[room] || [];
    if (list.length) this.markRead(room, list[list.length - 1].ts);
  }
  async loadOlder(room) {
    if (!this.state.more[room] || !this.cursor[room] || this.loadingOlder) return;
    this.loadingOlder = true;
    try {
      const s = await getDocs(query(collection(db, 'rooms', room, 'messages'), orderBy('ts', 'desc'), startAfter(this.cursor[room]), limit(PAGE)));
      if (s.docs.length) this.cursor[room] = s.docs[s.docs.length - 1];
      const page = s.docs.map(d => this.outMsg(d, room)).reverse();
      this.older[room] = [...page, ...(this.older[room] || [])];
      this.set(st => ({ rooms: { ...st.rooms, [room]: [...this.older[room], ...(this.live[room] || [])] }, more: { ...st.more, [room]: s.docs.length === PAGE } }));
    } finally { this.loadingOlder = false; }
  }
  markRead(room, t) {
    if (!t || (this.state.read[room] || 0) >= t) return;
    this.set(s => ({ read: { ...s.read, [room]: t } }));
    AsyncStorage.setItem(READ_KEY, JSON.stringify(this.state.read)).catch(() => {});
  }
  unread(dm) { return dm.lastBy !== this.uid && dm.lastAt > (this.state.read[dm.room] || 0) ? 1 : 0; }

  setPlatform(p) {
    if (p === this.state.platform) return;
    this.set({ platform: p });
    AsyncStorage.setItem(PLATFORM_KEY, p).catch(() => {});
  }

  /* ---------- shapes the screens use ---------- */
  outMsg(d, room) {
    const x = d.data({ serverTimestamps: 'estimate' });
    this.roomOf.set(d.id, room);
    return { id: d.id, room, user: userOf(x), text: x.text || '', imageUrl: x.imageUrl || null, ts: ms(x.ts) };
  }
  outFriendly(d, p) {
    const x = d.data({ serverTimestamps: 'estimate' });
    return { id: d.id, platform: p, user: userOf(x), format: x.format, custom: x.custom || '', game: x.game, note: x.note || '',
      status: x.status, matchedWith: x.matchedWith ? { id: x.matchedWith, name: x.matchedName || 'Player', role: 'player' } : null, ts: ms(x.ts) };
  }
  outSwap(d, p) {
    const x = d.data({ serverTimestamps: 'estimate' });
    return { id: d.id, platform: p, user: userOf(x), kind: x.kind, title: x.title, price: x.price || '', cond: x.cond,
      desc: x.desc || '', imageUrl: x.imageUrl || null, status: x.status, ts: ms(x.ts) };
  }
  outHelp(d, p) {
    const x = d.data({ serverTimestamps: 'estimate' });
    return { id: d.id, platform: p, user: userOf(x), text: x.text, status: x.status, ts: ms(x.ts),
      answers: (x.answers || []).map(a => ({ user: userOf(a), text: a.text, ts: a.ts })) };
  }

  /* ---------- actions (same names the screens already use) ---------- */
  requestHere(type, data = {}) { return this.request(type, { platform: this.state.platform, ...data }); }
  async request(type, data = {}) {
    const h = this.actions[type];
    if (!h) throw new Fail('unknown', 'Unknown action.');
    if (!this.uid) throw new Fail('offline', 'Log in first.');
    try { return (await h.call(this, data)) || {}; } catch (e) { throw friendly(e); }
  }
  canPost(text = '', what = 'Your message') {
    if (this.state.me?.sanction?.muted_until > Date.now()) fail('muted', 'You are muted. You can still read the chat.');
    if (hasBad(text)) fail('blocked_word', `${what} contains a word that is not allowed in the DDL community.`);
    const now = Date.now();
    this.posts = this.posts.filter(t => now - t < 6000);
    if (this.posts.length >= 6) fail('slow_down', 'You are sending too fast. Wait a few seconds.');
    this.posts.push(now);
  }
  mine() { return { uid: this.uid, name: this.name, role: this.role }; }
  platformOf(kind, id) { return P_KEYS.find(p => (this.state[kind][p] || []).some(x => x.id === id)) || this.state.platform; }
  async openDM(platform, other) {
    const room = dmRoom(platform, this.uid, other.id);
    await this.watchRoom(room);
    return { room, other };
  }
  async postMessage(room, text, imageUrl, otherHint) {
    const batch = writeBatch(db);
    batch.set(doc(collection(db, 'rooms', room, 'messages')), { ...this.mine(), text: text || '', imageUrl: imageUrl || null, ts: serverTimestamp() });
    if (room.startsWith('dm:')) {
      const [, p, a, b] = room.split(':');
      const otherId = a === this.uid ? b : a;
      const known = this.state.dms.find(d => d.room === room)?.other || otherHint;
      const other = known || userOf({ uid: otherId, ...(await getDoc(doc(db, 'users', otherId))).data() });
      batch.set(doc(db, 'dms', room), {
        room, platform: p, members: [a, b], lastBy: this.uid, lastAt: serverTimestamp(),
        users: { [this.uid]: { name: this.name, role: this.role }, [otherId]: { name: other.name, role: other.role || 'player' } },
      });
    }
    await batch.commit();
  }

  actions = {
    async history({ room }) { await this.watchRoom(room); return { room, messages: this.state.rooms[room] || [] }; },

    async send({ room, text, imageUrl }) {
      text = String(text || '').trim().slice(0, 1000);
      if (!text && !imageUrl) fail('empty', 'Write a message or add a picture.');
      this.canPost(text);
      await this.postMessage(room, text, imageUrl);
    },
    async delete({ id }) {
      const room = this.roomOf.get(id); if (!room) return;
      const msg = (this.state.rooms[room] || []).find(m => m.id === id);
      await deleteDoc(doc(db, 'rooms', room, 'messages', id));
      this.older[room] = (this.older[room] || []).filter(m => m.id !== id);
      if (msg && msg.user.id !== this.uid) await this.log('delete', msg.user, `[${roomPlatform(room)}] ` + (msg.text || '[picture]').slice(0, 110));
    },

    async 'dm.open'({ userId, platform }) {
      if (!userId || userId === this.uid) fail('not_found', 'Player not found.');
      const snap = await getDoc(doc(db, 'users', userId));
      if (!snap.exists()) fail('not_found', 'Player not found.');
      return this.openDM(platform || this.state.platform, userOf({ uid: userId, ...snap.data() }));
    },
    async 'dm.list'() { return { list: this.state.dms }; },
    async 'users.search'({ q }) {
      const s = String(q || '').trim().toLowerCase();
      const col = collection(db, 'users');
      const snap = await getDocs(s
        ? query(col, where('nameLower', '>=', s), where('nameLower', '<=', s + ''), limit(25))
        : query(col, orderBy('lastSeen', 'desc'), limit(25)));
      const now = Date.now();
      return { list: snap.docs.filter(d => d.id !== this.uid).map(d => ({ ...userOf({ uid: d.id, ...d.data() }), online: now - ms(d.data().lastSeen) < 5 * MIN })) };
    },

    async 'friendly.post'({ platform, format, custom, game, note }) {
      if (!['FT3', 'FT5', 'Other'].includes(format)) fail('bad_input', 'Pick FT3, FT5 or Other.');
      custom = format === 'Other' ? String(custom || '').trim().slice(0, 40) : '';
      if (format === 'Other' && !custom) fail('bad_input', 'Describe the format, for example "Best of 7 sets".');
      note = String(note || '').trim().slice(0, 120);
      this.canPost(custom + ' ' + note);
      const batch = writeBatch(db);
      // One open friendly per player per platform.
      for (const f of this.state.friendlies[platform] || []) if (f.user.id === this.uid && f.status === 'open') batch.update(doc(db, 'platforms', platform, 'friendlies', f.id), { status: 'cancelled' });
      const ref = doc(collection(db, 'platforms', platform, 'friendlies'));
      batch.set(ref, { ...this.mine(), format, custom, game: ['501', '301', '701', 'Cricket'].includes(game) ? game : '501', note, status: 'open', ts: serverTimestamp() });
      await batch.commit();
      return { id: ref.id };
    },
    async 'friendly.cancel'({ id }) {
      await updateDoc(doc(db, 'platforms', this.platformOf('friendlies', id), 'friendlies', id), { status: 'cancelled' });
    },
    async 'friendly.accept'({ id }) {
      const p = this.platformOf('friendlies', id);
      const f = (this.state.friendlies[p] || []).find(x => x.id === id);
      if (!f || f.status !== 'open') fail('gone', 'This friendly was already taken.');
      this.canPost();
      try { await updateDoc(doc(db, 'platforms', p, 'friendlies', id), { status: 'matched', matchedWith: this.uid, matchedName: this.name }); }
      catch (e) { if (e?.code === 'permission-denied') fail('gone', 'This friendly was already taken.'); throw e; }
      const r = await this.openDM(p, f.user);
      await this.postMessage(r.room, `🎯 I accepted your ${f.format === 'Other' ? f.custom : f.format} friendly (${f.game}). Ready when you are!`, null, f.user);
      return r;
    },

    async 'swap.post'({ platform, kind, title, price, cond, desc, imageUrl }) {
      if (!['Sell', 'Swap', 'Wanted'].includes(kind)) fail('bad_input', 'Pick Sell, Swap or Wanted.');
      title = String(title || '').trim().slice(0, 70); desc = String(desc || '').trim().slice(0, 400); cond = String(cond || 'Used').trim().slice(0, 20);
      price = kind === 'Sell' ? String(price || '').replace(/[^\d.,]/g, '').slice(0, 12) : '';
      if (!title) fail('bad_input', 'Add a title.');
      this.canPost(title + ' ' + desc + ' ' + cond, 'Your listing');
      const ref = await addDoc(collection(db, 'platforms', platform, 'swap'), { ...this.mine(), kind, title, price, cond, desc, imageUrl: imageUrl || null, status: 'open', ts: serverTimestamp() });
      return { id: ref.id };
    },
    async 'swap.done'({ id }) { await updateDoc(doc(db, 'platforms', this.platformOf('swap', id), 'swap', id), { status: 'done' }); },
    async 'swap.delete'({ id }) {
      const p = this.platformOf('swap', id);
      const s = (this.state.swap[p] || []).find(x => x.id === id);
      await updateDoc(doc(db, 'platforms', p, 'swap', id), { status: 'deleted' });
      if (s && s.user.id !== this.uid) await this.log('swap_delete', s.user, `[${p}] ${s.title}`);
    },

    async 'help.ask'({ platform, text }) {
      text = String(text || '').trim().slice(0, 300);
      if (!isQuestion(text)) fail('not_question', 'The help desk is for questions only. Ask a question, or use General chat.');
      this.canPost(text, 'Your question');
      const ref = await addDoc(collection(db, 'platforms', platform, 'help'), { ...this.mine(), text, status: 'open', answers: [], ts: serverTimestamp() });
      return { id: ref.id };
    },
    async 'help.answer'({ id, text }) {
      if (this.role !== 'admin') fail('forbidden', 'Only staff can answer help questions.');
      text = String(text || '').trim().slice(0, 1000);
      if (!text) fail('empty', 'Write an answer.');
      if (hasBad(text)) fail('blocked_word', 'Your answer contains a word that is not allowed.');
      await updateDoc(doc(db, 'platforms', this.platformOf('help', id), 'help', id), { status: 'solved', answers: arrayUnion({ ...this.mine(), text, ts: Date.now() }) });
    },
    async 'help.status'({ id, status }) {
      await updateDoc(doc(db, 'platforms', this.platformOf('help', id), 'help', id), { status });
    },
    async 'help.private'({ id }) {
      if (this.role !== 'admin') fail('forbidden', 'Only staff can do this.');
      const p = this.platformOf('help', id);
      const h = (this.state.help[p] || []).find(x => x.id === id);
      if (!h) fail('not_found', 'Question not found.');
      const r = await this.openDM(p, h.user);
      await this.postMessage(r.room, `About your help desk question: “${h.text}”\nLet's sort it out here.`, null, h.user);
      await updateDoc(doc(db, 'platforms', p, 'help', id), { answers: arrayUnion({ ...this.mine(), text: 'Continued in a private chat.', ts: Date.now() }) });
      return r;
    },

    async 'admin.members'() {
      if (this.role !== 'admin') fail('forbidden', 'Staff only.');
      const [users, sanctions] = await Promise.all([
        getDocs(query(collection(db, 'users'), orderBy('lastSeen', 'desc'), limit(500))),
        getDocs(collection(db, 'sanctions')),
      ]);
      const sans = new Map(sanctions.docs.map(d => [d.id, sanctionFrom(d.data())]));
      const now = Date.now();
      const list = users.docs.map(d => {
        const x = d.data(), lastSeen = ms(x.lastSeen);
        return { ...userOf({ uid: d.id, ...x }), online: now - lastSeen < 5 * MIN, lastSeen, sanction: sans.get(d.id) || sanctionFrom(null) };
      });
      return { list, log: await this.loadLog() };
    },
    async mod({ action, userId, minutes }) {
      if (this.role !== 'admin') fail('forbidden', 'Staff only.');
      const target = this.state.members.find(m => m.id === userId) || userOf({ uid: userId, ...(await getDoc(doc(db, 'users', userId))).data() });
      if (target.role === 'admin') fail('forbidden', 'Staff members cannot be moderated here.');
      const cur = await getDoc(doc(db, 'sanctions', userId));
      const s = { mutedUntil: cur.data()?.mutedUntil || ts0, kickedUntil: cur.data()?.kickedUntil || ts0, banned: !!cur.data()?.banned };
      const req = +minutes > 0 ? Math.min(60 * 24 * 30, Math.round(+minutes)) : 0;
      let detail = '';
      if (action === 'mute') { const m = req || 10; s.mutedUntil = Timestamp.fromMillis(Date.now() + m * MIN); detail = `${m} min`; }
      else if (action === 'unmute') s.mutedUntil = ts0;
      else if (action === 'kick') { const m = req || 30; s.kickedUntil = Timestamp.fromMillis(Date.now() + m * MIN); detail = `${m} min`; }
      else if (action === 'unkick') s.kickedUntil = ts0;
      else if (action === 'ban') s.banned = true;
      else if (action === 'unban') s.banned = false;
      else fail('bad_input', 'Unknown action.');
      await setDoc(doc(db, 'sanctions', userId), { ...s, by: this.uid, at: serverTimestamp() });
      await this.log(action, target, detail);
      const sanction = sanctionFrom(s);
      this.set(st => ({ members: st.members.map(m => m.id === userId ? { ...m, sanction } : m) }));
      return { sanction };
    },
  };

  async log(action, target, detail) {
    await addDoc(collection(db, 'modlog'), { adminUid: this.uid, adminName: this.name, action, targetUid: target?.id || null, targetName: target?.name || '', detail: detail || '', ts: serverTimestamp() }).catch(() => {});
    if (this.role === 'admin') this.loadLog().then(log => this.set({ log })).catch(() => {});
  }
  async loadLog() {
    const s = await getDocs(query(collection(db, 'modlog'), orderBy('ts', 'desc'), limit(50)));
    return s.docs.map(d => {
      const x = d.data({ serverTimestamps: 'estimate' });
      return { id: d.id, admin: { id: x.adminUid, name: x.adminName }, action: x.action, target: x.targetUid ? { id: x.targetUid, name: x.targetName } : null, detail: x.detail, ts: ms(x.ts) };
    });
  }

  /* ---------- pictures (through the DDL site, live mode only) ---------- */
  async uploadImage(uri) {
    if (!UPLOAD_URL) throw new Error('Pictures work once the chat is connected to ddl-online.com.');
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    const form = new FormData();
    if (Platform.OS === 'web') form.append('image', await (await fetch(uri)).blob(), 'photo.jpg');
    else form.append('image', { uri, name: 'photo.jpg', type: 'image/jpeg' });
    let res, data;
    try {
      res = await fetch(UPLOAD_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form });
      data = await res.json();
    } catch { throw new Error('Upload failed. Check your connection.'); }
    if (!res.ok) throw new Error(data?.error || 'Upload failed.');
    return data.url;
  }
}

export const chat = new ChatClient();

export function useChat() {
  const [s, setS] = useState(chat.state);
  useEffect(() => chat.subscribe(setS), []);
  return s;
}

export const isMuted = me => !!me?.sanction?.muted_until && me.sanction.muted_until > Date.now();
export const CAN_UPLOAD = !!UPLOAD_URL;

// The list of friendlies / swap / help for the platform the player is looking at.
export const listHere = (st, key) => st[key]?.[st.platform] || [];
