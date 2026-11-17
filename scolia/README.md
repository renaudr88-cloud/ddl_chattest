# DDL Scolia bridge

Reads the throws of the players' Scolia boards during a DDL Scolia match (Scolia External API v1.4.1),
counts the match itself (501, double out, legs, busts) and sends the result and stats to ddl-online.com.

```
x01.js            the game: whose turn, score left, busts, legs, average, 100+/140+/180, best checkout
bridge.js         one live connection per board (serial number + access token), live score on 127.0.0.1:8787
mock-scolia.js    a pretend Scolia server (token "test-token", boards SBC-A..SBC-D) to test without real boards
*.test.js         npm test
```

What Scolia sends is only "which segment did each dart hit" and "the darts were taken out", per board.
In an online match each player has their own board: a dart from the board of the player whose turn it is counts,
a dart from the other board is ignored (and kept in the log). A turn ends after 3 darts, a bust, a checkout,
or when the player takes the darts out early (a dart that missed the board).

Not visible to us: a score the player corrects in the Scolia app (asked Scolia, see below).

## Status

- Done: the game logic, the board connections (reconnect, close codes 4000-4104), live score, signed results, tests.
- Waiting for Scolia: the access token, and how players link their own board to the DDL account.
- Next (website): players save their board serial on their profile, `scolia-matches.php` (which matches are on, with
  serials) and `scolia-result.php` (save the result, signed with the shared secret), the live scoreboard, board check at check-in.

## Running it on the server

```
cd scolia
npm install
cp config.example.json config.json     # fill in the token and the secret; config.json is never committed
node bridge.js                         # or as a service (systemd / pm2), so it restarts by itself
```
