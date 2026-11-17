// DDL Scolia bridge: keeps a live connection to the Scolia boards of the players in a DDL match
// (Scolia External API v1.4.1), counts the match from their throws (x01.js), and sends the result to ddl-online.com.
//
//   Website ──GET scolia-matches.php──▶ which matches are on now, with each player's board serial
//   Bridge ──wss (serialNumber + accessToken)──▶ Scolia, one connection per board
//          ◀── HELLO_CLIENT / SBC_STATUS_CHANGED / THROW_DETECTED / TAKEOUT_FINISHED
//   Bridge ──POST scolia-result.php (signed)──▶ website saves the result and stats
//   Bridge ──http://127.0.0.1:PORT/live/<match>──▶ live score for the scoreboard (website / app, via the web server)
//
// Settings: scolia/config.json (never in git), see config.example.json.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const WebSocket = require('ws');
const x01 = require('./x01');

const CONFIG_FILE = process.env.SCOLIA_CONFIG || path.join(__dirname, 'config.json');
const cfg = Object.assign({
  scoliaUrl: 'wss://game.scoliadarts.com/api/v1/external',
  accessToken: '',             // the Scolia Service Account access token (secret)
  siteUrl: 'https://ddl-online.com',
  secret: '',                  // shared with the website (SCOLIA_BRIDGE_SECRET in chat-config.php), signs the requests
  matchesFile: '',             // testing: read the matches from this JSON file instead of the website
  port: 8787,                  // live score and board status, on this computer only (127.0.0.1)
  pollSeconds: 30,
  stateFile: path.join(__dirname, 'state.json'),
}, JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')));

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------- signed requests to the website ----------
// X-DDL-Time + X-DDL-Sign = HMAC-SHA256(secret, time + "\n" + body). The website refuses anything older than 5 minutes.
function sign(body) {
  const t = String(Math.floor(Date.now() / 1000));
  return { 'X-DDL-Time': t, 'X-DDL-Sign': crypto.createHmac('sha256', cfg.secret).update(t + '\n' + body).digest('hex') };
}
async function site(file, data) {
  const body = data ? JSON.stringify(data) : '';
  const res = await fetch(cfg.siteUrl.replace(/\/$/, '') + '/' + file, {
    method: data ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...sign(body) },
    body: data ? body : undefined,
  });
  if (!res.ok) { const e = new Error(`${file}: HTTP ${res.status}`); e.status = res.status; throw e; }
  return res.json();
}

// ---------- matches ----------
// A match from the website: { match, tournament, legsToWin, first, players: [{ id, name, serial }, { ... }] }
const matches = new Map();   // match id -> { info, game, sent }
const pending = [];          // results not yet accepted by the website

function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(cfg.stateFile, 'utf8'));
    for (const x of s.matches || []) matches.set(x.info.match, x);
    pending.push(...(s.pending || []));
    log(`state: ${matches.size} match(es), ${pending.length} result(s) to send`);
  } catch {}
}
let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = cfg.stateFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ matches: [...matches.values()], pending }));
    fs.renameSync(tmp, cfg.stateFile);
  }, 200);
}

async function fetchMatches() {
  if (cfg.matchesFile) return JSON.parse(fs.readFileSync(cfg.matchesFile, 'utf8'));
  return (await site('scolia-matches.php')).matches || [];
}

async function refresh() {
  let list;
  try { list = await fetchMatches(); } catch (e) { log('matches:', e.message); return; }
  const now = new Set();
  for (const info of list) {
    const ok = info && info.match && Array.isArray(info.players) && info.players.length === 2 && info.players.every(p => p.serial);
    if (!ok) continue;
    now.add(info.match);
    if (!matches.has(info.match)) {
      matches.set(info.match, { info, game: x01.createMatch({ players: info.players, legsToWin: info.legsToWin || 3, start: info.start || 501, first: info.first === 0 || info.first === 1 ? info.first : null }), sent: false });
      log(`match ${info.match}: ${info.players[0].name || info.players[0].id} vs ${info.players[1].name || info.players[1].id}, first to ${info.legsToWin || 3}`);
      saveState();
    }
  }
  // Matches the website no longer lists (cancelled, or an admin entered the result): stop following them.
  for (const [id, m] of matches) if (!now.has(id) && (m.sent || !m.game || m.game.winner === null)) { matches.delete(id); saveState(); }
  syncBoards();
}

// ---------- Scolia board connections ----------
const boards = new Map();   // serial -> Board
const STOP = { 4100: 'invalid serial number', 4102: 'invalid access token', 4103: 'board suspended', 4104: 'replaced by another connection' };

class Board {
  constructor(serial) {
    this.serial = serial;
    this.status = 'Offline'; this.phase = null; this.errorType = null;
    this.problem = null;       // why we stopped trying (4100, 4102, 4103, 4104)
    this.wanted = true; this.retry = 0; this.ws = null;
    this.connect();
  }
  connect() {
    if (!this.wanted || this.problem) return;
    const url = `${cfg.scoliaUrl}?serialNumber=${encodeURIComponent(this.serial)}&accessToken=${encodeURIComponent(cfg.accessToken)}`;
    const ws = this.ws = new WebSocket(url);
    ws.on('open', () => { this.retry = 0; log(`board ${this.serial}: connected`); });
    ws.on('message', raw => { let msg; try { msg = JSON.parse(raw); } catch { return; } this.onMessage(msg); });
    ws.on('close', code => {
      this.status = 'Offline'; this.phase = null;
      if (STOP[code]) { this.problem = `${code} ${STOP[code]}`; log(`board ${this.serial}: stopped (${this.problem})`); return; }
      if (!this.wanted) return;
      // 4000 (no pong in time), 4101 (someone else is connected to this board), network trouble: try again, slower each time.
      const wait = Math.min(60000, 2000 * 2 ** this.retry++);
      log(`board ${this.serial}: closed ${code}, again in ${wait / 1000}s`);
      setTimeout(() => this.connect(), wait);
    });
    ws.on('error', e => log(`board ${this.serial}: ${e.message}`));
  }
  send(type, payload) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type, id: crypto.randomUUID(), ...(payload ? { payload } : {}) }));
  }
  onMessage(msg) {
    const p = msg.payload || {};
    switch (msg.type) {
      case 'HELLO_CLIENT': case 'SBC_STATUS': case 'SBC_STATUS_CHANGED':
        this.status = p.boardStatus || 'Offline'; this.phase = p.boardPhase ?? null; this.errorType = p.errorType ?? null;
        log(`board ${this.serial}: ${this.status}${this.phase ? ' / ' + this.phase : ''}${this.errorType ? ' (' + this.errorType + ' error)' : ''}`);
        break;
      case 'THROW_DETECTED': onThrow(this.serial, p); break;
      case 'TAKEOUT_STARTED': this.phase = 'Takeout'; break;
      case 'TAKEOUT_FINISHED': this.phase = 'Throw'; onTakeout(this.serial, p); break;
      case 'REFUSED': log(`board ${this.serial}: refused: ${p.errorMessage || p.error}`); break;
    }
  }
  close() { this.wanted = false; try { this.ws?.close(); } catch {} }
}

function syncBoards() {
  const need = new Set();
  for (const m of matches.values()) if (!m.sent && m.game.winner === null) for (const p of m.info.players) need.add(String(p.serial));
  for (const s of need) if (!boards.has(s)) boards.set(s, new Board(s));
  for (const [s, b] of boards) if (!need.has(s)) { b.close(); boards.delete(s); }
}

const matchOf = serial => [...matches.values()].find(m => !m.sent && m.game.winner === null && m.info.players.some(p => String(p.serial) === serial));

function onThrow(serial, p) {
  const m = matchOf(serial);
  if (!m) return;
  const r = x01.addThrow(m.game, serial, p.bounceout ? 'None' : p.sector, p.detectionTime);
  push(m);
  saveState();
  if (r.matchWon) finish(m);
}
function onTakeout(serial, p) {
  const m = matchOf(serial);
  if (!m) return;
  x01.addTakeout(m.game, serial, !!p.falseTakeout);
  push(m);
  saveState();
}

// ---------- results to the website ----------
function finish(m) {
  const res = x01.result(m.game);
  log(`match ${m.info.match}: finished ${res.score1}-${res.score2}`);
  pending.push({ match: m.info.match, tournament: m.info.tournament, players: m.info.players.map(p => p.id), result: res, log: m.game.log.slice(-400) });
  m.sent = true;
  saveState();
  syncBoards();
  sendPending();
}
async function sendPending() {
  while (pending.length) {
    const r = pending[0];
    try {
      const ans = await site('scolia-result.php', r);
      log(`match ${r.match}: result sent (${ans.message || 'ok'})`);
      pending.shift(); saveState();
    } catch (e) {
      // 400/404/409: the website will never take this one (wrong players, no winner): it is kept there for admins, stop sending.
      if ([400, 404, 409].includes(e.status)) { log(`match ${r.match}: website refused the result (${e.message})`); pending.shift(); saveState(); continue; }
      log(`match ${r.match}: result not sent yet: ${e.message}`); return;
    }
  }
}

// ---------- live score (for the scoreboard) ----------
const listeners = new Map();   // match id -> Set of http responses (Server-Sent Events)
function liveOf(m) {
  return { match: m.info.match, tournament: m.info.tournament, started: m.game.log.length > 0, players: m.info.players.map(p => ({ id: p.id, name: p.name || '', board: boards.get(String(p.serial))?.status || 'Offline' })), ...x01.live(m.game) };
}
function push(m) {
  const set = listeners.get(m.info.match);
  if (!set) return;
  const data = `data: ${JSON.stringify(liveOf(m))}\n\n`;
  for (const res of set) res.write(data);
}
http.createServer((req, res) => {
  const json = (code, d) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(d)); };
  const u = new URL(req.url, 'http://x');
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts[0] === 'boards') return json(200, [...boards.values()].map(b => ({ serial: b.serial, status: b.status, phase: b.phase, error: b.errorType, problem: b.problem })));
  // Board check (website: "is my board ready?", check-in): connect for a moment if we are not connected already.
  if (parts[0] === 'check') {
    const serial = String(u.searchParams.get('serial') || '').trim();
    if (!/^[A-Za-z0-9-]{3,40}$/.test(serial)) return json(400, { error: 'Bad serial number.' });
    const known = boards.get(serial);
    const answer = b => json(200, { serial, status: b.status, phase: b.phase, error: b.errorType, problem: b.problem });
    if (known && (known.status !== 'Offline' || known.problem)) return answer(known);
    const b = known || new Board(serial);
    const t0 = Date.now();
    const tick = setInterval(() => {
      if (b.status !== 'Offline' || b.problem || Date.now() - t0 > 6000) {
        clearInterval(tick);
        answer(b);
        if (!known) b.close();
      }
    }, 150);
    return;
  }
  if (parts[0] === 'live' && !parts[1]) return json(200, [...matches.values()].filter(m => !m.sent).map(liveOf));
  if (parts[0] === 'live') {
    const m = matches.get(isNaN(parts[1]) ? parts[1] : Number(parts[1]));
    if (!m) return json(404, { error: 'No live match.' });
    if (parts[2] !== 'stream') return json(200, liveOf(m));
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
    res.write(`data: ${JSON.stringify(liveOf(m))}\n\n`);
    if (!listeners.has(m.info.match)) listeners.set(m.info.match, new Set());
    listeners.get(m.info.match).add(res);
    req.on('close', () => listeners.get(m.info.match)?.delete(res));
    return;
  }
  json(404, { error: 'Not found.' });
}).listen(cfg.port, '127.0.0.1', () => log(`live score on http://127.0.0.1:${cfg.port}/live`));

// ---------- start ----------
if (!cfg.accessToken) log('no accessToken in config.json: boards will refuse the connection (4102)');
loadState();
refresh();
setInterval(refresh, cfg.pollSeconds * 1000);
setInterval(sendPending, 60000);
process.on('SIGTERM', () => { for (const b of boards.values()) b.close(); process.exit(0); });
