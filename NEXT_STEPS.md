# DDL Chat — next steps for Stevey

Try it first without any setup: `npm run dev` in `server/`, then `npx expo start` in `app/` (see README, "Test on your own computer").

Code is done, tests pass. Nothing is hosted yet. Details for each step are in `README.md`.

1. **Pick a server.** The Node server must run 24/7 and reach the DDL database.
   Use the current hosting if it can run Node, otherwise a small VPS (~€5–8/month). Tell Renaud.
2. **Database.** Run `sql/schema.sql` in the DDL database (adds `chat_*` tables only).
3. **Secret.** Make one with `openssl rand -base64 48`. Put it in `php/chat-config.php` and `server/.env`. Never commit it.
4. **PHP.** Upload the 3 files in `php/` to ddl-online.com. Fill in `chat-config.php`
   (DB login, users table columns, admin roles, upload folder). Check that `password_verify` matches how the site stores passwords.
5. **Socket server.** In `server/`: `cp .env.example .env`, fill it in (keep `PLATFORMS=dartsmind,scolia`), then `npm install`, `npm test`, `pm2 start server.js --name ddl-chat`.
6. **TLS.** Put it behind nginx on `wss://chat.ddl-online.com/chat` (config in README). Check `/health`.
7. **App.** `app/` is a ready Expo project: set `TEST_MODE = false` and the URLs in `app/src/config.js`, then `npm install` and `npx expo start`.
8. **Test.** Open it in Expo Go and try login (Dartsmind and Scolia), chat on both platforms, pictures, private chat, friendlies, swap, help and mute/ban. Send Renaud screenshots.
