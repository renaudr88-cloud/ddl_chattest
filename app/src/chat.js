// Connection + shared state for the whole app. Screens read it with useChat() and call chat.request(...).
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WS_URL, LOGIN_URL, UPLOAD_URL } from './config';
import { PLATFORMS } from './platforms';

const TOKEN_KEY = 'ddl-chat-token';
const READ_KEY = 'ddl-chat-read';
const PLATFORM_KEY = 'ddl-chat-platform';

const initial = {
  status: 'idle',          // idle | connecting | online | offline
  me: null,                // {id,name,role,avatar,sanction}
  online: 0,
  rooms: {},               // room -> messages[]
  more: {},                // room -> bool (older messages available)
  platform: PLATFORMS[0].key, // the platform the player is looking at (Dartsmind / Scolia)
  dms: [],                 // [{room, platform, other, lastId, lastAt, online}]
  read: {},                // room -> last read message id
  friendlies: {}, swap: {}, help: {}, // per platform: { dartsmind: [...], scolia: [...] }
  members: [], log: [],
  blocked: null,           // {reason:'banned'|'kicked', until}
};

class ChatClient {
  state = initial;
  listeners = new Set();
  ws = null; token = null; rid = 0; pending = new Map();
  retry = 0; retryTimer = null; activeRoom = null; stopped = true;

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  set(patch) { this.state = { ...this.state, ...(typeof patch === 'function' ? patch(this.state) : patch) }; this.listeners.forEach(f => f(this.state)); }

  /* ---------- auth ---------- */
  async restore() {
    try {
      const [t, r, p] = await Promise.all([AsyncStorage.getItem(TOKEN_KEY), AsyncStorage.getItem(READ_KEY), AsyncStorage.getItem(PLATFORM_KEY)]);
      if (r) this.set({ read: JSON.parse(r) });
      if (PLATFORMS.some(x => x.key === p)) this.set({ platform: p });
      if (t) { this.start(t); return true; }
    } catch {}
    return false;
  }
  async login(login, password) {
    let res, data;
    try {
      res = await fetch(LOGIN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login, password }) });
      data = await res.json();
    } catch { throw new Error('No connection to DDL. Check your internet and try again.'); }
    if (!res.ok) throw new Error(data?.error || 'Login failed.');
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    this.start(data.token);
  }
  async logout() {
    this.stop();
    await AsyncStorage.removeItem(TOKEN_KEY);
    this.set({ ...initial, status: 'idle', platform: this.state.platform });
  }

  /* ---------- socket ---------- */
  start(token) {
    this.token = token; this.stopped = false;
    if (!this.appSub) this.appSub = AppState.addEventListener('change', s => { if (s === 'active' && !this.stopped && this.state.status === 'offline') this.connect(); });
    this.connect();
  }
  stop() { this.stopped = true; clearTimeout(this.retryTimer); this.ws?.close(); this.ws = null; }

  connect() {
    clearTimeout(this.retryTimer);
    if (this.ws) { this.ws.onclose = null; this.ws.close(); }
    this.set({ status: 'connecting' });
    const ws = new WebSocket(WS_URL);
    this.ws = ws;
    // Don't wait forever: if the server has not answered within 10 s, give up this try (it retries by itself).
    clearTimeout(this.connectTimer);
    this.connectTimer = setTimeout(() => { if (this.ws === ws && this.state.status !== 'online') ws.close(); }, 10000);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: this.token }));
    ws.onmessage = e => { try { this.onEvent(JSON.parse(e.data)); } catch {} };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      for (const p of this.pending.values()) p.reject({ code: 'offline', message: 'Connection lost. Try again.' });
      this.pending.clear();
      this.set({ status: 'offline' });
      if (this.stopped || this.state.blocked) return;
      const wait = Math.min(30000, 1000 * 2 ** this.retry++);
      this.retryTimer = setTimeout(() => this.connect(), wait);
    };
  }

  request(type, data = {}) {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== 1) return reject({ code: 'offline', message: 'Not connected yet. Try again in a moment.' });
      const rid = ++this.rid;
      const timer = setTimeout(() => { this.pending.delete(rid); reject({ code: 'timeout', message: 'The server did not answer. Try again.' }); }, 15000);
      this.pending.set(rid, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
      this.ws.send(JSON.stringify({ type, rid, ...data }));
    });
  }

  onEvent(m) {
    if (m.type === 'ack' || (m.type === 'error' && m.rid)) {
      const p = this.pending.get(m.rid); this.pending.delete(m.rid);
      if (p) m.type === 'ack' ? p.resolve(m.data || {}) : p.reject({ code: m.code, message: m.message });
      return;
    }
    switch (m.type) {
      case 'ready':
        this.retry = 0; clearTimeout(this.connectTimer);
        this.set(s => {
          const rooms = { ...s.rooms }, more = { ...s.more };
          for (const p of Object.keys(m.general)) { rooms['general:' + p] = m.general[p]; more['general:' + p] = m.generalMore[p]; }
          return { status: 'online', blocked: null, me: m.me, online: m.online, rooms, more,
            dms: m.dms, friendlies: m.friendlies, swap: m.swap, help: m.help };
        });
        // Refresh an open private chat after a reconnect.
        if (this.activeRoom && this.activeRoom.startsWith('dm:')) this.loadRoom(this.activeRoom);
        break;
      case 'message': this.addMessage(m.message); break;
      case 'deleted':
        this.set(s => ({ rooms: { ...s.rooms, [m.room]: (s.rooms[m.room] || []).filter(x => x.id !== m.id) } }));
        break;
      case 'friendlies': case 'swap': case 'help':
        this.set(s => ({ [m.type]: { ...s[m.type], [m.platform]: m.list } })); break;
      case 'presence': this.set({ online: m.online }); break;
      case 'sanction': this.set(s => ({ me: { ...s.me, sanction: m.sanction } })); break;
      case 'blocked': this.set({ blocked: { reason: m.reason, until: m.until } }); break;
      case 'auth_failed': this.logout(); break;
      case 'modlog': this.set({ log: m.list }); break;
      case 'member': this.set(s => ({ members: s.members.map(x => x.id === m.member.id ? { ...x, ...m.member } : x) })); break;
    }
  }

  addMessage(msg) {
    this.set(s => {
      const list = s.rooms[msg.room];
      const rooms = list ? { ...s.rooms, [msg.room]: [...list, msg].slice(-500) } : s.rooms;
      let dms = s.dms;
      if (msg.room.startsWith('dm:')) {
        const found = dms.find(d => d.room === msg.room);
        const entry = found ? { ...found, lastId: msg.id, lastAt: msg.ts }
          : msg.user.id !== s.me?.id ? { room: msg.room, platform: msg.room.split(':')[1], other: msg.user, lastId: msg.id, lastAt: msg.ts } : null;
        if (entry) dms = [entry, ...dms.filter(d => d.room !== msg.room)];
      }
      return { rooms, dms };
    });
    if (msg.room === this.activeRoom || msg.user.id === this.state.me?.id) this.markRead(msg.room, msg.id);
  }

  async loadRoom(room) {
    const r = await this.request('history', { room });
    this.set(s => ({ rooms: { ...s.rooms, [room]: r.messages }, more: { ...s.more, [room]: r.more } }));
    const last = r.messages[r.messages.length - 1];
    if (last) this.markRead(room, last.id);
  }
  async loadOlder(room) {
    const list = this.state.rooms[room] || [];
    if (!list.length || !this.state.more[room]) return;
    const r = await this.request('history', { room, before: list[0].id });
    this.set(s => ({ rooms: { ...s.rooms, [room]: [...r.messages, ...(s.rooms[room] || [])] }, more: { ...s.more, [room]: r.more } }));
  }
  markRead(room, id) {
    if ((this.state.read[room] || 0) >= id) return;
    this.set(s => ({ read: { ...s.read, [room]: id } }));
    AsyncStorage.setItem(READ_KEY, JSON.stringify(this.state.read)).catch(() => {});
  }
  setPlatform(p) {
    if (p === this.state.platform) return;
    this.set({ platform: p });
    AsyncStorage.setItem(PLATFORM_KEY, p).catch(() => {});
  }
  // Request with the current platform added (friendlies, swap, help, dm.open)
  requestHere(type, data = {}) { return this.request(type, { platform: this.state.platform, ...data }); }

  unread(dm) { return dm.lastId > (this.state.read[dm.room] || 0) ? 1 : 0; }

  async uploadImage(uri) {
    const form = new FormData();
    if (Platform.OS === 'web') form.append('image', await (await fetch(uri)).blob(), 'photo.jpg'); // browser: real file
    else form.append('image', { uri, name: 'photo.jpg', type: 'image/jpeg' });                      // phone
    let res, data;
    try {
      res = await fetch(UPLOAD_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + this.token }, body: form });
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

// The list of friendlies / swap / help for the platform the player is looking at.
export const listHere = (st, key) => st[key]?.[st.platform] || [];
