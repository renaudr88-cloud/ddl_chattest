# DDL Chat — notes for Claude

Community chat app for the Digital Darts League (ddl-online.com), replacing the WhatsApp community.
Must handle ~1000 concurrent players and be very easy to use for all ages. Backend: Firebase (Firestore + Auth).

- `app/` complete Expo project (SDK 58, firebase JS SDK). Data layer: `app/src/chat.js` (Firestore listeners and
  the actions the screens call via `chat.request(type, data)`). Firebase init: `app/src/firebase.js`,
  project config: `app/src/firebaseConfig.js`. `TEST_MODE` in `app/src/config.js`: anonymous name login + staff code
  (test) or DDL login via PHP (live). Colours `app/src/theme.js`, platforms `app/src/platforms.js`.
- `firebase/firestore.rules` is the server: all permissions, moderation, bad-word check and data validation live there.
  `firebase.json` deploys the rules and the web build (`app/dist`) to Firebase Hosting.
- `php/` runs on the DDL site: `chat-login.php` checks the DDL users table and returns a Firebase custom token
  (uid `ddl-<id>`, claims `ddlName`, `ddlRole`) plus an upload token; `chat-upload.php` stores pictures on the DDL site.
- Platforms (Dartsmind, Scolia): each has its own General chat, Friendlies, Dartswap, Help and private chats.
  Only the account and mute/kick/ban are shared. Keep `app/src/platforms.js` and `platforms()` in the rules the same.
- Setup, data model and costs: `README.md`. Status and order of work: `NEXT_STEPS.md`.

Rules:
- Never commit secrets: the Firebase service account key, `CHAT_SECRET`, DB passwords, a filled-in `chat-config.php`.
  (The web `firebaseConfig` is not secret.)
- Keep the bad-word list in `app/src/filter.js` and `clean()` in `firebase/firestore.rules` in line.
- Moderation and permissions are enforced by the Firestore rules; the app only mirrors them.
- Keep friendlies simple: a "looking for a friendly" card others can see and accept.
- Keep Firestore reads low (limits on every listener): the free plan has 50k reads a day.
- The old Node/WebSocket version is on the `main` branch history; this branch replaces it.
