# DDL Chat — next steps (handover to Stevey)

Status: the code is complete and the server tests pass (`cd server && npm install && npm test`, 28 checks).
Nothing is hosted yet. This list takes it from "code on GitHub" to "testers using the app".
Full technical detail is in `README.md`; this file is the order to do things in.

Owner: Renaud (DDL). Developer: Stevey. Target: ~1000 concurrent players, replacing the WhatsApp community.

---

## Step 0 — Decide where the socket server runs

The Node.js server (`server/`) must run 24/7 and must reach the DDL MySQL database.

- **If ddl-online.com is on a VPS / root server:** run it there, next to the site. Simplest option.
- **If ddl-online.com is on shared hosting (no long-running Node):** get a small VPS
  (e.g. Hetzner, EU, roughly €5–8/month) and either
  - allow that VPS to connect to the DDL MySQL database (remote access, firewall to the VPS IP only), or
  - move the site + database to the VPS as well.

Free tiers (Render/Railway free) are not suitable: they sleep, and the chat drops.

Please tell Renaud which option you pick (it may cost money).

## Step 1 — Database

```
mysql -u <user> -p <ddl_db> < sql/schema.sql
```

Only creates new `chat_*` tables. Existing tables are not touched.

## Step 2 — Shared secret

Generate once: `openssl rand -base64 48`.
The same value goes in `php/chat-config.php` (`CHAT_SECRET`) and `server/.env` (`CHAT_SECRET`).
**Never commit it.** `server/.env` is already git-ignored; for the PHP config, keep the filled-in copy
only on the server (or move it outside the web root and adjust the `require` path).

## Step 3 — PHP endpoints on ddl-online.com

1. Upload `php/chat-login.php`, `php/chat-upload.php`, `php/chat-config.php` to the site.
2. Fill in `chat-config.php`:
   - DB DSN / user / password.
   - Users table mapping: `USERS_TABLE`, `COL_ID`, `COL_USERNAME`, `COL_EMAIL`, `COL_PASSWORD`,
     `COL_AVATAR` (or null), `COL_ROLE` (or null).
   - Admins: `ADMIN_ROLES` (values in the role column) and/or `ADMIN_IDS`.
   - `UPLOAD_DIR` (writable by PHP) and `UPLOAD_BASE_URL` (public URL of that folder).
3. **Password check:** `chat-login.php` uses `password_verify()`. If the DDL site stores passwords
   another way, change that one line to match the site's own login.
4. PHP needs PDO MySQL and GD with WebP. APCu is optional (login brute-force brake).
5. Block direct web access to `chat-config.php` if it stays in the web root.

Quick test:
```
curl -X POST https://ddl-online.com/chat-login.php \
  -H 'Content-Type: application/json' -d '{"login":"<test user>","password":"<pw>"}'
```
Expect `{"token": "...", "user": {...}}`.

## Step 4 — Socket server

```
cd server
cp .env.example .env     # CHAT_SECRET, DB_*, UPLOAD_BASE_URL (identical to the PHP one)
npm install
npm test
pm2 start server.js --name ddl-chat   # or a systemd unit
pm2 save
```

nginx + TLS (e.g. `chat.ddl-online.com`, certificate via certbot):

```nginx
location /chat {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 120s;
}
```

Check: `https://chat.ddl-online.com/health` → `{"ok":true,"online":0}`.
`UPLOAD_BASE_URL` must be exactly the same in `.env` and `chat-config.php`, or picture messages are rejected.

## Step 5 — App (Expo)

`app/` contains `App.js`, `src/` and `assets/`, not a full Expo project.

```
npx create-expo-app ddl-chat-app        # Expo SDK 52+
# copy app/App.js, app/src/, app/assets/ddl-logo.png into it
npx expo install expo-image-picker @react-native-async-storage/async-storage react-native-safe-area-context
```

Set the three URLs in `src/config.js` (`WS_URL` must be `wss://`), then `npx expo start`.
Testers can open it with **Expo Go** (QR code). Store builds later via EAS Build.

## Step 6 — Before inviting testers

- [ ] Log in with a normal account and with an admin account (STAFF button visible only for admin).
- [ ] Send text + a picture in General; open a private chat.
- [ ] Post a friendly, a swap item, a help question; answer it as staff.
- [ ] Mute / kick / ban a test account and check the moderation log.
- [ ] Add DDL's extra blocked words to `BAD` in `server/filter.js` and `app/src/filter.js`.
- [ ] Renaud wants screenshots or a short demo of every version, so record one.

## Open questions for Renaud

- Hosting choice and budget (Step 0).
- Who are the first testers (they sign up by DMing a DDL staff member).
