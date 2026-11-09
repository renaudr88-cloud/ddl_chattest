'use strict';
// Storage layer. DB_DRIVER=mysql (production) or DB_DRIVER=memory (local testing, data is lost on restart).

const TABLES = ['chat_users', 'chat_messages', 'chat_friendlies', 'chat_swap', 'chat_help',
  'chat_help_answers', 'chat_sanctions', 'chat_mod_log'];

/* ---------------- MySQL ---------------- */
function mysqlDriver() {
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: +(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectionLimit: 10,
    charset: 'utf8mb4',
    supportBigNumbers: true,
    bigNumberStrings: false,
  });
  const q = async (sql, params = []) => (await pool.query(sql, params))[0];
  const insert = async (table, obj) => (await q(`INSERT INTO ${table} SET ?`, [obj])).insertId;
  const update = async (table, id, patch) => q(`UPDATE ${table} SET ? WHERE id = ?`, [patch, id]);
  const get = async (table, id) => (await q(`SELECT * FROM ${table} WHERE id = ?`, [id]))[0] || null;

  return {
    async init() { await q('SELECT 1'); },
    allUsers: () => q('SELECT * FROM chat_users'),
    upsertUser: u => q(
      'INSERT INTO chat_users (id,name,role,avatar,last_seen) VALUES (?,?,?,?,?) ' +
      'ON DUPLICATE KEY UPDATE name=VALUES(name), role=VALUES(role), avatar=VALUES(avatar), last_seen=VALUES(last_seen)',
      [u.id, u.name, u.role, u.avatar || null, u.last_seen]),
    insertMessage: m => insert('chat_messages', m),
    getMessage: id => get('chat_messages', id),
    markDeleted: id => update('chat_messages', id, { deleted: 1 }),
    history: (room, before, limit) => q(
      `SELECT * FROM (SELECT * FROM chat_messages WHERE room = ? AND deleted = 0 ${before ? 'AND id < ?' : ''}
       ORDER BY id DESC LIMIT ?) t ORDER BY id ASC`, before ? [room, before, limit] : [room, limit]),
    dmRooms: uid => q(
      `SELECT room, MAX(id) AS last_id, MAX(created_at) AS last_at FROM chat_messages
       WHERE room LIKE 'dm:%' AND (room LIKE ? OR room LIKE ?) GROUP BY room ORDER BY last_id DESC LIMIT 100`,
      [`dm:${uid}:%`, `dm:%:${uid}`]),

    friendlies: {
      list: () => q(`(SELECT * FROM chat_friendlies WHERE status='open' ORDER BY created_at DESC LIMIT 200)
                     UNION ALL (SELECT * FROM chat_friendlies WHERE status='matched' ORDER BY created_at DESC LIMIT 10)`),
      add: f => insert('chat_friendlies', f),
      get: id => get('chat_friendlies', id),
      update: (id, p) => update('chat_friendlies', id, p),
      cancelOpenBy: uid => q(`UPDATE chat_friendlies SET status='cancelled' WHERE user_id=? AND status='open'`, [uid]),
    },
    swap: {
      list: () => q(`SELECT * FROM chat_swap WHERE status<>'deleted' ORDER BY status='done', created_at DESC LIMIT 150`),
      add: s => insert('chat_swap', s),
      get: id => get('chat_swap', id),
      update: (id, p) => update('chat_swap', id, p),
    },
    help: {
      async list() {
        const qs = await q(`SELECT * FROM chat_help WHERE status<>'deleted' ORDER BY created_at DESC LIMIT 150`);
        if (!qs.length) return [];
        const ans = await q(`SELECT * FROM chat_help_answers WHERE help_id IN (?) ORDER BY id`, [qs.map(x => x.id)]);
        return qs.map(x => ({ ...x, answers: ans.filter(a => a.help_id === x.id) }));
      },
      add: h => insert('chat_help', h),
      get: id => get('chat_help', id),
      update: (id, p) => update('chat_help', id, p),
      addAnswer: a => insert('chat_help_answers', a),
    },
    sanctions: {
      all: () => q('SELECT * FROM chat_sanctions'),
      set: s => q(`INSERT INTO chat_sanctions SET ? ON DUPLICATE KEY UPDATE muted_until=VALUES(muted_until),
        kicked_until=VALUES(kicked_until), banned=VALUES(banned), updated_by=VALUES(updated_by), updated_at=VALUES(updated_at)`, [s]),
    },
    log: {
      add: l => insert('chat_mod_log', l),
      list: limit => q('SELECT * FROM chat_mod_log ORDER BY id DESC LIMIT ?', [limit]),
    },
  };
}

/* ---------------- Memory (testing) ---------------- */
function memoryDriver() {
  const T = Object.fromEntries(TABLES.map(t => [t, []]));
  const seq = Object.fromEntries(TABLES.map(t => [t, 0]));
  const insert = (t, o) => { const id = ++seq[t]; T[t].push({ ...o, id }); return id; };
  const get = (t, id) => T[t].find(r => r.id == id) || null;
  const update = (t, id, p) => { const r = get(t, id); if (r) Object.assign(r, p); };
  const byNewest = (a, b) => b.created_at - a.created_at;

  return {
    async init() {},
    async allUsers() { return T.chat_users; },
    async upsertUser(u) {
      const r = T.chat_users.find(x => x.id === u.id);
      r ? Object.assign(r, u) : T.chat_users.push({ ...u });
    },
    async insertMessage(m) { return insert('chat_messages', { deleted: 0, ...m }); },
    async getMessage(id) { return get('chat_messages', id); },
    async markDeleted(id) { update('chat_messages', id, { deleted: 1 }); },
    async history(room, before, limit) {
      return T.chat_messages.filter(m => m.room === room && !m.deleted && (!before || m.id < before)).slice(-limit);
    },
    async dmRooms(uid) {
      const map = new Map();
      for (const m of T.chat_messages) {
        if (!m.room.startsWith('dm:') || !m.room.split(':').slice(1).includes(uid)) continue;
        map.set(m.room, { room: m.room, last_id: m.id, last_at: m.created_at });
      }
      return [...map.values()].sort((a, b) => b.last_id - a.last_id);
    },
    friendlies: {
      async list() {
        const f = T.chat_friendlies;
        return [...f.filter(x => x.status === 'open').sort(byNewest), ...f.filter(x => x.status === 'matched').sort(byNewest).slice(0, 10)];
      },
      async add(f) { return insert('chat_friendlies', { status: 'open', ...f }); },
      async get(id) { return get('chat_friendlies', id); },
      async update(id, p) { update('chat_friendlies', id, p); },
      async cancelOpenBy(uid) { T.chat_friendlies.forEach(f => { if (f.user_id === uid && f.status === 'open') f.status = 'cancelled'; }); },
    },
    swap: {
      async list() { return T.chat_swap.filter(s => s.status !== 'deleted').sort((a, b) => (a.status === 'done') - (b.status === 'done') || byNewest(a, b)); },
      async add(s) { return insert('chat_swap', { status: 'open', ...s }); },
      async get(id) { return get('chat_swap', id); },
      async update(id, p) { update('chat_swap', id, p); },
    },
    help: {
      async list() {
        return T.chat_help.filter(h => h.status !== 'deleted').sort(byNewest)
          .map(h => ({ ...h, answers: T.chat_help_answers.filter(a => a.help_id === h.id) }));
      },
      async add(h) { return insert('chat_help', { status: 'open', ...h }); },
      async get(id) { return get('chat_help', id); },
      async update(id, p) { update('chat_help', id, p); },
      async addAnswer(a) { return insert('chat_help_answers', a); },
    },
    sanctions: {
      async all() { return T.chat_sanctions; },
      async set(s) {
        const r = T.chat_sanctions.find(x => x.user_id === s.user_id);
        r ? Object.assign(r, s) : T.chat_sanctions.push({ ...s });
      },
    },
    log: {
      async add(l) { return insert('chat_mod_log', l); },
      async list(limit) { return [...T.chat_mod_log].reverse().slice(0, limit); },
    },
  };
}

module.exports = (process.env.DB_DRIVER || 'mysql') === 'memory' ? memoryDriver() : mysqlDriver();
