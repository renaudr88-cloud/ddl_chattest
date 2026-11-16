<?php
// League Match Planner: shared code for chat-league.php (the chat), league-schedule.php (admins),
// view-league.php (the "Plan in chat" button) and the 1-hour reminders (chat-match-alerts.php).
// Tables (made here the first time): league_match_schedule (one row per suggested time) and
// league_schedule_log (every change: proposed, confirmed, replaced, cancelled, reminded).
// Times are stored as Unix seconds (play_ts, UTC) so every player sees them in their own time zone.

function ls_tables(PDO $db): bool {
    static $ok = null;
    if ($ok !== null) return $ok;
    try {
        $db->exec("CREATE TABLE IF NOT EXISTS league_match_schedule (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            fixture_id INT NOT NULL,
            proposed_by INT NOT NULL,
            opponent_id INT NOT NULL,
            play_ts INT UNSIGNED NOT NULL,
            tz VARCHAR(40) NOT NULL DEFAULT 'Europe/London',
            status VARCHAR(12) NOT NULL DEFAULT 'proposed',
            confirmed_at DATETIME NULL,
            cancelled_by INT NULL,
            cancel_reason VARCHAR(200) NOT NULL DEFAULT '',
            cancelled_at DATETIME NULL,
            reminded TINYINT NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            KEY fixture (fixture_id), KEY play (status, play_ts))");
        $db->exec("CREATE TABLE IF NOT EXISTS league_schedule_log (
            id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
            schedule_id INT NOT NULL,
            fixture_id INT NOT NULL,
            action VARCHAR(12) NOT NULL,
            by_player INT NULL,
            detail VARCHAR(255) NOT NULL DEFAULT '',
            at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY fixture (fixture_id))");
        $ok = true;
    } catch (Throwable $e) {
        error_log('league schedule tables: ' . $e->getMessage());
        $ok = false;
    }
    return $ok;
}

function ls_log(PDO $db, int $scheduleId, int $fixtureId, string $action, ?int $by, string $detail): void {
    try {
        $db->prepare('INSERT INTO league_schedule_log (schedule_id, fixture_id, action, by_player, detail) VALUES (?, ?, ?, ?, ?)')
           ->execute([$scheduleId, $fixtureId, $action, $by, mb_substr($detail, 0, 255)]);
    } catch (Throwable $e) { error_log('league schedule log: ' . $e->getMessage()); }
}

function ls_name(?string $dm, ?string $name, int $id): string {
    $n = trim((string)$dm) ?: trim((string)$name);
    return $n !== '' ? mb_substr($n, 0, 30) : 'Player ' . $id;
}

// One league match (fixture) with its league, group and week.
function ls_fixture(PDO $db, int $id): ?array {
    if ($id <= 0) return null;
    $st = $db->prepare('SELECT m.id, m.player1_id, m.player2_id, m.game_week, m.player1_score, m.player2_score, m.missed,
            g.group_name, l.id AS league_id, l.name AS league
        FROM league_group_matches m JOIN league_groups g ON g.id = m.group_id JOIN leagues l ON l.id = g.league_id
        WHERE m.id = ?');
    $st->execute([$id]);
    $r = $st->fetch(PDO::FETCH_ASSOC);
    if (!$r) return null;
    return [
        'id' => (int)$r['id'], 'p1' => (int)$r['player1_id'], 'p2' => (int)$r['player2_id'],
        'week' => (int)$r['game_week'], 'group' => (string)$r['group_name'],
        'league' => (string)$r['league'], 'league_id' => (int)$r['league_id'],
        'played' => ($r['player1_score'] !== null && $r['player1_score'] !== '') || !empty($r['missed']),
    ];
}

const LS_PLAN_SQL = "SELECT s.*, m.game_week, g.group_name, l.name AS league, l.id AS league_id,
        a.dartsmind_username AS a_dm, a.name AS a_name, b.dartsmind_username AS b_dm, b.name AS b_name,
        c.dartsmind_username AS c_dm, c.name AS c_name
    FROM league_match_schedule s
    JOIN league_group_matches m ON m.id = s.fixture_id
    JOIN league_groups g ON g.id = m.group_id
    JOIN leagues l ON l.id = g.league_id
    JOIN players a ON a.id = s.proposed_by
    JOIN players b ON b.id = s.opponent_id
    LEFT JOIN players c ON c.id = s.cancelled_by";

function ls_row(array $r): array {
    return [
        'id' => (int)$r['id'], 'fixture' => (int)$r['fixture_id'],
        'league' => (string)$r['league'], 'league_id' => (int)$r['league_id'], 'group' => (string)$r['group_name'], 'week' => (int)$r['game_week'],
        'at' => (int)$r['play_ts'], 'tz' => (string)$r['tz'], 'status' => (string)$r['status'],
        'by' => ['id' => (int)$r['proposed_by'], 'name' => ls_name($r['a_dm'], $r['a_name'], (int)$r['proposed_by'])],
        'opponent' => ['id' => (int)$r['opponent_id'], 'name' => ls_name($r['b_dm'], $r['b_name'], (int)$r['opponent_id'])],
        'cancelledBy' => $r['cancelled_by'] ? ['id' => (int)$r['cancelled_by'], 'name' => ls_name($r['c_dm'], $r['c_name'], (int)$r['cancelled_by'])] : null,
        'reason' => (string)$r['cancel_reason'],
        'created' => (string)$r['created_at'], 'confirmed' => (string)($r['confirmed_at'] ?? ''), 'cancelled' => (string)($r['cancelled_at'] ?? ''),
        'updated' => (string)$r['updated_at'],
    ];
}

function ls_plan(PDO $db, int $id): ?array {
    if ($id <= 0) return null;
    $st = $db->prepare(LS_PLAN_SQL . ' WHERE s.id = ?');
    $st->execute([$id]);
    $r = $st->fetch(PDO::FETCH_ASSOC);
    return $r ? ls_row($r) : null;
}

// For the chat: ids as the chat knows them (ddl-<id>), times in milliseconds.
function ls_out(?array $p): ?array {
    if (!$p) return null;
    $u = fn($x) => $x ? ['id' => 'ddl-' . $x['id'], 'name' => $x['name']] : null;
    return [
        'id' => $p['id'], 'fixture' => $p['fixture'], 'league' => $p['league'], 'group' => $p['group'], 'week' => $p['week'],
        'at' => $p['at'] * 1000, 'tz' => $p['tz'], 'status' => $p['status'],
        'by' => $u($p['by']), 'opponent' => $u($p['opponent']), 'cancelledBy' => $u($p['cancelledBy']), 'reason' => $p['reason'],
    ];
}

// The current plan of each fixture: the newest one that was not replaced by a newer time.
function ls_current_for(PDO $db, array $fixtureIds): array {
    $fixtureIds = array_values(array_unique(array_map('intval', $fixtureIds)));
    if (!$fixtureIds || !ls_tables($db)) return [];
    $in = implode(',', array_fill(0, count($fixtureIds), '?'));
    $st = $db->prepare(LS_PLAN_SQL . " WHERE s.fixture_id IN ($in) AND s.status <> 'replaced' ORDER BY s.id ASC");
    $st->execute($fixtureIds);
    $out = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $r) $out[(int)$r['fixture_id']] = ls_row($r);
    return $out;
}

// My league matches that are not played yet (against one opponent when $with is given), with their current plan.
function ls_my_fixtures(PDO $db, int $uid, int $with = 0): array {
    // Only leagues that are still running: a league name (and group) can come back every season.
    $sql = "SELECT m.id, m.player1_id, m.player2_id, m.game_week, m.group_id, g.group_name, l.name AS league,
                   o.id AS oid, o.dartsmind_username AS odm, o.name AS oname
            FROM league_group_matches m
            JOIN league_groups g ON g.id = m.group_id
            JOIN leagues l ON l.id = g.league_id
            JOIN players o ON o.id = IF(m.player1_id = ?, m.player2_id, m.player1_id)
            WHERE (m.player1_id = ? OR m.player2_id = ?)
              AND (m.player1_score IS NULL OR m.player1_score = '') AND (m.missed IS NULL OR m.missed = 0)
              AND l.completed_at IS NULL"
            . ($with ? ' AND o.id = ?' : '') . "
            ORDER BY m.game_week ASC, m.id ASC
            LIMIT 40";
    $st = $db->prepare($sql);
    $st->execute($with ? [$uid, $uid, $uid, $with] : [$uid, $uid, $uid]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    $plans = ls_current_for($db, array_column($rows, 'id'));
    $list = [];
    foreach ($rows as $r) {
        $list[] = [
            'fixture' => (int)$r['id'], 'league' => (string)$r['league'], 'group' => (string)$r['group_name'], 'groupId' => (int)$r['group_id'], 'week' => (int)$r['game_week'],
            'opponent' => ['id' => 'ddl-' . $r['oid'], 'name' => ls_name($r['odm'], $r['oname'], (int)$r['oid'])],
            'plan' => ls_out($plans[(int)$r['id']] ?? null),
        ];
    }
    return $list;
}
