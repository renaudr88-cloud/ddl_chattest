<?php
// GET /chat-matches.php   (header Authorization: Bearer <token from chat-login.php>)
// -> {"list": [{match, tournament, round, bracket, platform, opponent: {id, name, avatar, dartsmind, scolia}}],
//     "checkin": [{id, name}]}   tournaments where check-in is open and I have not checked in yet (My DDL tab: red dot)
// The player's open matches in running tournaments (table matches, read only), so the chat can show
// "Your match: vs ..." with a button for a private chat and the opponent's Dartsmind name.
require __DIR__ . '/chat-config.php';
chat_cors();
$me = chat_read_token(chat_bearer());
if (!$me) chat_json(401, ['error' => 'Log in again.']);
$uid = (int)$me['uid'];

// With the platform (Dartsmind or Scolia) when the website has it (tournaments.platform, players.scolia_username);
// older databases without those columns: the same list without them.
$withPlatform = "t.platform AS platform, o.scolia_username AS osc,";
$rows = null;
foreach ([$withPlatform, ''] as $extra) try {
    $st = chat_db()->prepare("
        SELECT m.id, m.round, m.bracket, t.name AS tournament, $extra
               o.id AS oid, o.name AS oname, o.photo AS ophoto, o.dartsmind_username AS odm
        FROM matches m
        JOIN tournaments t ON t.id = m.tournament_id
        JOIN players o ON o.id = IF(m.player1_id = ?, m.player2_id, m.player1_id)
        WHERE (m.player1_id = ? OR m.player2_id = ?)
          AND m.player1_id IS NOT NULL AND m.player2_id IS NOT NULL
          AND m.winner_id IS NULL
          AND t.completed_at IS NULL AND t.archived_at IS NULL
          AND t.start_date >= CURDATE() - INTERVAL 3 DAY
        ORDER BY t.start_date ASC, m.round ASC, m.id ASC
        LIMIT 5");
    $st->execute([$uid, $uid, $uid]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    break;
} catch (Throwable $e) {
    if ($extra === '') { error_log('chat-matches: ' . $e->getMessage()); chat_json(200, ['list' => []]); }
}

$list = [];
foreach ($rows as $r) {
    $list[] = [
        'match' => (int)$r['id'], 'tournament' => (string)$r['tournament'],
        'round' => (int)$r['round'], 'bracket' => (string)($r['bracket'] ?? ''),
        'platform' => ($r['platform'] ?? '') === 'scolia' ? 'scolia' : 'dartsmind',
        'opponent' => [
            'id' => 'ddl-' . $r['oid'], 'role' => 'player',
            'name' => trim((string)$r['oname']) !== '' ? mb_substr(trim((string)$r['oname']), 0, 30) : 'Player ' . $r['oid'],
            'avatar' => chat_photo_url((string)($r['ophoto'] ?? '')),
            'dartsmind' => trim((string)($r['odm'] ?? '')) ?: null,
            'scolia' => trim((string)($r['osc'] ?? '')) ?: null,
        ],
    ];
}
// Check-in open and not checked in yet (as a player or a reserve).
$checkin = [];
try {
    $st = chat_db()->prepare("
        SELECT t.id, t.name FROM tournaments t
        LEFT JOIN tournament_players tp ON tp.tournament_id = t.id AND tp.player_id = ?
        LEFT JOIN tournament_reserve_list tr ON tr.tournament_id = t.id AND tr.user_id = ?
        WHERE t.check_in_open = 1 AND t.completed_at IS NULL AND t.archived_at IS NULL
          AND ((tp.player_id IS NOT NULL AND tp.checked_in = 0) OR (tr.user_id IS NOT NULL AND tr.checked_in = 0))
        LIMIT 5");
    $st->execute([$uid, $uid]);
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) $checkin[] = ['id' => (int)$r['id'], 'name' => (string)$r['name']];
} catch (Throwable $e) { error_log('chat-matches checkin: ' . $e->getMessage()); }

// After the answer is sent: "Your match is ready" notifications for everyone (at most once a minute, see chat-match-alerts.php).
register_shutdown_function(function () {
    if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
    if (is_file(__DIR__ . '/chat-match-alerts.php')) { require_once __DIR__ . '/chat-match-alerts.php'; chat_match_alerts(chat_db()); }
});
chat_json(200, ['list' => $list, 'checkin' => $checkin]);
