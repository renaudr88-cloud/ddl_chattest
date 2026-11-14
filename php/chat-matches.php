<?php
// GET /chat-matches.php   (header Authorization: Bearer <token from chat-login.php>)
// -> {"list": [{match, tournament, round, bracket, opponent: {id, name, avatar, dartsmind}}]}
// The player's open matches in running tournaments (table matches, read only), so the chat can show
// "Your match: vs ..." with a button for a private chat and the opponent's Dartsmind name.
require __DIR__ . '/chat-config.php';
chat_cors();
$me = chat_read_token(chat_bearer());
if (!$me) chat_json(401, ['error' => 'Log in again.']);
$uid = (int)$me['uid'];

try {
    $st = chat_db()->prepare("
        SELECT m.id, m.round, m.bracket, t.name AS tournament,
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
} catch (Throwable $e) {
    error_log('chat-matches: ' . $e->getMessage());
    chat_json(200, ['list' => []]);
}

$list = [];
foreach ($rows as $r) {
    $list[] = [
        'match' => (int)$r['id'], 'tournament' => (string)$r['tournament'],
        'round' => (int)$r['round'], 'bracket' => (string)($r['bracket'] ?? ''),
        'opponent' => [
            'id' => 'ddl-' . $r['oid'], 'role' => 'player',
            'name' => trim((string)$r['oname']) !== '' ? mb_substr(trim((string)$r['oname']), 0, 30) : 'Player ' . $r['oid'],
            'avatar' => chat_photo_url((string)($r['ophoto'] ?? '')),
            'dartsmind' => trim((string)($r['odm'] ?? '')) ?: null,
        ],
    ];
}
chat_json(200, ['list' => $list]);
