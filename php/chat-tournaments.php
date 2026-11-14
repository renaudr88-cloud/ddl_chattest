<?php
// GET /chat-tournaments.php        -> {"list": [...]}  open tournaments that have not started yet
// GET /chat-tournaments.php?id=12  -> {"list": [one]}  one tournament (for a card in the chat), also once started
// Header: Authorization: Bearer <token from chat-login.php>. Read only: signing up happens on the website
// (tournament-detail.php), with all its checks (average screenshot, ban, clashes, ...).
require __DIR__ . '/chat-config.php';
chat_cors();
$me = chat_read_token(chat_bearer());
if (!$me) chat_json(401, ['error' => 'Log in again.']);
$uid = (int)$me['uid'];
$one = (int)($_GET['id'] ?? 0);

try {
    $sql = "SELECT t.id, t.name, t.format, t.start_date, t.start_time, t.timezone, t.max_players, t.registration_open_days,
                   t.min_avg, t.max_avg,
                   (SELECT COUNT(*) FROM tournament_players WHERE tournament_id = t.id) AS players,
                   (SELECT COUNT(*) FROM tournament_reserve_list WHERE tournament_id = t.id) AS reserves,
                   EXISTS(SELECT 1 FROM tournament_players WHERE tournament_id = t.id AND player_id = ?) AS joined,
                   EXISTS(SELECT 1 FROM tournament_reserve_list WHERE tournament_id = t.id AND user_id = ?) AS reserved
            FROM tournaments t
            WHERE t.archived_at IS NULL AND t.is_private = 0 AND t.is_b_bracket = 0
              AND (t.is_playoff IS NULL OR t.is_playoff = 0)
              AND " . ($one ? 't.id = ?' : 't.start_date >= CURDATE() - INTERVAL 1 DAY') . "
            ORDER BY t.start_date ASC, t.start_time ASC
            LIMIT 40";
    $st = chat_db()->prepare($sql);
    $st->execute($one ? [$uid, $uid, $one] : [$uid, $uid]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
} catch (Throwable $e) {
    error_log('chat-tournaments: ' . $e->getMessage());
    chat_json(500, ['error' => 'Could not load the tournaments. Try again later.']);
}

$list = [];
foreach ($rows as $t) {
    // Same times as tournament-detail.php: start in the tournament's time zone, joining closes 5 minutes before,
    // registration opens registration_open_days days (+2.5 hours) before the start.
    try { $tz = new DateTimeZone($t['timezone'] ?: 'Europe/London'); } catch (Throwable $e) { $tz = new DateTimeZone('Europe/London'); }
    $start = new DateTime($t['start_date'] . ' ' . ($t['start_time'] ?: '00:00:00'), $tz);
    $now = new DateTime('now', $tz);
    $days = (int)($t['registration_open_days'] ?? 3);
    $opens = $days === 0 ? null : (clone $start)->modify("-{$days} days -2 hours -30 minutes");
    $closed = $now >= (clone $start)->modify('-5 minutes');
    if (!$one && $closed) continue;
    $list[] = [
        'id' => (int)$t['id'],
        'name' => (string)$t['name'],
        'format' => ucwords(str_replace('_', ' ', (string)$t['format'])),
        'start' => $start->getTimestamp() * 1000,
        'opens' => $opens && $now < $opens ? $opens->getTimestamp() * 1000 : null,   // registration not open yet
        'closed' => $closed,
        'max' => (int)$t['max_players'],
        'players' => (int)$t['players'],
        'reserves' => (int)$t['reserves'],
        'minAvg' => $t['min_avg'] !== null ? (float)$t['min_avg'] : null,
        'maxAvg' => $t['max_avg'] !== null ? (float)$t['max_avg'] : null,
        'me' => $t['joined'] ? 'joined' : ($t['reserved'] ? 'reserve' : null),
        'url' => rtrim(CHAT_SITE_URL, '/') . '/tournament-detail.php?id=' . (int)$t['id'],
    ];
}
chat_json(200, ['list' => $list]);
