'use strict';
// Test mode: run the chat on your own computer without a database and without the PHP site.
//   npm run dev
// Log in from the app with any name (any password). "Renaud" is an admin; change with DEV_ADMINS=renaud,ash
// Everything is kept in memory and is gone when you stop the server (Ctrl+C).
Object.assign(process.env, {
  DB_DRIVER: 'memory',
  DEV_MODE: '1',
  CHAT_SECRET: process.env.CHAT_SECRET || 'dev-only-secret-not-for-production-123456',
  PORT: process.env.PORT || '8080',
  RATE_LIMIT: process.env.RATE_LIMIT || '20',
});

const db = require('./db');

// A few example players and messages so the app is not empty. Set DEV_EMPTY=1 to start empty.
async function seed() {
  if (process.env.DEV_EMPTY === '1') return;
  const t = Date.now() - 30 * 60_000;
  const users = {
    kevin: { id: 'dev-kevin-v', name: 'Kevin V.' },
    sanne: { id: 'dev-sanne-d', name: 'Sanne D.' },
    jordy: { id: 'dev-jordy-m', name: 'Jordy M.' },
    tom: { id: 'dev-tom-b', name: 'Tom B.' },
  };
  for (const u of Object.values(users)) await db.upsertUser({ ...u, role: 'player', avatar: null, last_seen: t });
  const msgs = [
    ['general:dartsmind', 'kevin', 'Evening all! Who is playing in the Premier tonight?'],
    ['general:dartsmind', 'sanne', 'Me, 20:30 vs Jordy. Bring your A-game 🎯'],
    ['general:dartsmind', 'jordy', 'Ha, we will see. Hit a 104 average in practice this afternoon.'],
    ['general:scolia', 'tom', 'Just recalibrated my Scolia, scoring is spot on again 👌'],
    ['general:scolia', 'sanne', 'Nice! Did you clean the cameras?'],
  ];
  let i = 0;
  for (const [room, who, body] of msgs) await db.insertMessage({ room, user_id: users[who].id, body, image_url: null, created_at: t + i++ * 60_000 });
  await db.friendlies.add({ platform: 'dartsmind', user_id: users.jordy.id, format: 'FT3', custom: null, game: '501', note: 'Quick one, anyone?', status: 'open', created_at: t + 10 * 60_000 });
  await db.friendlies.add({ platform: 'scolia', user_id: users.sanne.id, format: 'FT5', custom: null, game: '501', note: 'Practice before league night.', status: 'open', created_at: t + 11 * 60_000 });
  await db.swap.add({ platform: 'dartsmind', user_id: users.kevin.id, kind: 'Sell', title: 'Target Power 9Five 23g', price: '65', cond: 'Used', descr: 'Comes with case and spare flights.', image_url: null, status: 'open', created_at: t + 12 * 60_000 });
  await db.help.add({ platform: 'dartsmind', user_id: users.jordy.id, question: 'How do I report a no-show from my opponent?', status: 'open', created_at: t + 13 * 60_000 });
}

seed().then(() => require('./server')).catch(e => { console.error(e); process.exit(1); });
