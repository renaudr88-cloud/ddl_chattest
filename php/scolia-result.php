<?php
// For the Scolia bridge only (signed): the result of a Scolia match, counted from the throws on both boards.
// POST {match, tournament, players: [id1, id2], result: {winner, score1, score2, p1_avg, …, p2_checkout}, log: [...]}
//   -> {ok, message}
//
// Saved through the website's own update-score-b.php, as if the winner submitted it with a read screenshot,
// so the bracket moves on exactly like on the website (winner to the next round, loser to bracket B, notifications).
// Everything the bridge sent is kept in scolia_results, so admins can check a result afterwards.
require __DIR__ . '/chat-config.php';
require_once __DIR__ . '/scolia-api-lib.php';

$SCOLIA = ['phase' => ''];
function scolia_out(int $code, array $d): void {
    global $SCOLIA;
    $SCOLIA['phase'] = 'done';
    while (ob_get_level() > 0) ob_end_clean();
    header_remove('Location');
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($d, JSON_UNESCAPED_UNICODE);
    exit;
}

$body = file_get_contents('php://input') ?: '';
if (!scolia_bridge_verified($body)) scolia_out(403, ['error' => 'Not allowed.']);
$in = json_decode($body, true);
$r = is_array($in['result'] ?? null) ? $in['result'] : null;
$mid = (int)($in['match'] ?? 0);
if (!$mid || !$r || empty($r['finished'])) scolia_out(400, ['error' => 'Bad request.']);

$pdo = chat_db();
scolia_results_table($pdo);
$st = $pdo->prepare('SELECT * FROM matches WHERE id = ?');
$st->execute([$mid]);
$match = $st->fetch(PDO::FETCH_ASSOC);
if (!$match) scolia_out(404, ['error' => 'No such match.']);
$keep = function (string $status, string $note) use ($pdo, $mid, $match, $body) {
    $pdo->prepare('DELETE FROM scolia_results WHERE match_id = ?')->execute([$mid]);
    $pdo->prepare('INSERT INTO scolia_results (match_id, tournament_id, data, status, note, received_at) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute([$mid, (int)$match['tournament_id'], $body, $status, mb_substr($note, 0, 250), time()]);
};

// Already a result (an admin, or a player with a screenshot, was first): keep what the bridge saw, change nothing.
if (!empty($match['winner_id']) || ($match['score1'] !== null && $match['score1'] !== '')) {
    $keep('skipped', 'The match already had a result.');
    scolia_out(200, ['ok' => true, 'message' => 'already had a result']);
}
$ids = [(int)$match['player1_id'], (int)$match['player2_id']];
if (($in['players'] ?? null) !== $ids) { $keep('refused', 'Other players than in the bracket.'); scolia_out(409, ['error' => 'Players do not match.']); }
$score1 = (int)($r['score1'] ?? -1); $score2 = (int)($r['score2'] ?? -1);
$winner = $score1 > $score2 ? $ids[0] : ($score2 > $score1 ? $ids[1] : 0);
if (!$winner || (int)($r['winner'] ?? 0) !== $winner) { $keep('refused', 'No clear winner.'); scolia_out(400, ['error' => 'No clear winner.']); }

// The values, as parse-match-screenshot.php would have left them in the session of the winner.
$num = fn($k, $int = true) => isset($r[$k]) && $r[$k] !== null && $r[$k] !== '' ? ($int ? (int)$r[$k] : round((float)$r[$k], 2)) : null;
$vals = [
    'score1' => $score1, 'score2' => $score2,
    'p1_avg' => $num('p1_avg', false), 'p2_avg' => $num('p2_avg', false),
    'p1_100s' => $num('p1_100s') ?? 0, 'p2_100s' => $num('p2_100s') ?? 0,
    'p1_140s' => $num('p1_140s') ?? 0, 'p2_140s' => $num('p2_140s') ?? 0,
    'p1_180s' => $num('p1_180s') ?? 0, 'p2_180s' => $num('p2_180s') ?? 0,
    'p1_checkout' => $num('p1_checkout'), 'p2_checkout' => $num('p2_checkout'),
];

// Act as the winner for this one request: a session without a cookie, thrown away at the end.
ini_set('session.use_cookies', '0');
ini_set('session.use_only_cookies', '0');
ini_set('session.use_trans_sid', '0');
session_cache_limiter('');
session_id('ddlscolia' . bin2hex(random_bytes(12)));
session_start();
$p = $pdo->prepare('SELECT name, email FROM players WHERE id = ?');
$p->execute([$winner]);
$pl = $p->fetch(PDO::FETCH_ASSOC) ?: [];
$_SESSION['user_id'] = $winner;
$_SESSION['user_name'] = (string)($pl['name'] ?? '');
$_SESSION['user_email'] = (string)($pl['email'] ?? '');
$_SESSION['ddl_match_shot'][$mid] = time();
$_SESSION['ddl_match_shot_vals'][$mid] = $vals;

$_SERVER['REQUEST_METHOD'] = 'POST';
$_POST = ['match_id' => (string)$mid, 'bracket' => (string)$match['bracket'], 'round' => (string)$match['round'],
    'redirect_url' => '/tournament-b.php?id=' . (int)$match['tournament_id']];
foreach ($vals as $k => $v) if ($v !== null) $_POST[$k] = (string)$v;
$_GET = ['round' => (string)$match['round']];

// update-score-b.php ends with header('Location: …') + exit: see what it did afterwards.
register_shutdown_function(function () use ($pdo, $mid, $keep) {
    global $SCOLIA;
    if ($SCOLIA['phase'] !== 'result') return;
    $loc = '';
    foreach (headers_list() as $h) if (stripos($h, 'Location:') === 0) $loc = trim(substr($h, 9));
    $out = '';
    while (ob_get_level() > 0) $out = ob_get_clean() . $out;
    $_SESSION = [];
    if (session_status() === PHP_SESSION_ACTIVE) session_destroy();
    $st = $pdo->prepare('SELECT winner_id, score1, score2 FROM matches WHERE id = ?');
    $st->execute([$mid]);
    $row = $st->fetch(PDO::FETCH_ASSOC) ?: [];
    if (!empty($row['winner_id'])) {
        $keep('saved', 'Saved ' . (int)$row['score1'] . '-' . (int)$row['score2']);
        scolia_out(200, ['ok' => true, 'message' => 'saved ' . (int)$row['score1'] . '-' . (int)$row['score2']]);
    }
    $why = trim(strip_tags($out)) ?: ($loc !== '' ? 'website answered: ' . $loc : 'not saved');
    $keep('failed', $why);
    error_log('scolia-result ' . $mid . ': ' . $why);
    scolia_out(500, ['error' => mb_substr($why, 0, 200)]);
});
$SCOLIA['phase'] = 'result';
ob_start();
include __DIR__ . '/update-score-b.php';
exit;
