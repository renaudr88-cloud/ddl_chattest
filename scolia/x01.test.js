// node --test scolia/
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseSector, createMatch, addThrow, addTakeout, result, live } = require('./x01');

const A = 'SBC-A', B = 'SBC-B';
const turn = (m, serial, ...darts) => darts.map(d => addThrow(m, serial, d));

test('sectors', () => {
  assert.deepStrictEqual(parseSector('T20'), { points: 60, double: false });
  assert.deepStrictEqual(parseSector('D16'), { points: 32, double: true });
  assert.deepStrictEqual(parseSector('s5'), { points: 5, double: false });
  assert.deepStrictEqual(parseSector('S19'), { points: 19, double: false });
  assert.deepStrictEqual(parseSector('Bull'), { points: 50, double: true });
  assert.deepStrictEqual(parseSector('25'), { points: 25, double: false });
  assert.deepStrictEqual(parseSector('None'), { points: 0, double: false });
  assert.deepStrictEqual(parseSector('X9'), { points: 0, double: false });
});

test('turns alternate, the other board is ignored', () => {
  const m = createMatch({ players: [{ id: 1, serial: A }, { id: 2, serial: B }] });
  assert.strictEqual(addThrow(m, B, 'T20').ignored, 'not your turn');
  turn(m, A, 'T20', 'T20', 'T20');
  assert.strictEqual(m.left[0], 321);
  assert.strictEqual(m.turn, 1);
  assert.strictEqual(m.stats[0].c180, 1);
  turn(m, B, 'S20', 'S1', 'S5');
  assert.strictEqual(m.left[1], 475);
});

test('bust keeps the score and ends the turn', () => {
  const m = createMatch({ players: [{ id: 1, serial: A }, { id: 2, serial: B }], start: 40 });
  const r = turn(m, A, 'S20', 'S19', 'S1');   // 40 -> 20 -> 1: bust on the 2nd dart
  assert.strictEqual(r[1].bust, true);
  assert.strictEqual(m.left[0], 40);
  assert.strictEqual(m.turn, 1);
  assert.strictEqual(r[2].ignored, 'not your turn');   // third dart came after the bust
  // zero without a double is a bust too
  turn(m, B, 'S20', 'S20');
  assert.strictEqual(m.left[1], 40);
});

test('takeout with fewer darts ends the turn', () => {
  const m = createMatch({ players: [{ id: 1, serial: A }, { id: 2, serial: B }] });
  addThrow(m, A, 'T20');
  assert.strictEqual(addTakeout(m, A, false).turnOver, true);
  assert.strictEqual(m.turn, 1);
  assert.strictEqual(m.stats[0].darts, 3);
  assert.strictEqual(addTakeout(m, B, true).ok, false);   // false takeout: nothing happens
});

test('a full match: legs, checkout, averages, result for the website', () => {
  // 501 in 9 darts for player 1 in leg 1; best of 3 legs (first to 2).
  const m = createMatch({ players: [{ id: 11, serial: A }, { id: 22, serial: B }], legsToWin: 2 });
  turn(m, A, 'T20', 'T20', 'T20');      // 321
  turn(m, B, 'S20', 'S20', 'S20');      // 441
  turn(m, A, 'T20', 'T20', 'T20');      // 141
  turn(m, B, 'S20', 'S20', 'S20');      // 381
  const r = turn(m, A, 'T20', 'T19', 'D12');
  assert.strictEqual(r[2].legWon, true);
  assert.strictEqual(m.stats[0].checkout, 141);
  // leg 2: player 2 starts
  assert.strictEqual(m.turn, 1);
  assert.deepStrictEqual(m.left, [501, 501]);
  turn(m, B, 'T20', 'T20', 'T20');      // 321
  turn(m, A, 'T20', 'T20', 'S20');      // 361
  turn(m, B, 'T20', 'T20', 'T20');      // 141
  turn(m, A, 'S1', 'S1', 'S1');         // 358
  const r2 = turn(m, B, 'T20', 'T20', 'D9'); // 141 - 60 - 60 = 21, D9 = 18: 3 left
  assert.strictEqual(r2[2].turnOver, true);
  turn(m, A, 'T20', 'T20', 'T20');      // 178
  const r3 = turn(m, B, 'S1', 'D1');    // 3 -> 2 -> 0
  assert.strictEqual(r3[1].legWon, true);
  // leg 3: player 1 starts
  assert.strictEqual(m.turn, 0);
  turn(m, A, 'T20', 'T20', 'T20');
  turn(m, B, 'S20', 'S20', 'S20');
  turn(m, A, 'T20', 'T20', 'T20');
  turn(m, B, 'S20', 'S20', 'S20');
  const end = turn(m, A, 'T20', 'T15', 'Bull');  // 141 -> 81 -> 36 ... not out
  assert.strictEqual(end[2].bust, true);         // 36 - 50 < 0: bust
  turn(m, B, 'S20', 'S20', 'S20');
  const fin = turn(m, A, 'T20', 'T19', 'D12');
  assert.strictEqual(fin[2].matchWon, true);
  assert.strictEqual(addThrow(m, B, 'T20').ignored, 'match over');

  const res = result(m);
  assert.strictEqual(res.finished, true);
  assert.strictEqual(res.winner, 11);
  assert.strictEqual(res.score1, 2);
  assert.strictEqual(res.score2, 1);
  assert.strictEqual(res.p1_checkout, 141);
  assert.strictEqual(res.p2_checkout, 3);   // 3 left: S1, D1
  assert.ok(res.p1_180s >= 5);
  assert.ok(res.p1_avg > 80 && res.p2_avg > 40, JSON.stringify(res));
  assert.strictEqual(live(m).winner, 0);
});
