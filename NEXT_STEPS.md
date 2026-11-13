# DDL Chat — next steps

The chat runs on Firebase. Details for each step are in `README.md`.

**Test version (Renaud, no PHP needed)**
1. Create the Firebase project, Firestore (europe-west1), turn on Anonymous sign-in ("Set up Firebase" in README).
2. Paste the web config into `app/src/firebaseConfig.js`; publish `firebase/firestore.rules`; add `config/staff` with a staff code.
3. `cd app`, `npm install`, `npx expo start`. Try chat, private chat, friendlies, Dartswap, help desk, mute/kick/ban.
4. Share a fixed link with testers: `npm run build:web`, then `firebase deploy` (README, "Let others test").

**Live with DDL accounts (Stevey)**
5. Service account key on the DDL server outside the web root; path in `php/chat-config.php`.
6. Upload and fill in the 3 PHP files; check `password_verify` matches how the site stores passwords.
7. `TEST_MODE = false`; check the upload address in the rules; test login with a real DDL account.
8. Switch Firebase to Blaze with a budget alert before inviting everyone (README, "Costs").
