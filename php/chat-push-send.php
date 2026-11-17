<?php
// DDL Chat: a phone notification for a private message or an @tag, sent by the chat right after the message.
// POST /chat-push-send.php {"kind":"dm"|"tag", "to":["ddl-12", ...], "room":"dm:dartsmind:ddl-3:ddl-12", "text":"..."}
// Header: Authorization: Bearer <token from chat-login.php>
// Only to the chat's own devices (chat_push_endpoints, filled by chat-push-subscribe.php), never to the website's.
// The sender's name comes from the DDL database, not from the request. Max 40 notifications per sender per 10 minutes.
require __DIR__ . '/chat-config.php';
chat_cors();
$me = chat_read_token(chat_bearer());
if (!$me) chat_json(401, ['error' => 'Log in again.']);
if ($_SERVER['REQUEST_METHOD'] !== 'POST') chat_json(405, ['error' => 'Use POST.']);
$uid = (int)$me['uid'];

$in = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($in)) chat_json(400, ['error' => 'Bad request.']);
$kind = ($in['kind'] ?? '') === 'tag' ? 'tag' : 'dm';
$room = (string)($in['room'] ?? '');
$text = trim(preg_replace('/\s+/u', ' ', (string)($in['text'] ?? '')));
if (!preg_match('/^(general|tournament|premier|raffle|dm):[a-z]+(:ddl-\d+:ddl-\d+)?$/', $room)
    && !preg_match('/^ch:[A-Za-z0-9]{1,40}$/', $room)) chat_json(400, ['error' => 'Bad room.']);

$to = [];
foreach ((array)($in['to'] ?? []) as $t) {
    if (preg_match('/^ddl-(\d+)$/', (string)$t, $m) && (int)$m[1] !== $uid) $to[(int)$m[1]] = true;
}
$to = array_slice(array_keys($to), 0, 10);
// A private chat: only the other member of that chat.
if ($kind === 'dm') {
    $parts = explode(':', $room);
    if (count($parts) !== 4 || !in_array('ddl-' . $uid, [$parts[2], $parts[3]], true)) chat_json(400, ['error' => 'Bad room.']);
    $other = (int)substr($parts[2] === 'ddl-' . $uid ? $parts[3] : $parts[2], 4);
    $to = [$other];
}
if (!$to) chat_json(200, ['sent' => 0]);

if (!is_file(__DIR__ . '/push-config.php') || !is_file(__DIR__ . '/vendor/autoload.php')) chat_json(200, ['sent' => 0]);
require_once __DIR__ . '/push-config.php';
require_once __DIR__ . '/vendor/autoload.php';
if (!defined('VAPID_PUBLIC_KEY') || !defined('VAPID_PRIVATE_KEY')) chat_json(200, ['sent' => 0]);

$db = chat_db();
try {
    $db->exec("CREATE TABLE IF NOT EXISTS chat_push_log (sender INT NOT NULL, sent_at DATETIME NOT NULL, KEY sender (sender, sent_at))");
    $c = $db->prepare('SELECT COUNT(*) FROM chat_push_log WHERE sender = ? AND sent_at > (NOW() - INTERVAL 10 MINUTE)');
    $c->execute([$uid]);
    if ((int)$c->fetchColumn() >= 40) chat_json(200, ['sent' => 0, 'limited' => true]);
    if (mt_rand(1, 50) === 1) $db->exec('DELETE FROM chat_push_log WHERE sent_at < (NOW() - INTERVAL 1 DAY)');
} catch (Throwable $e) { error_log('chat-push-send log: ' . $e->getMessage()); }

$st = $db->prepare('SELECT name, dartsmind_username FROM players WHERE id = ?');
$st->execute([$uid]);
$p = $st->fetch(PDO::FETCH_ASSOC) ?: [];
$name = mb_substr(trim((string)($p['dartsmind_username'] ?? '')) ?: (trim((string)($p['name'] ?? '')) ?: 'A player'), 0, 30);   // Dartsmind name, like in the chat

$body = $text !== '' ? mb_substr($text, 0, 140) : '📷 Picture';
$where = ['general' => 'General', 'tournament' => 'Tournament', 'premier' => 'Premier League', 'raffle' => 'Raffles'][explode(':', $room)[0]] ?? '';
// A chat room staff made: its name, as the app sends it (only used in the notification title).
if (str_starts_with($room, 'ch:')) $where = mb_substr(trim(preg_replace('/[\x00-\x1F]+/u', ' ', (string)($in['where'] ?? ''))), 0, 40) ?: 'a chat room';
$payload = $kind === 'dm'
    ? ['title' => '💬 ' . $name, 'body' => $body, 'url' => '/?dm=' . $uid, 'tag' => $room]
    : ['title' => '@ ' . $name . ' tagged you' . ($where ? ' in ' . $where : ''), 'body' => $body, 'url' => '/?room=' . rawurlencode($room), 'tag' => 'tag-' . $room];

try {
    $in_ = implode(',', array_fill(0, count($to), '?'));
    $q = $db->prepare("SELECT ps.endpoint, ps.p256dh, ps.auth, ps.user_id
        FROM chat_push_endpoints ce JOIN push_subscriptions ps ON ps.endpoint = ce.endpoint
        WHERE ce.user_id IN ($in_)");
    $q->execute($to);
    $subs = $q->fetchAll(PDO::FETCH_ASSOC);
} catch (Throwable $e) {
    error_log('chat-push-send: ' . $e->getMessage());
    chat_json(200, ['sent' => 0]);
}
if (!$subs) chat_json(200, ['sent' => 0]);

$wp = new \Minishlink\WebPush\WebPush(['VAPID' => [
    'subject' => 'mailto:admin@ddl-online.com', 'publicKey' => VAPID_PUBLIC_KEY, 'privateKey' => VAPID_PRIVATE_KEY,
]], ['TTL' => 3600]);
foreach ($subs as $s) {
    $wp->queueNotification(
        \Minishlink\WebPush\Subscription::create(['endpoint' => $s['endpoint'], 'keys' => ['p256dh' => $s['p256dh'], 'auth' => $s['auth']]]),
        json_encode($payload), ['urgency' => 'high', 'topic' => substr(preg_replace('/[^A-Za-z0-9_-]/', '', $payload['tag']), 0, 32)]
    );
}
$sent = 0;
foreach ($wp->flush() as $report) {
    if ($report->isSuccess()) { $sent++; continue; }
    if (method_exists($report, 'isSubscriptionExpired') && $report->isSubscriptionExpired()) {   // phone uninstalled / turned off: clean up
        $e = $report->getEndpoint();
        $db->prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')->execute([$e]);
        $db->prepare('DELETE FROM chat_push_endpoints WHERE endpoint_hash = ?')->execute([sha1($e)]);
    }
}
try { $db->prepare('INSERT INTO chat_push_log (sender, sent_at) VALUES (?, NOW())')->execute([$uid]); } catch (Throwable $e) {}
chat_json(200, ['sent' => $sent]);
