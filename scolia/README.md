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

- Done: the game logic, the board connections (reconnect, close codes 4000-4104), live score, board check, signed results, tests.
- Website (php/): `scolia-board.php` (a player links their board serial), `scolia-matches.php` and `scolia-result.php`
  (for the bridge only, signed), `scolia-live.php` (live scoreboard), `scolia-api-lib.php`, `scolia-config.php` (made by install.sh).
  The app: "My Scolia board" in My DDL (Scolia), via chat-myddl.php.
- Waiting for Scolia: the access token, and how players link their own board to the DDL account.

## How a result gets on the bracket

1. `scolia-matches.php` lists the Scolia matches of yesterday to tomorrow without a result where both players linked a board.
2. The bridge connects to both boards. The first board that throws starts (after the bull-up in the Scolia app).
3. At the winning double the bridge posts the result to `scolia-result.php`, which saves it through the website's own
   `update-score-b.php` as the winner with a "read screenshot" (so the bracket moves on as always).
   Everything the bridge sent is kept in the table `scolia_results` (status saved / skipped / refused / failed).
4. A match that already has a result (an admin, or a screenshot) is never changed.

## Installing it on the server

Upload this folder (bridge.js, x01.js, package.json, package-lock.json, ddl-scolia.service, install.sh) to the server,
for example to /root/ddl-scolia, then as root:

```
sh /root/ddl-scolia/install.sh
```

It installs Node.js if needed, copies the bridge to /opt/ddl-scolia, makes the shared secret (in /opt/ddl-scolia/config.json
and /var/www/html/scolia-config.php) and starts the service `ddl-scolia`. When Scolia gives the access token:

```
nano /opt/ddl-scolia/config.json        # "accessToken": "..."
systemctl restart ddl-scolia
journalctl -u ddl-scolia -f             # what it is doing
```

## Testing without Scolia

```
npm install && npm test                 # the game logic, and a whole match through a pretend Scolia
```
