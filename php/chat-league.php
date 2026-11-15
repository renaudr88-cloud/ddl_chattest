<?php
// DDL Chat: plan a league match with your opponent (League Match Planner).
// Header: Authorization: Bearer <token from chat-login.php>
//
// GET  /chat-league.php?with=ddl-12        -> {"list": [fixture, ...]}  my unplayed league matches (against that player)
// GET  /chat-league.php?id=5               -> {"plan": plan}            one plan (for the card in the chat)
// POST {"action":"propose","fixture":123,"at":1763494200000,"tz":"Europe/Brussels"}  -> {"plan": plan}
// POST {"action":"accept","id":5}           only the opponent of the one who proposed
// POST {"action":"cancel","id":5,"reason":"..."}   either player
//
// fixture = {fixture, league, group, week, opponent:{id, name}, plan|null}
// plan    = {id, fixture, league, group, week, at (ms, UTC), tz, status: proposed|confirmed|cancelled|replaced,
//            by:{id,name}, opponent:{id,name}, cancelledBy:{id,name}|null, reason, updated (ms)}
// Every change is also written to league_schedule_log (for the admin page league-schedule.php).
require __DIR__ . '/chat-config.php';
require_once __DIR__ . '/league-schedule-lib.php';
chat_cors();
$me = chat_read_token(chat_bearer());
if (!$me) chat_json(401, ['error' => 'Log in again.']);
$uid = (int)$me['uid'];
$db = chat_db();
if (!ls_tables($db)) chat_json(500, ['error' => 'Could not load the planner. Try again later.']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    if (isset($_GET['id'])) {
        $p = ls_plan($db, (int)$_GET['id']);
        if (!$p || !in_array($uid, [$p['by']['id'], $p['opponent']['id']], true)) chat_json(404, ['error' => 'Not found.']);
        chat_json(200, ['plan' => ls_out($p)]);
    }
    $with = preg_match('/^ddl-(\d+)$/', (string)($_GET['with'] ?? ''), $m) ? (int)$m[1] : 0;
    chat_json(200, ['list' => ls_my_fixtures($db, $uid, $with)]);
}

$in = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($in)) chat_json(400, ['error' => 'Bad request.']);
$action = (string)($in['action'] ?? '');

if ($action === 'propose') {
    $fx = ls_fixture($db, (int)($in['fixture'] ?? 0));
    if (!$fx || !in_array($uid, [$fx['p1'], $fx['p2']], true)) chat_json(404, ['error' => 'That league match was not found.']);
    if ($fx['played']) chat_json(400, ['error' => 'This match has already been played.']);
    $at = (int)($in['at'] ?? 0);
    if ($at < (time() - 3600) * 1000 || $at > (time() + 120 * 86400) * 1000) chat_json(400, ['error' => 'Pick a date and time in the future.']);
    $tz = (string)($in['tz'] ?? 'Europe/London');
    if (!in_array($tz, DateTimeZone::listIdentifiers(), true)) $tz = 'Europe/London';
    $opp = $fx['p1'] === $uid ? $fx['p2'] : $fx['p1'];
    // A new time replaces the earlier plan for this match.
    $old = $db->prepare("SELECT id FROM league_match_schedule WHERE fixture_id = ? AND status IN ('proposed','confirmed')");
    $old->execute([$fx['id']]);
    foreach ($old->fetchAll(PDO::FETCH_COLUMN) as $oid) {
        $db->prepare("UPDATE league_match_schedule SET status = 'replaced', updated_at = NOW() WHERE id = ?")->execute([$oid]);
        ls_log($db, (int)$oid, $fx['id'], 'replaced', $uid, 'new time suggested');
    }
    $db->prepare("INSERT INTO league_match_schedule (fixture_id, proposed_by, opponent_id, play_ts, tz, status, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, 'proposed', NOW(), NOW())")
       ->execute([$fx['id'], $uid, $opp, intdiv($at, 1000), $tz]);
    $id = (int)$db->lastInsertId();
    ls_log($db, $id, $fx['id'], 'proposed', $uid, gmdate('Y-m-d H:i', intdiv($at, 1000)) . ' UTC (' . $tz . ')');
    chat_json(200, ['plan' => ls_out(ls_plan($db, $id))]);
}

$p = ls_plan($db, (int)($in['id'] ?? 0));
if (!$p || !in_array($uid, [$p['by']['id'], $p['opponent']['id']], true)) chat_json(404, ['error' => 'Not found.']);

if ($action === 'accept') {
    if ($p['status'] !== 'proposed') chat_json(400, ['error' => $p['status'] === 'confirmed' ? 'Already confirmed.' : 'This time is no longer open.']);
    if ($p['by']['id'] === $uid) chat_json(400, ['error' => 'Your opponent has to accept this time.']);
    $db->prepare("UPDATE league_match_schedule SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW() WHERE id = ?")->execute([$p['id']]);
    ls_log($db, $p['id'], $p['fixture'], 'confirmed', $uid, '');
    chat_json(200, ['plan' => ls_out(ls_plan($db, $p['id']))]);
}

if ($action === 'cancel') {
    if (!in_array($p['status'], ['proposed', 'confirmed'], true)) chat_json(400, ['error' => 'This time is no longer open.']);
    $reason = mb_substr(trim(preg_replace('/\s+/u', ' ', (string)($in['reason'] ?? ''))), 0, 200);
    $db->prepare("UPDATE league_match_schedule SET status = 'cancelled', cancelled_by = ?, cancel_reason = ?, cancelled_at = NOW(), updated_at = NOW() WHERE id = ?")
       ->execute([$uid, $reason, $p['id']]);
    ls_log($db, $p['id'], $p['fixture'], 'cancelled', $uid, $reason);
    chat_json(200, ['plan' => ls_out(ls_plan($db, $p['id']))]);
}

chat_json(400, ['error' => 'Bad request.']);
