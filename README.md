# DDL Community Chat

Code for the DDL chat app: a WebSocket server, two PHP endpoints that plug into the existing DDL
account system, and the Expo (React Native) app screens built on the login screen you started.

```
ddl-chat/
├── server/        Node.js WebSocket server (runs on the socket you opened)
├── sql/           MySQL tables (run once in the DDL database)
├── php/           chat-login.php, chat-upload.php, chat-config.php
└── app/           Expo app: App.js + src/ (drop into the Expo project)
```

## How it fits together

```
 App ──POST login/password──▶ php/chat-login.php ──▶ users table (password_verify)
  │◀────────── signed token (HMAC, 30 days) ─────────┘
  │
  ├──wss://…/chat  {type:"auth", token} ──▶ server/server.js ──▶ chat_* tables
  │                                         (verifies the same token with CHAT_SECRET)
  └──POST picture + Bearer token ──▶ php/chat-upload.php ──▶ /uploads/chat/*.jpg
```

PHP and Node never talk to each other. They share one secret (`CHAT_SECRET`), so a token signed
by PHP is trusted by the socket server. Roles (player/admin) come from the DDL users table at login.

## Test on your own computer (no database, no PHP)

The server has a test mode that keeps everything in memory and has its own login and picture upload.
The app starts in test mode (`TEST_MODE = true` in `app/src/config.js`).

```
cd server
npm install
npm run dev        # test server on port 8080, with a few example messages
```

In a second terminal:

```
cd app
npm install
npx expo start     # scan the QR code with Expo Go, or press w for the browser
```

Log in with any name and any password. "Renaud" is an admin (change with `DEV_ADMINS=renaud,ash`).
Log in on a second phone or browser tab with another name to chat with yourself.
The app finds the computer's address by itself; the phone only needs to be on the same Wi-Fi.
Test mode only switches on with `DB_DRIVER=memory`, so it can never run against the real database.
For the real servers set `TEST_MODE = false`.

## 1. Database

```
mysql -u <user> -p <ddl_db> < sql/schema.sql
```

Creates `chat_users`, `chat_messages`, `chat_friendlies`, `chat_swap`, `chat_help`,
`chat_help_answers`, `chat_sanctions`, `chat_mod_log`. Nothing in the existing tables is changed.

## 2. PHP endpoints

1. Copy the three files from `php/` to the site (e.g. the web root of ddl-online.com).
2. Edit `chat-config.php`:
   - `CHAT_SECRET`: a long random string (`openssl rand -base64 48`), same value as in `server/.env`.
   - DB credentials, and the column names of the users table (`COL_USERNAME`, `COL_EMAIL`,
     `COL_PASSWORD`, `COL_ROLE`). Passwords must be `password_hash()` hashes; if the site uses
     something else, change the one `password_verify` line in `chat-login.php`.
   - Who is admin: `ADMIN_ROLES` (values in the role column) and/or `ADMIN_IDS`.
   - `UPLOAD_DIR` / `UPLOAD_BASE_URL`: where pictures are stored and served.
3. PHP needs PDO MySQL and GD (with WebP). APCu is optional (login brute-force brake).

Upload re-encodes every picture with GD, which strips EXIF/GPS data and anything hidden in the file.

## 3. Socket server

```
cd server
cp .env.example .env      # fill in CHAT_SECRET, DB_*, UPLOAD_BASE_URL
npm install
npm test                  # 39 end-to-end checks against an in-memory database
npm start                 # listens on PORT (default 8080), path /chat
```

Keep it running with pm2 or systemd, e.g. `pm2 start server.js --name ddl-chat`.

Behind nginx (TLS on the same domain):

```nginx
location /chat {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 120s;
}
```

`GET /health` returns `{ok, online}` for monitoring.
One Node process handles 1000+ concurrent players without trouble. If it ever needs more than one
process, the in-memory socket map in `server.js` would have to move to Redis pub/sub.

## 4. Expo app

`app/` is a complete Expo project (SDK 58): `cd app`, `npm install`, `npx expo start`.
For the live servers set `TEST_MODE = false` in `src/config.js` and check the three URLs there. Your `LoginScreen` is kept and wired to `chat-login.php`.
Colours live in `src/theme.js` (two palettes; styles are built with `themed(C => ({…}))` so they follow the chosen background). No navigation library is needed; tabs live in `src/screens/HomeScreen.js`.
Image picking uses `mediaTypes: ['images']` (Expo SDK 52+).

## Platforms (Dartsmind, Scolia)

Every platform has its **own** General chat, Friendlies, Dartswap, Help desk and private chats, so
nothing gets mixed up. Players switch with the bar at the top of the app; the app remembers the last one.
Shared across platforms: the DDL account, and mute / kick / ban (a muted player is muted everywhere).

- Server: `PLATFORMS=dartsmind,scolia` in `server/.env`
- App: `src/platforms.js` (name, colour, logo). Logos are in `app/assets/` (dartsmind.png, scolia.png).
- Rooms are named `general:<platform>` and `dm:<platform>:<idA>:<idB>`; friendlies, swap and help
  rows carry a `platform` column. Requests `dm.open`, `friendly.post`, `swap.post` and `help.ask`
  take a `platform` field; pushed `friendlies` / `swap` / `help` events say which platform they are for.
- Adding DartCounter later: add `dartcounter` to `PLATFORMS` and one line in `src/platforms.js`.

## Features and where they live

| Feature | Server (enforced) | App |
|---|---|---|
| General chat + pictures | `send`, `history`, `delete` | `ChatScreen.js` |
| Private chat | rooms `dm:<idA>:<idB>`, only those two can read | `MessagesScreen.js`, `ChatScreen.js` |
| Friendlies (FT3 / FT5 / Other) | one open card per player; Accept opens a private chat | `FriendliesScreen.js` |
| Bad-word filter (EN + NL) | `filter.js`, checks every text; also catches `f.u.c.k`, `k4nker` | same filter in `src/filter.js` for instant feedback |
| Mute / kick / ban | `mod`; kick and ban disconnect live and block reconnect; banned players can't log in | `MemberSheet.js`, `AdminScreen.js` |
| Help desk | questions only (`isQuestion`); only staff answer; staff can move a question to a private chat; players see their own + solved questions | `HelpScreen.js` |
| Dartswap | Sell / Swap / Wanted with photo, price, condition | `SwapScreen.js` |
| Moderation log | every mute, kick, ban, unban and staff delete | `AdminScreen.js` → Log |
| App background: DDL blue or white | | Settings (⚙ in the General header), saved on the phone; colours in `src/theme.js` |
| Spam brake | 6 posts per 6 seconds per player (`RATE_LIMIT`) | |

Staff can't be moderated from the app, and only staff see the STAFF button.

## Protocol (JSON over WebSocket)

Client sends `{type, rid, ...}`; the server replies `{type:"ack", rid, data}` or
`{type:"error", rid, code, message}` (the message is ready to show to the player).

First message must be `{type:"auth", token}` (within 10 s). The server answers with `ready`:
`{me, online, platforms, general, generalMore, friendlies, swap, help, dms}`, where general/friendlies/swap/help
are objects keyed by platform (`{dartsmind: [...], scolia: [...]}`).

| Request | Fields | Who |
|---|---|---|
| `history` | `room`, `before?` (message id) | room members |
| `send` | `room`, `text`, `imageUrl?` | room members, not muted |
| `delete` | `id` | author or staff |
| `dm.open` | `userId`, `platform` | anyone |
| `dm.list` | | anyone |
| `users.search` | `q` | anyone |
| `friendly.post` | `platform`, `format` FT3/FT5/Other, `custom?`, `game`, `note?` | anyone |
| `friendly.accept` / `friendly.cancel` | `id` | others / owner or staff |
| `swap.post` | `platform`, `kind`, `title`, `price?`, `cond`, `desc?`, `imageUrl?` | anyone |
| `swap.done` / `swap.delete` | `id` | owner / owner or staff |
| `help.ask` | `platform`, `text` (must be a question) | anyone |
| `help.answer` / `help.private` | `id`, `text` | staff |
| `help.status` | `id`, `status` open/solved/deleted | staff (owner may mark solved) |
| `admin.members` | | staff |
| `mod` | `action` mute/unmute/kick/unkick/ban/unban, `userId`, `minutes?` | staff |

Pushed events: `message`, `deleted`, `friendlies`, `swap`, `help`, `presence`, `sanction` (you were
muted/unmuted), `blocked` (kicked/banned, socket closes with code 4003), `auth_failed` (4001),
`modlog` and `member` (staff only).

## Before going live

- Set a real `CHAT_SECRET` in both places; never commit it.
- Put the socket behind TLS (`wss://`); the app will refuse plain `ws://` in release builds.
- Make sure `UPLOAD_BASE_URL` is identical in `chat-config.php` and `server/.env`; the server
  rejects picture URLs from anywhere else.
- Add the extra words DDL wants blocked to `BAD` in `server/filter.js` (and copy to `app/src/filter.js`).
