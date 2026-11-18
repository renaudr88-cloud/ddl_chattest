<?php
// The player card in DDL Chat: a player's numbers from ddl-online.com (read only).
// GET /chat-profile.php?id=12   (header Authorization: Bearer <token from chat-login.php>)
// -> {"profile": {id, name, dartsmind, country, countryName, hometown, average, ranks:[{label,pos}], bestCheckout,
//                 league:{name, group, season, pos, size, pts, diff}|null, form:["W","L",...], badges:[{name, img}], profileUrl,
//                 career:{matches, wins, winPct, streak, s100, s140, s180}|null,
//                 rivals:{nemesis:{id,name,w,l}|null, mostWins:{...}|null}|null, about:{darts?, walkout?, favourite?, since?}}}
// Every part is optional: when one query fails (different table on the site), the rest still comes back.
require __DIR__ . '/chat-config.php';
require_once __DIR__ . '/chat-names.php';
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
    'name' => chat_display_name(['id' => $id] + $p),
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

// Career numbers, counted the same way as player-card.php on the website:
// matches, wins and streak over tournaments + group knockouts; 100s/140s/180s over tournaments + leagues.
$out['career'] = null;
$out['rivals'] = null;
try {
    $rows = [];
    foreach ([
        "SELECT player1_id AS p1, player2_id AS p2, score1 AS s1, score2 AS s2, created_at AS t FROM matches
         WHERE (player1_id = :pid OR player2_id = :pid) AND score1 IS NOT NULL AND score2 IS NOT NULL",
        "SELECT player1_id AS p1, player2_id AS p2, player1_score AS s1, player2_score AS s2, created_at AS t FROM group_knockout_group_matches
         WHERE (player1_id = :pid OR player2_id = :pid) AND player1_score IS NOT NULL AND player2_score IS NOT NULL",
        "SELECT player1_id AS p1, player2_id AS p2, score1 AS s1, score2 AS s2, created_at AS t FROM group_knockout_bracket_matches
         WHERE (player1_id = :pid OR player2_id = :pid) AND score1 IS NOT NULL AND score2 IS NOT NULL",
    ] as $sql) {
        try { $q = $db->prepare($sql); $q->execute(['pid' => $id]); $rows = array_merge($rows, $q->fetchAll(PDO::FETCH_ASSOC)); } catch (Throwable $e) {}
    }
    usort($rows, fn($x, $y) => strcmp((string)$x['t'], (string)$y['t']));
    $played = 0; $won = 0; $run = 0; $streak = 0; $h2h = [];
    foreach ($rows as $m) {
        $mine = (int)$m['p1'] === $id;
        $a = (int)($mine ? $m['s1'] : $m['s2']); $b = (int)($mine ? $m['s2'] : $m['s1']);
        $opp = (int)($mine ? $m['p2'] : $m['p1']);
        $played++;
        if ($a > $b) { $won++; $run++; $streak = max($streak, $run); } else { $run = 0; }
        if ($opp > 0) {
            $h2h[$opp] ??= ['w' => 0, 'l' => 0];
            if ($a > $b) $h2h[$opp]['w']++; elseif ($a < $b) $h2h[$opp]['l']++;
        }
    }
    $sum = ['s100' => 0, 's140' => 0, 's180' => 0];
    foreach ([
        "SELECT SUM(CASE WHEN player1_id = :pid THEN p1_100s ELSE p2_100s END), SUM(CASE WHEN player1_id = :pid THEN p1_140s ELSE p2_140s END),
                SUM(CASE WHEN player1_id = :pid THEN p1_180s ELSE p2_180s END) FROM matches WHERE player1_id = :pid OR player2_id = :pid",
        "SELECT SUM(CASE WHEN player1_id = :pid THEN p1_100s ELSE p2_100s END), SUM(CASE WHEN player1_id = :pid THEN p1_140s ELSE p2_140s END),
                SUM(CASE WHEN player1_id = :pid THEN p1_180s ELSE p2_180s END) FROM group_knockout_group_matches
         WHERE (player1_id = :pid OR player2_id = :pid) AND player1_score IS NOT NULL AND player2_score IS NOT NULL",
        "SELECT SUM(CASE WHEN player1_id = :pid THEN p1_100s ELSE p2_100s END), SUM(CASE WHEN player1_id = :pid THEN p1_140s ELSE p2_140s END),
                SUM(CASE WHEN player1_id = :pid THEN p1_180s ELSE p2_180s END) FROM group_knockout_bracket_matches
         WHERE (player1_id = :pid OR player2_id = :pid) AND score1 IS NOT NULL AND score2 IS NOT NULL",
        "SELECT SUM(CASE WHEN player1_id = :pid THEN p1_100_plus ELSE p2_100_plus END), SUM(CASE WHEN player1_id = :pid THEN p1_140_plus ELSE p2_140_plus END),
                SUM(CASE WHEN player1_id = :pid THEN p1_180s ELSE p2_180s END) FROM league_group_matches
         WHERE (player1_id = :pid OR player2_id = :pid) AND player1_score IS NOT NULL AND player2_score IS NOT NULL",
    ] as $sql) {
        try {
            $s = $db->prepare($sql); $s->execute(['pid' => $id]); $r = $s->fetch(PDO::FETCH_NUM);
            if ($r) { $sum['s100'] += (int)$r[0]; $sum['s140'] += (int)$r[1]; $sum['s180'] += (int)$r[2]; }
        } catch (Throwable $e) {}
    }
    if ($played > 0 || $sum['s180'] + $sum['s140'] + $sum['s100'] > 0) {
        $out['career'] = ['matches' => $played, 'wins' => $won, 'winPct' => $played ? (int)round($won * 100 / $played) : null,
            'streak' => $streak] + $sum;
    }
    // Rivals: the player who beat them most (nemesis) and the one they beat most
    $pick = function (string $k) use ($h2h) {
        $best = null;
        foreach ($h2h as $opp => $r) if ($r[$k] > 0 && (!$best || $r[$k] > $h2h[$best][$k])) $best = $opp;
        return $best;
    };
    $nem = $pick('l'); $vic = $pick('w');
    if ($nem || $vic) {
        $ids = array_values(array_filter([$nem, $vic]));
        $s = $db->prepare('SELECT id, name, dartsmind_username FROM players WHERE id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')');
        $s->execute($ids);
        $names = [];
        foreach ($s->fetchAll(PDO::FETCH_ASSOC) as $r) $names[(int)$r['id']] = chat_display_name($r);
        $who = fn($o) => $o && isset($names[$o]) ? ['id' => 'ddl-' . $o, 'name' => $names[$o], 'w' => $h2h[$o]['w'], 'l' => $h2h[$o]['l']] : null;
        $out['rivals'] = ['nemesis' => $who($nem), 'mostWins' => $who($vic)];
    }
} catch (Throwable $e) {}

// About the player (filled in on their website profile)
$txt = fn($k) => ($v = trim((string)($p[$k] ?? ''))) !== '' ? mb_substr($v, 0, 60) : null;
$weight = $txt('darts_weight');
if ($weight !== null && is_numeric($weight)) $weight .= 'g';
$out['about'] = array_filter([
    'darts' => trim(implode(' ', array_filter([$txt('darts_brand'), $weight]))) ?: null,
    'walkout' => $txt('walkout_song'),
    'favourite' => $txt('favourite_player'),
    'since' => !empty($p['created_at']) && strtotime((string)$p['created_at']) ? date('M Y', strtotime((string)$p['created_at'])) : null,
]);

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
