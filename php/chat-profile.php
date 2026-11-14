<?php
// The player card in DDL Chat: a player's numbers from ddl-online.com (read only).
// GET /chat-profile.php?id=12   (header Authorization: Bearer <token from chat-login.php>)
// -> {"profile": {id, name, dartsmind, country, countryName, hometown, average, ranks:[{label,pos}], bestCheckout,
//                 league:{name, group, season, pos, size, pts, diff}|null, form:["W","L",...], badges:[{name, img}], profileUrl}}
// Every part is optional: when one query fails (different table on the site), the rest still comes back.
require __DIR__ . '/chat-config.php';
chat_cors();
$me = chat_read_token(chat_bearer());
if (!$me) chat_json(401, ['error' => 'Log in again.']);

$id = (int)preg_replace('/^ddl-/', '', (string)($_GET['id'] ?? ''));
if ($id <= 0) chat_json(400, ['error' => 'Player not found.']);
$db = chat_db();

$st = $db->prepare('SELECT * FROM players WHERE id = ? LIMIT 1');
$st->execute([$id]);
$p = $st->fetch(PDO::FETCH_ASSOC);
if (!$p || in_array(strtolower((string)($p['membership_status'] ?? '')), BLOCKED_STATUSES, true)) chat_json(404, ['error' => 'Player not found.']);

$countries = ['gb-eng' => 'England', 'gb-sct' => 'Scotland', 'gb-wls' => 'Wales', 'gb-nir' => 'Northern Ireland', 'gb' => 'United Kingdom',
    'ie' => 'Ireland', 'be' => 'Belgium', 'nl' => 'Netherlands', 'de' => 'Germany', 'fr' => 'France', 'es' => 'Spain', 'ca' => 'Canada',
    'us' => 'United States', 'au' => 'Australia', 'nz' => 'New Zealand', 'za' => 'South Africa', 'dk' => 'Denmark', 'se' => 'Sweden', 'no' => 'Norway'];
$cc = strtolower(trim((string)($p['country'] ?? '')));
if (!preg_match('/^[a-z]{2}(-[a-z]{3})?$/', $cc)) $cc = '';

$out = [
    'id' => 'ddl-' . $id,
    'name' => mb_substr(trim((string)($p['name'] ?? '')), 0, 40),
    'dartsmind' => trim((string)($p['dartsmind_username'] ?? '')) ?: null,
    'country' => $cc ?: null,
    'countryName' => $cc ? ($countries[$cc] ?? strtoupper($cc)) : null,
    'hometown' => trim((string)($p['hometown'] ?? '')) ?: null,
    'average' => isset($p['last_100_avg']) && (float)$p['last_100_avg'] > 0 ? round((float)$p['last_100_avg'], 2) : null,
    'ranks' => [],
    'bestCheckout' => null,
    'league' => null,
    'form' => [],
    'badges' => [],
    'profileUrl' => rtrim(CHAT_SITE_URL, '/') . '/player-card.php?id=' . $id,
];

// Rankings (no B rankings, same as the website header)
foreach (['seed' => 'Rank', 'seed_u50' => 'U50 rank', 'seed_5065' => '50-60 rank'] as $col => $label) {
    if (!empty($p[$col]) && (int)$p[$col] > 0) $out['ranks'][] = ['label' => $label, 'pos' => (int)$p[$col]];
}

// Best checkout: tournaments + group knockouts + leagues
$best = 0;
foreach ([
    "SELECT MAX(CASE WHEN player1_id = :pid THEN p1_checkout ELSE p2_checkout END) FROM matches WHERE player1_id = :pid OR player2_id = :pid",
    "SELECT MAX(CASE WHEN player1_id = :pid THEN p1_checkout ELSE p2_checkout END) FROM group_knockout_group_matches WHERE player1_id = :pid OR player2_id = :pid",
    "SELECT MAX(CASE WHEN player1_id = :pid THEN p1_checkout ELSE p2_checkout END) FROM group_knockout_bracket_matches WHERE player1_id = :pid OR player2_id = :pid",
    "SELECT MAX(CASE WHEN player1_id = :pid THEN p1_checkout ELSE p2_checkout END) FROM league_group_matches WHERE (player1_id = :pid OR player2_id = :pid) AND player1_score IS NOT NULL",
] as $sql) {
    try { $q = $db->prepare($sql); $q->execute(['pid' => $id]); $best = max($best, (int)$q->fetchColumn()); } catch (Throwable $e) {}
}
if ($best > 0) $out['bestCheckout'] = $best;

// Current league + place in the group (same order as view-league.php)
try {
    $q = $db->prepare("
        SELECT l.id, COALESCE(NULLIF(l.display_name, ''), l.name) AS league_name, l.season, g.id AS group_id, g.group_name,
               (SELECT COUNT(*) FROM league_groups g2 WHERE g2.league_id = l.id) AS group_count
        FROM leagues l
        JOIN league_groups g ON g.league_id = l.id
        JOIN league_group_players gp ON gp.group_id = g.id
        WHERE gp.player_id = ? AND l.completed_at IS NULL AND (l.is_visible = 1 OR l.is_visible IS NULL)
        ORDER BY l.season DESC, l.name ASC LIMIT 1");
    $q->execute([$id]);
    if ($lg = $q->fetch(PDO::FETCH_ASSOC)) {
        $s = $db->prepare("SELECT player_id, points, legs_for, legs_against FROM league_group_standings WHERE group_id = ?
            ORDER BY points DESC, (legs_for - legs_against) DESC, legs_for DESC, legs_against ASC");
        $s->execute([$lg['group_id']]);
        $rows = $s->fetchAll(PDO::FETCH_ASSOC);
        $pos = null; $pts = null; $diff = null;
        foreach ($rows as $i => $r) {
            if ((int)$r['player_id'] === $id) { $pos = $i + 1; $pts = (int)$r['points']; $diff = (int)$r['legs_for'] - (int)$r['legs_against']; break; }
        }
        $out['league'] = [
            'id' => (int)$lg['id'],
            'name' => (string)$lg['league_name'],
            'group' => (int)$lg['group_count'] > 1 ? 'Group ' . $lg['group_name'] : null,
            'season' => $lg['season'] !== null && $lg['season'] !== '' ? (string)$lg['season'] : null,
            'pos' => $pos, 'size' => count($rows), 'pts' => $pts, 'diff' => $diff,
        ];
    }
} catch (Throwable $e) {}

// Form: last 5 results over tournaments, group knockouts and leagues (newest last)
try {
    $q = $db->prepare("
        SELECT played_at, won FROM (
            SELECT created_at AS played_at,
                   CASE WHEN (player1_id = :pid AND score1 > score2) OR (player2_id = :pid AND score2 > score1) THEN 1 ELSE 0 END AS won
            FROM matches WHERE (player1_id = :pid OR player2_id = :pid) AND score1 IS NOT NULL AND score2 IS NOT NULL
            UNION ALL
            SELECT created_at,
                   CASE WHEN (player1_id = :pid AND player1_score > player2_score) OR (player2_id = :pid AND player2_score > player1_score) THEN 1 ELSE 0 END
            FROM group_knockout_group_matches WHERE (player1_id = :pid OR player2_id = :pid) AND player1_score IS NOT NULL AND player2_score IS NOT NULL
            UNION ALL
            SELECT created_at,
                   CASE WHEN (player1_id = :pid AND score1 > score2) OR (player2_id = :pid AND score2 > score1) THEN 1 ELSE 0 END
            FROM group_knockout_bracket_matches WHERE (player1_id = :pid OR player2_id = :pid) AND score1 IS NOT NULL AND score2 IS NOT NULL
            UNION ALL
            SELECT COALESCE(submitted_at, created_at),
                   CASE WHEN (player1_id = :pid AND player1_score > player2_score) OR (player2_id = :pid AND player2_score > player1_score) THEN 1 ELSE 0 END
            FROM league_group_matches WHERE (player1_id = :pid OR player2_id = :pid) AND player1_score IS NOT NULL AND player2_score IS NOT NULL
        ) x ORDER BY played_at DESC LIMIT 5");
    $q->execute(['pid' => $id]);
    $out['form'] = array_reverse(array_map(fn($r) => (int)$r['won'] === 1 ? 'W' : 'L', $q->fetchAll(PDO::FETCH_ASSOC)));
} catch (Throwable $e) {}

// Badges: highest tier per badge, like the profile page
try {
    $q = $db->prepare("
        SELECT b.badge_key, b.name, b.icon, b.threshold, pb.context
        FROM player_badges pb JOIN badges b ON b.id = pb.badge_id
        WHERE pb.player_id = :pid
          AND b.tier = (SELECT MAX(b2.tier) FROM player_badges pb2 JOIN badges b2 ON b2.id = pb2.badge_id
                        WHERE pb2.player_id = pb.player_id AND b2.badge_key = b.badge_key)
        ORDER BY b.sort_order, pb.context");
    $q->execute(['pid' => $id]);
    foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $b) {
        if ($b['badge_key'] === 'number_one' && in_array($b['context'], ['A_U50', 'B_U50', 'A_5065', 'B_5065'], true)) continue;
        $file = ($b['badge_key'] === 'number_one' && $b['context'] !== '') ? 'number_one_' . $b['context'] . '.png' : (string)$b['icon'];
        if (!preg_match('~^[A-Za-z0-9_.-]+\.(png|jpe?g|webp|svg)$~i', $file)) continue;
        $out['badges'][] = ['name' => (string)$b['name'], 'img' => rtrim(CHAT_SITE_URL, '/') . '/images/badges/' . $file];
        if (count($out['badges']) >= 8) break;
    }
} catch (Throwable $e) {}

chat_json(200, ['profile' => $out]);
