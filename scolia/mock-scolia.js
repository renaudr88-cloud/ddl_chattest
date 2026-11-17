// A pretend Scolia External API, to test the bridge without real boards or an access token.
//   node mock-scolia.js 9555            -> wss-like server on ws://127.0.0.1:9555/api/v1/external
//   POST http://127.0.0.1:9555/throw    {"serial":"SBC-A","sector":"T20"}
//   POST http://127.0.0.1:9555/takeout  {"serial":"SBC-A"}
//   POST http://127.0.0.1:9555/status   {"serial":"SBC-A","status":"Calibrating"}
// Access token "test-token"; boards listed in BOARDS. Behaves like the documentation (HELLO_CLIENT, close codes 4100-4104).
'use strict';
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const TOKEN = 'test-token';
const BOARDS = new Set((process.env.MOCK_BOARDS || 'SBC-A,SBC-B,SBC-C,SBC-D').split(','));

function start(port = 9555) {
  const conns = new Map();   // serial -> ws
  const msg = (type, payload) => JSON.stringify({ type, id: crypto.randomUUID(), payload });
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      let d = {}; try { d = JSON.parse(body || '{}'); } catch {}
      const ws = conns.get(String(d.serial));
      const ok = () => { res.writeHead(ws ? 200 : 404); res.end(ws ? 'ok' : 'board not connected'); };
      if (!ws) return ok();
      const now = new Date().toISOString();
      if (req.url === '/throw') ws.send(msg('THROW_DETECTED', { sector: d.sector, coordinates: [0, 0], angle: { vertical: 90, horizontal: 90 }, bounceout: !!d.bounceout, sectorSuggestions: [], detectionTime: now }));
      else if (req.url === '/takeout') { ws.send(msg('TAKEOUT_STARTED', { time: now })); ws.send(msg('TAKEOUT_FINISHED', { falseTakeout: !!d.falseTakeout, time: now })); }
      else if (req.url === '/status') ws.send(msg('SBC_STATUS_CHANGED', { boardStatus: d.status, boardPhase: d.status === 'Ready' ? 'Throw' : null, errorType: d.errorType || null }));
      ok();
    });
  });
  const wss = new WebSocketServer({ server, path: '/api/v1/external' });
  wss.on('connection', (ws, req) => {
    const q = new URL(req.url, 'http://x').searchParams;
    const serial = q.get('serialNumber');
    if (!BOARDS.has(serial)) return ws.close(4100, 'Invalid serial number');
    if (q.get('accessToken') !== TOKEN) return ws.close(4102, 'Invalid access token');
    const old = conns.get(serial);
    if (old) {
      if (q.get('forceConnect') !== 'true') return ws.close(4101, 'Already connected');
      old.close(4104, 'Replaced');
    }
    conns.set(serial, ws);
    ws.on('close', () => { if (conns.get(serial) === ws) conns.delete(serial); });
    ws.on('message', raw => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (m.type === 'GET_SBC_STATUS') ws.send(msg('SBC_STATUS', { boardStatus: 'Ready', boardPhase: 'Throw', errorType: null }));
      else ws.send(msg('ACKNOWLEDGED', { replyTo: m.id }));
    });
    ws.send(msg('HELLO_CLIENT', { boardStatus: 'Ready', boardPhase: 'Throw', errorType: null }));
  });
  return new Promise(r => server.listen(port, '127.0.0.1', () => r({ server, wss, conns })));
}

if (require.main === module) start(Number(process.argv[2]) || 9555).then(() => console.log('mock Scolia ready'));
module.exports = { start, TOKEN };
