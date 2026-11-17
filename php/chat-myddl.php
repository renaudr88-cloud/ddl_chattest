<?php
// DDL Chat "My DDL" tab: my tournaments and leagues from ddl-online.com, and signing up / checking in from the app.
// Header: Authorization: Bearer <token from chat-login.php>
//
// GET  /chat-myddl.php                         -> {tournaments: {mine: [...], open: [...]}, leagues: [...], avg}
// POST {"action":"join","id":12}               -> {ok, status: "joined"|"reserve", message}  or {needAvg: true}
// POST {"action":"checkin","id":12}            -> {ok, message}
// POST multipart: action=avg, screenshot=<file> -> the answer of verify-dartsmind-screenshot.php ({ok, message})
// POST multipart: action=shot, match=<id>, screenshot=<file> -> the answer of parse-match-screenshot.php
//                 ({ok, message, player1, player2, names_matched}; player1/player2 as in the fixture)
// POST {"action":"result","match":77,"score1":4,"score2":2,"forfeit":false,"stats":{...}}
//                 -> {ok, message}  saved by the website's update-score-b.php (ranked: the screenshot's values)
//
// Signing up and checking in run the website's OWN scripts (tournament-detail.php for every entry check,
// then join-tournament.php / join-reserve.php / check-in.php), as if the player clicked the button on the
// website. So every rule (bans, clashes, average gates, reserve promotion, bracket byes, notifications)
// stays exactly the website's, also when the website changes them later.
require __DIR__ . '/chat-config.php';
chat_cors();
$me = chat_read_token(chat_bearer());
if (!$me) chat_json(401, ['error' => 'Log in again.']);
$MYDDL = ['uid' => (int)$me['uid'], 'phase' => ''];
$pdo = chat_db();

function myddl_name(?string $a, ?string $b, int $id): string {
    $n = trim((string)$a) ?: trim((string)$b);
    return $n !== '' ? mb_substr($n, 0, 30) : 'Player ' . $id;
}

// The start of a tournament in its own time zone (DateTime), like tournament-detail.php.
function myddl_start(array $t): DateTime {
    try { $tz = new DateTimeZone($t['timezone'] ?: 'Europe/London'); } catch (Throwable $e) { $tz = new DateTimeZone('Europe/London'); }
    return new DateTime($t['start_date'] . ' ' . ($t['start_time'] ?: '00:00:00'), $tz);
}

/* ============================== GET: the whole tab ============================== */
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    $uid = $MYDDL['uid'];
    $db = $pdo;
    $p = $db->prepare('SELECT last_100_avg, avg_verified_at FROM players WHERE id = ?');
    $p->execute([$uid]);
    $player = $p->fetch(PDO::FETCH_ASSOC) ?: [];
    $avg = (float)($player['last_100_avg'] ?? 0);
    $since = date('Y-m-d', time() - 3 * 86400);

    // Tournaments (with the platform column when the website has it).
    $rows = [];
    foreach (['t.platform AS platform,', ''] as $extra) try {
        $st = $db->prepare("
            SELECT t.id, t.name, t.format, t.start_date, t.start_time, t.timezone, t.max_players, t.registration_open_days,
                   t.min_avg, t.max_avg, t.check_in_open, t.completed_at, t.is_private, $extra
                   (SELECT COUNT(*) FROM tournament_players x WHERE x.tournament_id = t.id) AS players,
                   (SELECT COUNT(*) FROM tournament_reserve_list x WHERE x.tournament_id = t.id) AS reserves,
                   (SELECT COUNT(*) FROM matches x WHERE x.tournament_id = t.id) AS match_count,
                   (SELECT x.checked_in FROM tournament_players x WHERE x.tournament_id = t.id AND x.player_id = ?) AS my_player,
                   (SELECT x.checked_in FROM tournament_reserve_list x WHERE x.tournament_id = t.id AND x.user_id = ?) AS my_reserve
            FROM tournaments t
            WHERE t.archived_at IS NULL AND t.is_b_bracket = 0
              AND (t.is_playoff IS NULL OR t.is_playoff = 0)
              AND t.completed_at IS NULL
              AND t.start_date >= ?
            ORDER BY t.start_date ASC, t.start_time ASC
            LIMIT 120");
        $st->execute([$uid, $uid, $since]);
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);
        break;
    } catch (Throwable $e) {
        if ($extra === '') { error_log('chat-myddl tournaments: ' . $e->getMessage()); }
    }

    $mine = []; $open = [];
    foreach ($rows as $t) {
        $start = myddl_start($t);
        $now = new DateTime('now', $start->getTimezone());
        $role = $t['my_player'] !== null ? 'player' : ($t['my_reserve'] !== null ? 'reserve' : null);
        $days = (int)($t['registration_open_days'] ?? 3);
        $opens = $days === 0 ? null : (clone $start)->modify("-{$days} days -2 hours -30 minutes");
        $item = [
            'id' => (int)$t['id'],
            'platform' => ($t['platform'] ?? '') === 'scolia' ? 'scolia' : 'dartsmind',
            'name' => (string)$t['name'],
            'format' => ucwords(str_replace('_', ' ', (string)$t['format'])),
            'start' => $start->getTimestamp() * 1000,
            'max' => (int)$t['max_players'], 'players' => (int)$t['players'], 'reserves' => (int)$t['reserves'],
            'minAvg' => $t['min_avg'] !== null ? (float)$t['min_avg'] : null,
            'maxAvg' => $t['max_avg'] !== null ? (float)$t['max_avg'] : null,
            'url' => rtrim(CHAT_SITE_URL, '/') . '/tournament-detail.php?id=' . (int)$t['id'],
        ];
        if ($role) {
            // Check-in opens 2.5 hours before the start and closes 30 minutes before (tournament-detail.php);
            // the button is there while the website has check-in open (check_in_open).
            $mine[] = $item + [
                'role' => $role,
                'checkInOpen' => (int)$t['check_in_open'] === 1,
                'checkedIn' => (int)($role === 'player' ? $t['my_player'] : $t['my_reserve']) === 1,
                'checkInOpens' => (clone $start)->modify('-2 hours -30 minutes')->getTimestamp() * 1000,
                'checkInCloses' => (clone $start)->modify('-30 minutes')->getTimestamp() * 1000,
                'started' => (int)$t['match_count'] > 0 || $now >= $start,
                'bracket' => rtrim(CHAT_SITE_URL, '/') . '/' . ($t['format'] === 'group_knockout' ? 'tournament-detail.php?id=' : 'tournament-b.php?id=') . (int)$t['id'],
            ];
            continue;
        }
        // Open to join: the dashboard's "Join a Tournament" list (public, average in range, not started).
        if ((int)$t['is_private'] === 1 || $now >= (clone $start)->modify('-5 minutes')) continue;
        if (($t['min_avg'] !== null && (float)$t['min_avg'] > $avg) || ($t['max_avg'] !== null && (float)$t['max_avg'] < $avg)) continue;
        if (count($open) >= 40) continue;
        $open[] = $item + [
            'opens' => $opens && $now < $opens ? $opens->getTimestamp() * 1000 : null,
            'full' => (int)$t['players'] >= (int)$t['max_players'],
        ];
    }

    // My leagues: table of my group + my matches still to play (with their League Match Planner time).
    $leagues = [];
    try {
        $st = $db->prepare("
            SELECT l.id, l.name, l.display_name, l.season, l.region, l.show_draws, g.id AS group_id, g.group_name
            FROM leagues l
            JOIN league_groups g ON g.league_id = l.id
            JOIN league_group_players gp ON gp.group_id = g.id
            WHERE gp.player_id = ? AND l.completed_at IS NULL AND (l.is_visible = 1 OR l.is_visible IS NULL)
            ORDER BY l.season DESC, l.name ASC
            LIMIT 6");
        $st->execute([$uid]);
        $groups = $st->fetchAll(PDO::FETCH_ASSOC);
        $fixtures = [];
        if ($groups && is_file(__DIR__ . '/league-schedule-lib.php')) {
            require_once __DIR__ . '/league-schedule-lib.php';
            try { $fixtures = ls_my_fixtures($db, $uid); } catch (Throwable $e) { error_log('chat-myddl fixtures: ' . $e->getMessage()); }
        }
        $tbl = $db->prepare("
            SELECT s.player_id, s.played, s.won, s.drawn, s.lost, s.legs_for, s.legs_against, s.points,
                   p.dartsmind_username, p.name
            FROM league_group_standings s JOIN players p ON p.id = s.player_id
            WHERE s.group_id = ?
            ORDER BY s.points DESC, (s.legs_for - s.legs_against) DESC, s.legs_for DESC, s.legs_against ASC");
        foreach ($groups as $g) {
            $tbl->execute([(int)$g['group_id']]);
            $table = [];
            foreach ($tbl->fetchAll(PDO::FETCH_ASSOC) as $i => $r) {
                $table[] = [
                    'pos' => $i + 1, 'id' => 'ddl-' . (int)$r['player_id'], 'me' => (int)$r['player_id'] === $uid,
                    'name' => myddl_name($r['dartsmind_username'], $r['name'], (int)$r['player_id']),
                    'p' => (int)$r['played'], 'w' => (int)$r['won'], 'd' => (int)$r['drawn'], 'l' => (int)$r['lost'],
                    'diff' => (int)$r['legs_for'] - (int)$r['legs_against'], 'pts' => (int)$r['points'],
                ];
            }
            $name = trim((string)($g['display_name'] ?? '')) ?: (string)$g['name'];
            $leagues[] = [
                'id' => (int)$g['id'], 'name' => $name, 'season' => (string)($g['season'] ?? ''),
                'group' => (string)$g['group_name'], 'draws' => (int)($g['show_draws'] ?? 0) === 1,
                'table' => $table,
                // Only matches of this group (by id: the same league name and group come back every season).
                'fixtures' => array_values(array_filter($fixtures, fn($f) => (int)($f['groupId'] ?? 0) === (int)$g['group_id'])),
                'url' => rtrim(CHAT_SITE_URL, '/') . '/view-league.php?id=' . (int)$g['id'],
            ];
        }
    } catch (Throwable $e) {
        error_log('chat-myddl leagues: ' . $e->getMessage());
    }

    chat_json(200, ['tournaments' => ['mine' => $mine, 'open' => $open], 'leagues' => $leagues, 'avg' => $avg ?: null]);
}

/* ============================== POST: sign up / check in / average ============================== */

// Act as this player on the website for this one request: a session that is never stored in a cookie
// and is thrown away at the end (the website's scripts read $_SESSION['user_id']).
// $keep: one fixed session per player (only for the chat, never a cookie), kept between requests.
// Used for results: parse-match-screenshot.php remembers what it read in the session, and
// update-score-b.php (a later request) saves exactly those values for ranked tournaments.
function myddl_as_player(int $uid, bool $keep = false): void {
    global $pdo, $MYDDL;
    ini_set('session.use_cookies', '0');
    ini_set('session.use_only_cookies', '0');
    ini_set('session.use_trans_sid', '0');
    session_cache_limiter('');
    $MYDDL['keep'] = $keep;
    session_id($keep ? 'ddlchat' . substr(hash_hmac('sha256', 'results:' . $uid, CHAT_SECRET), 0, 40)
                     : 'ddlchat' . bin2hex(random_bytes(12)));
    session_start();
    $n = $pdo->prepare('SELECT name, dartsmind_username FROM players WHERE id = ?');
    $n->execute([$uid]);
    $r = $n->fetch(PDO::FETCH_ASSOC) ?: [];
    $_SESSION['user_id'] = $uid;
    $_SESSION['user_name'] = (string)($r['name'] ?? '');
}

// Where am I in this tournament now (straight from the database)?
function myddl_place(int $tid, int $uid): array {
    global $pdo;
    $a = $pdo->prepare('SELECT checked_in FROM tournament_players WHERE tournament_id = ? AND player_id = ?');
    $a->execute([$tid, $uid]);
    $p = $a->fetchColumn();
    if ($p !== false) return ['player', (int)$p === 1];
    $b = $pdo->prepare('SELECT checked_in FROM tournament_reserve_list WHERE tournament_id = ? AND user_id = ?');
    $b->execute([$tid, $uid]);
    $r = $b->fetchColumn();
    if ($r !== false) return ['reserve', (int)$r === 1];
    return [null, false];
}

// The website's scripts end with header('Location: ...') + exit. This turns that into the app's JSON answer.
function myddl_finish(): void {
    global $MYDDL;
    $phase = $MYDDL['phase'] ?? '';
    if ($phase === '' || $phase === 'done') return;
    $MYDDL['phase'] = 'done';
    $loc = '';
    foreach (headers_list() as $h) if (stripos($h, 'Location:') === 0) $loc = trim(substr($h, 9));
    header_remove('Location');
    $out = '';
    while (ob_get_level() > 0) $out = ob_get_clean() . $out;
    $q = [];
    parse_str((string)parse_url($loc, PHP_URL_QUERY), $q);
    $tid = (int)($MYDDL['tid'] ?? 0);
    $uid = (int)$MYDDL['uid'];
    $res = [500, ['error' => 'Something went wrong. Try again, or use ddl-online.com.']];

    if ($phase === 'gate') {
        // tournament-detail.php stopped early: tournament gone or not logged in.
        $res = [404, ['error' => 'That tournament was not found.']];
    } elseif ($phase === 'join') {
        [$role] = myddl_place($tid, $uid);
        if ($role === 'player') $res = [200, ['ok' => true, 'status' => 'joined', 'message' => "You're in! Check in when check-in opens."]];
        elseif ($role === 'reserve') $res = [200, ['ok' => true, 'status' => 'reserve', 'message' => "You're on the reserve list."]];
        elseif (($q['need'] ?? '') === 'scolia') $res = [400, ['error' => 'Add your Scolia name to your profile on ddl-online.com first.']];
        elseif (($q['error'] ?? '') === 'banned') $res = [400, ['error' => 'You are banned from entering tournaments at the moment.']];
        elseif (($q['status'] ?? '') === 'join_closed') $res = [400, ['error' => 'Entry is closed: the bracket is already full.']];
        elseif (($q['status'] ?? '') === 'reserve_joined') $res = [409, ['error' => 'The tournament just filled up. Try again to join the reserve list.']];
    } elseif ($phase === 'checkin') {
        [$role, $in] = myddl_place($tid, $uid);
        if ($in) $res = [200, ['ok' => true, 'role' => $role, 'message' => $role === 'player' ? "Checked in. Good luck! 🎯" : 'Checked in as a reserve. You get a notification if a place opens.']];
        else $res = [400, ['error' => 'Check-in did not work. Try again, or check in on ddl-online.com.']];
    } elseif ($phase === 'avg' || $phase === 'shot') {
        $j = json_decode(trim($out), true);
        $res = is_array($j) ? [200, $j] : [500, ['ok' => false, 'message' => "Couldn't read that screenshot. Try again."]];
    } elseif ($phase === 'result') {
        $mid = (int)($MYDDL['match'] ?? 0);
        $m = $GLOBALS['pdo']->prepare('SELECT winner_id, score1, score2, score_submitted_by FROM matches WHERE id = ?');
        $m->execute([$mid]);
        $row = $m->fetch(PDO::FETCH_ASSOC) ?: [];
        $text = trim(strip_tags($out));
        if (($q['error'] ?? '') === 'screenshot_required') $res = [400, ['error' => 'Upload the DartsMind Match Stats screenshot again, then submit.']];
        elseif (($q['error'] ?? '') === 'forfeit_winner') $res = [400, ['error' => 'A no-show / walkover can only be entered with you as the winner. Did you give up? Your opponent or an admin enters it.']];
        elseif ($loc !== '' && !empty($row['winner_id'])) $res = [200, ['ok' => true, 'score1' => (int)$row['score1'], 'score2' => (int)$row['score2'],
            'message' => 'Result saved: ' . (int)$row['score1'] . ' – ' . (int)$row['score2'] . '. 🎯']];
        elseif ($text !== '') $res = [400, ['error' => mb_substr($text, 0, 200)]];
    }
    if (session_status() === PHP_SESSION_ACTIVE) {
        if (!empty($MYDDL['keep'])) session_write_close();
        else { $_SESSION = []; session_destroy(); }
    }
    http_response_code($res[0]);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($res[1], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
register_shutdown_function('myddl_finish');

// Errors from here on: end the session and answer.
function myddl_fail(int $code, string $msg, array $extra = []): void {
    global $MYDDL;
    $MYDDL['phase'] = 'done';
    while (ob_get_level() > 0) ob_end_clean();
    if (session_status() === PHP_SESSION_ACTIVE) {
        if (!empty($MYDDL['keep'])) session_write_close();
        else { $_SESSION = []; session_destroy(); }
    }
    chat_json($code, ['error' => $msg] + $extra);
}

$isMultipart = stripos($_SERVER['CONTENT_TYPE'] ?? '', 'multipart/form-data') === 0;
$in = $isMultipart ? $_POST : json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($in)) chat_json(400, ['error' => 'Bad request.']);
$MYDDL['action'] = (string)($in['action'] ?? '');
$MYDDL['tid'] = (int)($in['id'] ?? 0);

/* ---------- Average screenshot (the website's verify-dartsmind-screenshot.php) ---------- */
if ($MYDDL['action'] === 'avg') {
    if (!$isMultipart || empty($_FILES['screenshot'])) chat_json(400, ['error' => 'Choose a screenshot first.']);
    if (!is_file(__DIR__ . '/verify-dartsmind-screenshot.php')) chat_json(500, ['error' => 'Upload your screenshot on ddl-online.com.']);
    myddl_as_player($MYDDL['uid']);
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $MYDDL['phase'] = 'avg';
    ob_start();
    include __DIR__ . '/verify-dartsmind-screenshot.php';
    exit;   // myddl_finish() passes on its answer
}

/* ---------- Results of my tournament match (the website's parse-match-screenshot.php and update-score-b.php) ---------- */
if ($MYDDL['action'] === 'shot' || $MYDDL['action'] === 'result') {
    $MYDDL['match'] = (int)($in['match'] ?? 0);
    $m = $pdo->prepare('SELECT id, tournament_id, bracket, round, player1_id, player2_id, winner_id FROM matches WHERE id = ?');
    $m->execute([$MYDDL['match']]);
    $match = $m->fetch(PDO::FETCH_ASSOC);
    if (!$match || !in_array($MYDDL['uid'], [(int)$match['player1_id'], (int)$match['player2_id']], true)) chat_json(404, ['error' => 'That match was not found.']);
    if (!empty($match['winner_id'])) chat_json(400, ['error' => 'This match already has a result. Changes: ask an admin.']);
    myddl_as_player($MYDDL['uid'], true);
    $_SERVER['REQUEST_METHOD'] = 'POST';
    if ($MYDDL['action'] === 'shot') {
        if (!$isMultipart || empty($_FILES['screenshot'])) myddl_fail(400, 'Choose a screenshot first.');
        $_POST = ['match_id' => (string)$MYDDL['match'], 'source' => 'tournament'];
        $MYDDL['phase'] = 'shot';
        ob_start();
        include __DIR__ . '/parse-match-screenshot.php';
        exit;
    }
    $num = fn($v) => ($v === null || $v === '') ? '' : (string)(0 + $v);
    $st = is_array($in['stats'] ?? null) ? $in['stats'] : [];
    $_POST = [
        'match_id' => (string)$MYDDL['match'],
        'score1' => (string)(int)($in['score1'] ?? -1), 'score2' => (string)(int)($in['score2'] ?? -1),
        'bracket' => (string)$match['bracket'], 'round' => (string)$match['round'],
        'redirect_url' => '/tournament-b.php?id=' . (int)$match['tournament_id'],
    ];
    if (!empty($in['forfeit'])) $_POST['forfeit'] = '1';
    else foreach (['p1_avg', 'p2_avg', 'p1_100s', 'p2_100s', 'p1_140s', 'p2_140s', 'p1_180s', 'p2_180s', 'p1_checkout', 'p2_checkout'] as $k) {
        if (isset($st[$k]) && $num($st[$k]) !== '') $_POST[$k] = $num($st[$k]);
    }
    if ((int)$_POST['score1'] < 0 || (int)$_POST['score2'] < 0) myddl_fail(400, 'Enter both scores.');
    $_GET = ['round' => (string)$match['round']];
    $MYDDL['phase'] = 'result';
    ob_start();
    include __DIR__ . '/update-score-b.php';
    exit;
}

if (!in_array($MYDDL['action'], ['join', 'checkin'], true) || $MYDDL['tid'] <= 0) chat_json(400, ['error' => 'Bad request.']);

/* ---------- Check in (the website's check-in.php) ---------- */
if ($MYDDL['action'] === 'checkin') {
    $t = $pdo->prepare('SELECT check_in_open, completed_at FROM tournaments WHERE id = ?');
    $t->execute([$MYDDL['tid']]);
    $tr = $t->fetch(PDO::FETCH_ASSOC);
    if (!$tr) chat_json(404, ['error' => 'That tournament was not found.']);
    [$role, $in] = myddl_place($MYDDL['tid'], $MYDDL['uid']);
    if (!$role) chat_json(400, ['error' => 'You are not in this tournament.']);
    if ($in) chat_json(200, ['ok' => true, 'role' => $role, 'message' => 'You are already checked in.']);
    if ((int)$tr['check_in_open'] !== 1 || !empty($tr['completed_at'])) chat_json(400, ['error' => 'Check-in is not open for this tournament.']);
    myddl_as_player($MYDDL['uid']);
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $_POST = ['tournament_id' => (string)$MYDDL['tid']];
    $MYDDL['phase'] = 'checkin';
    ob_start();
    include __DIR__ . '/check-in.php';
    exit;
}

/* ---------- Join (every check of tournament-detail.php, then join-tournament.php or join-reserve.php) ---------- */
myddl_as_player($MYDDL['uid']);
$_GET = ['id' => (string)$MYDDL['tid']];
$_SERVER['REQUEST_METHOD'] = 'GET';
$MYDDL['phase'] = 'gate';
ob_start();
include __DIR__ . '/tournament-detail.php';
while (ob_get_level() > 0) ob_end_clean();
$MYDDL['phase'] = '';

// The same variables tournament-detail.php uses for its Join button.
$g = fn($k, $d = null) => isset($GLOBALS[$k]) ? $GLOBALS[$k] : $d;
if ($g('isJoined')) myddl_fail(400, 'You are already in this tournament.');
if ($g('isReserve')) myddl_fail(400, 'You are already on the reserve list.');
if ($g('isBanned')) myddl_fail(400, 'You are banned from entering tournaments' . ($g('bannedUntil') ? ' until ' . date('j M Y', strtotime($g('bannedUntil'))) : '') . '.');
if ($g('isMembershipPending')) myddl_fail(400, 'Your DDL membership is not active yet. Finish it on ddl-online.com.');
if ($g('ddlNeedScolia')) myddl_fail(400, 'Add your Scolia name to your profile on ddl-online.com first.');
if ($g('u50Locked')) myddl_fail(400, 'This tournament is for players with an average under 50.');
if ($g('r5065Locked')) myddl_fail(400, 'This tournament is for players with an average between 50 and 60.');
if ($g('splitLocked')) myddl_fail(400, 'Your average belongs in the other bracket of this tournament.');
if ($g('groupsGenerated')) myddl_fail(400, 'Entry is closed: the groups are already drawn.');
if ($g('clashTournament')) myddl_fail(400, 'You are already in "' . $g('clashTournament') . '" at the same time.');
if ($g('joiningClosed')) myddl_fail(400, 'Entry closed 5 minutes before the start.');
if (!$g('registrationOpen', true)) myddl_fail(400, 'Registration is not open yet.');
if ($g('canJoinNow') === false) myddl_fail(400, 'You cannot enter this tournament. See ddl-online.com for details.');
$full = (bool)$g('isFull', false);

// Average older than 7 days: a new Dartsmind screenshot first (check-average.php on the website).
$needsAvg = false;
try {
    if (is_file(__DIR__ . '/settings.php')) require_once __DIR__ . '/settings.php';
    $frozen = function_exists('setting_get') && setting_get($pdo, 'averages_frozen', '0') === '1';
    if (!$frozen) {
        $a = $pdo->prepare('SELECT avg_verified_at FROM players WHERE id = ?');
        $a->execute([$MYDDL['uid']]);
        $v = $a->fetchColumn();
        $needsAvg = empty($v) || strtotime($v) < strtotime('-7 days');
    }
} catch (Throwable $e) { error_log('chat-myddl avg: ' . $e->getMessage()); }
if ($needsAvg) myddl_fail(200, 'Verify your average first.', ['needAvg' => true, 'full' => $full]);

$_SERVER['REQUEST_METHOD'] = 'POST';
$_POST = ['tournament_id' => (string)$MYDDL['tid']];
$MYDDL['phase'] = 'join';
ob_start();
include __DIR__ . ($full ? '/join-reserve.php' : '/join-tournament.php');
exit;
