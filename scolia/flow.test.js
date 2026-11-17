// The whole road: pretend Scolia boards -> bridge -> pretend DDL website, without real boards.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const mock = require('./mock-scolia');

const SECRET = 'test-secret';
const wait = ms => new Promise(r => setTimeout(r, ms));
const post = (port, p, d) => fetch(`http://127.0.0.1:${port}${p}`, { method: 'POST', body: JSON.stringify(d) });

test('a match from Scolia throws ends up on the website', { timeout: 30000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scolia-'));
  const M = 9561, SITE = 9562, LIVE = 9563;
  const { server: mockServer } = await mock.start(M);

  // Pretend website: lists one match, and receives the result (signature checked like the PHP side does).
  const results = [];
  const site = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      const t = req.headers['x-ddl-time'];
      const good = crypto.createHmac('sha256', SECRET).update(t + '\n' + body).digest('hex');
      if (req.headers['x-ddl-sign'] !== good) { res.writeHead(403); return res.end('{}'); }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      if (req.url === '/scolia-matches.php') return res.end(JSON.stringify({ matches: [
        { match: 501, tournament: 9, legsToWin: 2, first: 0, players: [{ id: 11, name: 'Ann', serial: 'SBC-A' }, { id: 22, name: 'Bob', serial: 'SBC-B' }] }] }));
      if (req.url === '/scolia-result.php') { results.push(JSON.parse(body)); return res.end('{"ok":true,"message":"saved"}'); }
      res.end('{}');
    });
  }).listen(SITE, '127.0.0.1');

  const config = path.join(dir, 'config.json');
  fs.writeFileSync(config, JSON.stringify({ scoliaUrl: `ws://127.0.0.1:${M}/api/v1/external`, accessToken: mock.TOKEN,
    siteUrl: `http://127.0.0.1:${SITE}`, secret: SECRET, port: LIVE, pollSeconds: 60, stateFile: path.join(dir, 'state.json') }));
  const bridge = spawn(process.execPath, [path.join(__dirname, 'bridge.js')], { env: { ...process.env, SCOLIA_CONFIG: config } });
  let out = ''; bridge.stdout.on('data', d => (out += d)); bridge.stderr.on('data', d => (out += d));

  try {
    for (let i = 0; i < 50 && (await fetch(`http://127.0.0.1:${LIVE}/boards`).then(r => r.json()).catch(() => [])).filter(b => b.status === 'Ready').length < 2; i++) await wait(100);
    const boards = await fetch(`http://127.0.0.1:${LIVE}/boards`).then(r => r.json());
    assert.deepStrictEqual(boards.map(b => b.status).sort(), ['Ready', 'Ready'], out);

    const turn = async (serial, ...darts) => { for (const d of darts) await post(M, '/throw', { serial, sector: d }); await post(M, '/takeout', { serial }); await wait(30); };
    // leg 1: Ann 9-darter-ish
    await turn('SBC-A', 'T20', 'T20', 'T20');
    await turn('SBC-B', 'S20', 'S20', 'S20');
    await post(M, '/throw', { serial: 'SBC-B', sector: 'T20' });   // Bob throws out of turn: ignored
    await turn('SBC-A', 'T20', 'T20', 'T20');
    await turn('SBC-B', 'S20', 'S20', 'S20');
    await wait(100);
    const live = await fetch(`http://127.0.0.1:${LIVE}/live/501`).then(r => r.json());
    assert.deepStrictEqual(live.left, [141, 381], JSON.stringify(live));
    await turn('SBC-A', 'T20', 'T19', 'D12');
    // leg 2: Bob starts, Ann wins it
    await turn('SBC-B', 'S1', 'S1', 'S1');
    await turn('SBC-A', 'T20', 'T20', 'T20');
    await turn('SBC-B', 'S1', 'S1', 'S1');
    await turn('SBC-A', 'T20', 'T20', 'T20');
    await turn('SBC-B', 'S1', 'S1', 'S1');
    await turn('SBC-A', 'T20', 'T19', 'D12');

    for (let i = 0; i < 50 && !results.length; i++) await wait(100);
    assert.strictEqual(results.length, 1, out);
    const r = results[0];
    assert.strictEqual(r.match, 501);
    assert.strictEqual(r.result.winner, 11);
    assert.strictEqual(r.result.score1, 2);
    assert.strictEqual(r.result.score2, 0);
    assert.strictEqual(r.result.p1_checkout, 141);
    assert.strictEqual(r.result.p1_180s, 4);
    assert.strictEqual(r.result.p1_avg, 167);      // 1002 points in 18 darts
    assert.ok(r.log.some(x => x.ignored === 'not your turn'));
    // the boards are let go after the match
    await wait(300);
    assert.strictEqual((await fetch(`http://127.0.0.1:${LIVE}/boards`).then(r => r.json())).length, 0);
  } finally {
    bridge.kill(); site.close(); mockServer.close();
  }
});

test('a wrong access token stops the board instead of retrying forever', { timeout: 15000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scolia-'));
  const M = 9571, LIVE = 9573;
  const { server: mockServer } = await mock.start(M);
  const matches = path.join(dir, 'matches.json');
  fs.writeFileSync(matches, JSON.stringify([{ match: 7, players: [{ id: 1, serial: 'SBC-C' }, { id: 2, serial: 'NOPE' }] }]));
  const config = path.join(dir, 'config.json');
  fs.writeFileSync(config, JSON.stringify({ scoliaUrl: `ws://127.0.0.1:${M}/api/v1/external`, accessToken: 'wrong', matchesFile: matches,
    secret: SECRET, port: LIVE, pollSeconds: 60, stateFile: path.join(dir, 'state.json') }));
  const bridge = spawn(process.execPath, [path.join(__dirname, 'bridge.js')], { env: { ...process.env, SCOLIA_CONFIG: config } });
  try {
    let boards = [];
    for (let i = 0; i < 40 && boards.filter(b => b.problem).length < 2; i++) { await wait(100); boards = await fetch(`http://127.0.0.1:${LIVE}/boards`).then(r => r.json()).catch(() => []); }
    const byS = Object.fromEntries(boards.map(b => [b.serial, b.problem]));
    assert.strictEqual(byS['SBC-C'], '4102 invalid access token');
    assert.strictEqual(byS['NOPE'], '4100 invalid serial number');
  } finally { bridge.kill(); mockServer.close(); }
});
