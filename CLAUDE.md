# DDL Chat — notes for Claude

Community chat app for the Digital Darts League (ddl-online.com), replacing the WhatsApp community.
Must handle ~1000 concurrent players and be very easy to use for all ages.

- `server/` Node.js WebSocket server (`ws`, `mysql2`), entry `server.js`, storage in `db.js`
  (`DB_DRIVER=mysql` or `memory`). Tests: `npm test` (in-memory, must stay green). Local run: `npm run dev`.
- `php/` login + picture upload endpoints that run on the existing DDL PHP/MySQL site.
  PHP signs an HMAC token with `CHAT_SECRET`; the Node server verifies it. PHP and Node never call each other.
- `sql/schema.sql` new `chat_*` tables only; never alter existing DDL tables.
- `app/` Expo (React Native) screens; URLs in `app/src/config.js`, colours in `app/src/theme.js`,
  platforms in `app/src/platforms.js`, login background in `app/assets/login-bg.jpg`.
- Platforms (Dartsmind, Scolia): each has its own General chat, Friendlies, Dartswap, Help and private chats.
  Only the account and mute/kick/ban are shared. Server list: `PLATFORMS` in `server/.env`; must match the app.
- Protocol and features: `README.md`. Deployment order and current status: `NEXT_STEPS.md`.

Rules:
- Never commit secrets (`CHAT_SECRET`, DB passwords, filled-in `chat-config.php`).
- Keep the bad-word list in `server/filter.js` and `app/src/filter.js` identical.
- Moderation is enforced server-side; the app only mirrors it.
- Keep friendlies simple: a "looking for a friendly" card others can see and accept.
- Run `npm test` in `server/` after any server change.
