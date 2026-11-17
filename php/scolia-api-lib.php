<?php
// Scolia boards in DDL matches: shared helpers for scolia-matches.php, scolia-result.php, scolia-board.php,
// scolia-live.php and the app (chat-myddl.php).
//
// The bridge (scolia/bridge.js, a small program that runs on this server) follows the Scolia boards of the
// players in a Scolia match, counts the match from the throws and sends the result here, signed with
// SCOLIA_BRIDGE_SECRET (scolia-config.php).

if (is_file(__DIR__ . '/scolia-config.php')) require_once __DIR__ . '/scolia-config.php';
if (!defined('SCOLIA_BRIDGE_SECRET')) define('SCOLIA_BRIDGE_SECRET', '');
if (!defined('SCOLIA_BRIDGE_URL')) define('SCOLIA_BRIDGE_URL', 'http://127.0.0.1:8787');

// players.scolia_serial: the serial number of the player's Scolia board. Made the first time it is needed.
function scolia_serial_column(PDO $pdo): bool {
    static $ok = null;
    if ($ok !== null) return $ok;
    try {
        $has = $pdo->query("SHOW COLUMNS FROM players LIKE 'scolia_serial'")->fetch();
        if (!$has) $pdo->exec("ALTER TABLE players ADD COLUMN scolia_serial VARCHAR(40) NULL DEFAULT NULL");
        $ok = true;
    } catch (Throwable $e) {
        error_log('scolia_serial column: ' . $e->getMessage());
        $ok = false;
    }
    return $ok;
}

// A typed serial number: letters, digits and dashes, 3 to 40 characters. '' = none / not valid.
function scolia_serial_clean($v): string {
    $v = strtoupper(preg_replace('/\s+/', '', (string)$v));
    return preg_match('/^[A-Z0-9-]{3,40}$/', $v) ? $v : '';
}

function scolia_serial_of(PDO $pdo, int $playerId): string {
    if (!scolia_serial_column($pdo)) return '';
    $st = $pdo->prepare('SELECT scolia_serial FROM players WHERE id = ?');
    $st->execute([$playerId]);
    return (string)($st->fetchColumn() ?: '');
}

// Save (or with '' remove) a player's board. Returns an error text, or '' when saved.
function scolia_serial_save(PDO $pdo, int $playerId, string $serial): string {
    if (!scolia_serial_column($pdo)) return 'Could not save right now. Try again later.';
    if ($serial !== '') {
        $st = $pdo->prepare('SELECT id FROM players WHERE scolia_serial = ? AND id <> ? LIMIT 1');
        $st->execute([$serial, $playerId]);
        if ($st->fetch()) return 'This board is already linked to another DDL player. Contact a DDL admin if it is yours.';
    }
    $pdo->prepare('UPDATE players SET scolia_serial = ? WHERE id = ?')->execute([$serial !== '' ? $serial : null, $playerId]);
    return '';
}

// ---------- the bridge ----------

// Is this request really from our bridge? X-DDL-Time + X-DDL-Sign = HMAC-SHA256(secret, time + "\n" + body), max 5 minutes old.
function scolia_bridge_verified(string $body): bool {
    if (SCOLIA_BRIDGE_SECRET === '') return false;
    $t = (string)($_SERVER['HTTP_X_DDL_TIME'] ?? '');
    $sig = (string)($_SERVER['HTTP_X_DDL_SIGN'] ?? '');
    if (!ctype_digit($t) || abs(time() - (int)$t) > 300) return false;
    return hash_equals(hash_hmac('sha256', $t . "\n" . $body, SCOLIA_BRIDGE_SECRET), $sig);
}

// Ask the bridge (on this server). Returns the decoded JSON, or null when the bridge does not answer.
function scolia_bridge_get(string $path, int $timeout = 8): ?array {
    $ctx = stream_context_create(['http' => ['timeout' => $timeout, 'ignore_errors' => true]]);
    $raw = @file_get_contents(rtrim(SCOLIA_BRIDGE_URL, '/') . $path, false, $ctx);
    if ($raw === false) return null;
    $j = json_decode($raw, true);
    return is_array($j) ? $j : null;
}

// The state of a board in plain words, for players: [ok (bool), text].
function scolia_board_words(?array $c): array {
    if ($c === null) return [false, 'The board check is not available right now.'];
    $problem = (string)($c['problem'] ?? '');
    if (strpos($problem, '4100') === 0) return [false, 'Scolia does not know this serial number. Check it in the Scolia app.'];
    if (strpos($problem, '4102') === 0) return [false, 'DDL cannot reach Scolia boards yet (no access from Scolia).'];
    if (strpos($problem, '4103') === 0) return [false, 'Scolia says this board is suspended.'];
    switch ($c['status'] ?? 'Offline') {
        case 'Ready': return [true, 'Ready to play ✔'];
        case 'Calibrating': return [false, 'Calibrating… wait a moment.'];
        case 'Initializing': return [false, 'Starting up… ready in about a minute.'];
        case 'Updating': return [false, 'Updating its software…'];
        case 'Error': return [false, 'The board has a ' . strtolower((string)($c['error'] ?? '')) . ' error. Restart or recalibrate it.'];
        default: return [false, 'Offline: switch the board on and check its internet connection.'];
    }
}

// ---------- matches ----------

// Is this tournament played on Scolia (a B bracket follows its main tournament)? Not cricket.
function scolia_tournament_ok(PDO $pdo, array $t): bool {
    if (stripos((string)($t['name'] ?? ''), 'cricket') !== false) return false;
    $p = (string)($t['platform'] ?? 'dartsmind');
    if ($p !== 'scolia' && !empty($t['parent_tournament_id'])) {
        $st = $pdo->prepare('SELECT platform FROM tournaments WHERE id = ?');
        $st->execute([(int)$t['parent_tournament_id']]);
        $p = (string)$st->fetchColumn();
    }
    return $p === 'scolia';
}

// "First to X legs" of a match, like tournament-b.php: legs_regular, or legs_semi_/legs_final_ for the last two rounds of its bracket.
function scolia_legs_for(PDO $pdo, array $t, array $m): int {
    $f = fn($k) => (isset($t[$k]) && $t[$k] !== null && $t[$k] !== '') ? (int)$t[$k] : null;
    $b = ($m['bracket'] ?? 'A') === 'B' ? 'b' : 'a';
    $st = $pdo->prepare('SELECT COUNT(DISTINCT round) FROM matches WHERE tournament_id = ? AND bracket = ?');
    $st->execute([(int)$m['tournament_id'], $m['bracket'] ?? 'A']);
    $total = (int)$st->fetchColumn();
    $round = (int)($m['round'] ?? 1);
    $legs = $f('legs_regular');
    if ($total >= 2 && $round === $total - 1 && $f('legs_semi_' . $b) !== null) $legs = $f('legs_semi_' . $b);
    if ($total >= 1 && $round === $total && $f('legs_final_' . $b) !== null) $legs = $f('legs_final_' . $b);
    return max(1, min(21, $legs ?: 3));
}

// The Scolia matches that are on now: both players known, no result yet, tournament from yesterday to tomorrow,
// and both players linked a board. Each: {match, tournament, legsToWin, players: [{id, name, serial}, ...]}
function scolia_open_matches(PDO $pdo): array {
    if (!scolia_serial_column($pdo)) return [];
    $rows = $pdo->query("SELECT m.id, m.tournament_id, m.round, m.bracket, m.player1_id, m.player2_id,
            COALESCE(NULLIF(p1.scolia_username, ''), p1.dartsmind_username, p1.name) AS n1, p1.scolia_serial AS s1,
            COALESCE(NULLIF(p2.scolia_username, ''), p2.dartsmind_username, p2.name) AS n2, p2.scolia_serial AS s2
        FROM matches m
        JOIN tournaments t ON t.id = m.tournament_id
        JOIN players p1 ON p1.id = m.player1_id
        JOIN players p2 ON p2.id = m.player2_id
        WHERE m.winner_id IS NULL AND m.score1 IS NULL
          AND t.start_date BETWEEN DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND DATE_ADD(CURDATE(), INTERVAL 1 DAY)
          AND p1.scolia_serial IS NOT NULL AND p1.scolia_serial <> '' AND p2.scolia_serial IS NOT NULL AND p2.scolia_serial <> ''
        LIMIT 300")->fetchAll(PDO::FETCH_ASSOC);
    $tours = [];
    $out = [];
    foreach ($rows as $r) {
        $tid = (int)$r['tournament_id'];
        if (!array_key_exists($tid, $tours)) {
            $st = $pdo->prepare('SELECT * FROM tournaments WHERE id = ?');
            $st->execute([$tid]);
            $t = $st->fetch(PDO::FETCH_ASSOC) ?: [];
            $tours[$tid] = $t && scolia_tournament_ok($pdo, $t) ? $t : null;
        }
        if (!$tours[$tid]) continue;
        $out[] = [
            'match' => (int)$r['id'], 'tournament' => $tid, 'tournamentName' => (string)$tours[$tid]['name'],
            'legsToWin' => scolia_legs_for($pdo, $tours[$tid], $r),
            'players' => [
                ['id' => (int)$r['player1_id'], 'name' => (string)$r['n1'], 'serial' => (string)$r['s1']],
                ['id' => (int)$r['player2_id'], 'name' => (string)$r['n2'], 'serial' => (string)$r['s2']],
            ],
        ];
    }
    return $out;
}

// What the bridge sent for each match: kept for admins to check (and so a result is never saved twice).
function scolia_results_table(PDO $pdo): bool {
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS scolia_results (
            match_id INT NOT NULL PRIMARY KEY, tournament_id INT NOT NULL, data MEDIUMTEXT NOT NULL,
            status VARCHAR(20) NOT NULL, note VARCHAR(255) NOT NULL DEFAULT '', received_at INT NOT NULL)");
        return true;
    } catch (Throwable $e) { error_log('scolia_results: ' . $e->getMessage()); return false; }
}
