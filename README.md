# DDL Community Chat (Firebase)

Community chat app for the Digital Darts League: General chat, Tournament chat, a Raffle chat (Dartsmind, by approval), private chats, Friendlies, Dartswap and a
Help desk, separately for Dartsmind and Scolia, with a bad-word filter and staff moderation (mute, kick, ban).

```
app/        Expo (React Native) app, also runs in the browser
firebase/   firestore.rules: who may read and write what (this is the "server")
php/        chat-login.php (DDL account -> Firebase sign-in), chat-player.php, chat-matches.php,
            chat-notifications.php (read the DDL site for the chat), chat-config.php
firebase.json   rules + web hosting for `firebase deploy`
```

## How it fits together

```
 App ──name + password──▶ php/chat-login.php ──▶ DDL users table (password_verify)
  │◀── Firebase custom token (uid "ddl-<id>", claims ddlName, ddlRole, ddlPhoto) + upload token
  │
  ├── signInWithCustomToken ──▶ Firebase Auth
  ├── live reads/writes ──────▶ Firestore  (checked by firebase/firestore.rules)
  └── pictures: shrunk on the phone (max 1000 px JPEG) and stored in the message in Firestore
```

No chat server to run: Firebase keeps the data and sends changes live to every phone.
Pictures are stored in Firestore itself, so no paid Firebase Storage is needed: the free plan (Spark) is enough to start.

**Test version** (`TEST_MODE = true` in `app/src/config.js`): players pick a name (Firebase anonymous sign-in),
staff type the staff code as password. No PHP needed.

## Set up Firebase (once)

1. https://console.firebase.google.com → **Create a project** → name `ddl-chat` (Google Analytics can be off).
2. **Build → Firestore Database → Create database** → location `europe-west1 (Belgium)` → **production mode**.
3. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable** (for the test version).
4. **Project settings (gear) → Your apps → Web (`</>`)** → name `DDL Chat` → Register.
   Copy the `firebaseConfig` values into `app/src/firebaseConfig.js`.
5. **Firestore → Rules**: replace everything with the content of `firebase/firestore.rules` → **Publish**.
6. Staff code for the test version: **Firestore → Data → Start collection** `config` → document ID `staff` →
   field `code` (string) = a code you only give to staff.

## Run the app

```
cd app
npm install
npx expo start      # scan the QR code with Expo Go, or press w for the browser
```

## Let others test (a fixed link, your computer can be off)

Firebase Hosting serves the web version of the app for free at `https://<project-id>.web.app`.

```
npm install -g firebase-tools     # once
firebase login                    # once
firebase use --add                # once, pick the ddl-chat project
cd app && npm run build:web && cd ..
firebase deploy                   # publishes the rules and the web app
```

Run `npm run build:web` and `firebase deploy` again after each update. `firebase deploy` also publishes
`firebase/firestore.rules`, so step 5 above is then done for you.

## Go live with DDL accounts

The chat login works exactly like the website's `login.php`: `players.email` + `password_verify` on
`players.password_hash`; `is_admin = 1` is staff; membership status removed / banned / blocked / deleted is refused.
It uses the site's own `db.php`, so no database password goes into the chat files.

1. Firebase console → **Project settings → Service accounts → Generate new private key** (a JSON file).
   This is the master key of the Firebase project: never put it in git or in a public folder.
2. On the server, make a folder `private` **next to** the website folder (not inside it) and put the key there as
   `firebase-service-account.json`. (Path is `FIREBASE_SERVICE_ACCOUNT` in `php/chat-config.php`.)
3. In `php/chat-config.php` set `CHAT_SECRET` to a long random string. Upload `chat-config.php` and `chat-login.php`
   to the website folder, next to `index.php` and `db.php`. (`chat-upload.php` is no longer needed.)
4. Check: `https://ddl-online.com/chat-login.php` in a browser must say `{"error":"Use POST."}`.
5. Set `TEST_MODE = false` in `app/src/config.js`, build and deploy (`npm run build:web`, `firebase deploy`).

## Links with the DDL website (read only, the website itself is not changed)

The app calls these files next to `chat-login.php`, with the token `chat-login.php` gave (header `Authorization: Bearer`):

| File | What |
|---|---|
| `chat-player.php?id=12` | a player's name, photo and Dartsmind name (private chat with someone who never opened the chat) |
| `chat-matches.php` | my open matches in running tournaments: "Your match: vs ..." in the Dartsmind Tournament chat |
| `chat-notifications.php` | the website's notifications (table `notifications`) under Messages → DDL notifications; POST marks them read |

A link `https://ddl-chat-858ec.web.app/?dm=12` opens a private chat with player 12.

## Data (Firestore)

| Path | What |
|---|---|
| `users/{uid}` | name, nameLower, role, avatar (website profile photo), lastSeen |
| `rooms/{room}/messages/{id}` | room = `general:<platform>`, `tournament:<platform>` or `dm:<platform>:<uidA>:<uidB>` |
| `dms/{room}` | private chat list: members, users, lastAt, lastBy |
| `platforms/{p}/friendlies/{id}` | FT3 / FT5 / Other cards, status open / matched / cancelled |
| `platforms/{p}/swap/{id}` | Sell / Swap / Wanted, status open / done / deleted |
| `platforms/{p}/help/{id}` | question, status open / solved / deleted, answers[] |
| `raffleAccess/{uid}` | raffle chat access request: name, status pending / approved / declined / removed |
| `sanctions/{uid}` | mutedUntil, kickedUntil, banned (written by staff) |
| `modlog/{id}` | staff actions |
| `staff/{uid}`, `config/staff` | test version staff code |

Platforms: `app/src/platforms.js` and `platforms()` in `firebase/firestore.rules` (keep them the same).

## What the rules enforce

- Everyone must be signed in; banned and kicked players cannot read or write anything.
- Muted players can read but not post.
- Names: a DDL login always uses the name from its token, so nobody can post as someone else.
- Private chats: only the two members can read them.
- Raffle chat (`raffle:dartsmind`): only staff and players whose access request staff approved.
- Help desk: players see their own questions and the solved ones; only staff answer.
- Staff (DDL role admin, or test staff code) can delete messages and listings, mute, kick and ban; staff cannot sanction staff.
- Bad words: blocked in the rules (plain words) and in the app (also "f.u.c.k", "k4nker").
  Lists: `app/src/filter.js` and `clean()` in `firebase/firestore.rules`.
- Pictures: only JPEG pictures made by the app, under 400 KB.
- Profile photos: a DDL login shows the photo from the website (`players.photo`, sent as claim `ddlPhoto`);
  nobody can set someone else's photo. Test logins show initials.

The spam brake (6 posts per 6 seconds) is in the app only; Firestore rules cannot count posts.

## Costs

The free Spark plan includes 50,000 reads and 20,000 writes per day: plenty for testing with a group.
Every app start reads roughly 200–300 documents (recent messages, friendlies, listings), so with around a thousand
active players a day the free reads run out and the chat stops until midnight (Pacific time). Before launch,
switch to **Blaze** (pay per use, the free amounts stay free) and set a budget alert in Google Cloud.
At that size, expect a few euros to about €20 a month, depending on how busy the chat is.
Pictures make messages bigger (about 100–300 KB each): the free plan includes 10 GB of downloads a month.
