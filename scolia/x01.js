// X01 scoring from Scolia throws (External API THROW_DETECTED / TAKEOUT_FINISHED).
// Scolia only tells us which segment each dart hit; this file keeps the game itself:
// whose turn it is, the score left, busts, legs, and the stats DDL saves (average, 100+/140+/180, best checkout).
//
// An online DDL match has two boards, one per player: a dart from the board of the player whose turn it is counts,
// a dart from the other board is ignored (and reported, so it can be checked).
'use strict';

// "T20" -> { points: 60, double: false }, "D16" -> 32 (double), "Bull" -> 50 (double), "25" -> 25, "None" -> 0.
function parseSector(sector) {
  const s = String(sector || 'None');
  if (s === 'Bull') return { points: 50, double: true };
  if (s === '25') return { points: 25, double: false };
  const m = /^([SsDT])(20|1[0-9]|[1-9])$/.exec(s);
  if (!m) return { points: 0, double: false };   // "None", a bounce-out, or something we do not know
  const n = Number(m[2]);
  if (m[1] === 'D') return { points: 2 * n, double: true };
  if (m[1] === 'T') return { points: 3 * n, double: false };
  return { points: n, double: false };
}

function emptyStats() {
  return { darts: 0, points: 0, c100: 0, c140: 0, c180: 0, checkout: null, legs: 0, turns: 0 };
}

// players: [{ id, serial }, { id, serial }]  (player 1 = index 0, as in the DDL fixture)
// legsToWin: first to N legs (best of 7 = 4). start: 501. first: who throws first in leg 1 (0 or 1),
// or null: the first board that throws a dart starts (after the bull-up in the Scolia app).
// format 'first' (default): the first to legsToWin legs wins. format 'fixed': exactly totalLegs legs are played
// (league matches); the one with most legs wins, equal legs is a draw.
function createMatch({ players, legsToWin = 3, start = 501, first = null, format = 'first', totalLegs = null }) {
  if (!Array.isArray(players) || players.length !== 2) throw new Error('A match needs two players.');
  const m = {
    players: players.map(p => ({ id: p.id, serial: String(p.serial) })),
    legsToWin, start,
    format: format === 'fixed' ? 'fixed' : 'first',
    totalLegs: format === 'fixed' ? Math.max(1, Number(totalLegs) || 6) : null,
    draw: false,                // fixed number of legs, equal legs
    legStarter: first,          // who started the current leg
    turn: first,                // whose turn it is
    left: [start, start],       // score left in this leg
    turnDarts: [],              // darts of the current turn: [{ sector, points, double }]
    turnStart: start,           // score left when this turn started
    leg: 1,
    stats: [emptyStats(), emptyStats()],
    log: [],                    // what happened, for checking afterwards
    winner: null,               // 0 or 1 when the match is over
  };
  return m;
}

const indexOf = (m, serial) => m.players.findIndex(p => p.serial === String(serial));

// Close the current turn: count it in the stats and give the turn to the other player.
function endTurn(m, scored) {
  const p = m.turn, st = m.stats[p];
  st.turns++;
  st.darts += 3;                             // a turn counts as 3 darts (like Dartsmind and Scolia), except the checkout turn
  st.points += scored;
  if (scored === 180) st.c180++;
  else if (scored >= 140) st.c140++;
  else if (scored >= 100) st.c100++;
  m.turnDarts = [];
  m.turn = 1 - p;
  m.turnStart = m.left[m.turn];
}

// A dart from a board. Returns what it did: { ok, ignored?, bust?, checkout?, legWon?, matchWon? }.
function addThrow(m, serial, sector, time) {
  if (m.winner !== null) return { ok: false, ignored: 'match over' };
  const who = indexOf(m, serial);
  if (who < 0) return { ok: false, ignored: 'unknown board' };
  // Nobody has thrown yet and we do not know who starts: the first dart decides.
  if (m.turn === null) { m.turn = m.legStarter = who; m.log.push({ t: time, p: who, starts: true }); }
  if (who !== m.turn) {
    m.log.push({ t: time, p: who, sector, ignored: 'not your turn' });
    return { ok: false, ignored: 'not your turn' };
  }
  const d = parseSector(sector);
  m.turnDarts.push({ sector, ...d });
  const left = m.left[who] - d.points;
  m.log.push({ t: time, p: who, sector, points: d.points, left: Math.max(left, 0) });

  // Bust: below zero, 1 left, or zero without a double. The turn scores nothing.
  if (left < 0 || left === 1 || (left === 0 && !d.double)) {
    m.left[who] = m.turnStart;
    m.log.push({ t: time, p: who, bust: true });
    endTurn(m, 0);
    return { ok: true, bust: true };
  }
  m.left[who] = left;

  if (left === 0) {
    // Checkout: the leg is won. The darts of this last turn count as they were thrown (1, 2 or 3).
    const st = m.stats[who];
    const out = m.turnStart;
    const scored = out;
    st.turns++;
    st.darts += m.turnDarts.length;
    st.points += scored;
    if (scored === 180) st.c180++; else if (scored >= 140) st.c140++; else if (scored >= 100) st.c100++;
    st.checkout = Math.max(st.checkout || 0, out);
    st.legs++;
    m.log.push({ t: time, p: who, checkout: out, leg: m.leg });
    const played = m.stats[0].legs + m.stats[1].legs;
    const over = m.format === 'fixed' ? played >= m.totalLegs : st.legs >= m.legsToWin;
    if (over) {
      const [a, b] = [m.stats[0].legs, m.stats[1].legs];
      m.winner = m.format === 'fixed' ? (a === b ? -1 : a > b ? 0 : 1) : who;   // -1: draw
      m.draw = m.winner === -1;
      m.turnDarts = [];
      return { ok: true, checkout: out, legWon: true, matchWon: true };
    }
    // Next leg: the other player starts.
    m.leg++;
    m.legStarter = 1 - m.legStarter;
    m.turn = m.legStarter;
    m.left = [m.start, m.start];
    m.turnStart = m.start;
    m.turnDarts = [];
    return { ok: true, checkout: out, legWon: true };
  }

  if (m.turnDarts.length === 3) {
    endTurn(m, m.turnStart - left);
    return { ok: true, turnOver: true };
  }
  return { ok: true };
}

// The player pulled the darts out. With fewer than 3 darts seen (a dart missed the board or was not detected),
// the turn is over anyway: what was seen counts, the turn still counts as 3 darts.
function addTakeout(m, serial, falseTakeout) {
  const who = indexOf(m, serial);
  if (falseTakeout || m.turn === null || who !== m.turn || m.winner !== null || m.turnDarts.length === 0) return { ok: false };
  endTurn(m, m.turnStart - m.left[who]);
  return { ok: true, turnOver: true };
}

const avg = st => (st.darts ? Math.round((st.points / st.darts) * 3 * 100) / 100 : 0);

// The result in the form the DDL website saves (update-score-b.php: score1/2, p1_avg, p1_100s, ...).
function result(m) {
  const [a, b] = m.stats;
  return {
    finished: m.winner !== null,
    winner: m.winner === null || m.winner === -1 ? null : m.players[m.winner].id,
    draw: m.winner === -1,
    score1: a.legs, score2: b.legs,
    p1_avg: avg(a), p2_avg: avg(b),
    p1_100s: a.c100, p2_100s: b.c100,
    p1_140s: a.c140, p2_140s: b.c140,
    p1_180s: a.c180, p2_180s: b.c180,
    p1_checkout: a.checkout, p2_checkout: b.checkout,
  };
}

// What a live scoreboard shows.
function live(m) {
  return {
    leg: m.leg, turn: m.turn, left: [...m.left],
    legs: [m.stats[0].legs, m.stats[1].legs],
    avg: [avg(m.stats[0]), avg(m.stats[1])],
    darts: m.turnDarts.map(d => d.sector),
    winner: m.winner,
  };
}

module.exports = { parseSector, createMatch, addThrow, addTakeout, result, live };
