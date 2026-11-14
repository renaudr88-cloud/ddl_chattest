<?php
// DDL Chat: let the website's push notifications also arrive from DDL Chat.
// The website already sends web push to every row in push_subscriptions for a player (push-functions.php,
// sendPushToPlayer). This file adds the chat's subscription for the logged-in player to that same table,
// using the website's own VAPID key (push-config.php). No other website file changes.
//
// GET  /chat-push-subscribe.php                                   -> {"publicKey": "<VAPID public key>"}
// POST /chat-push-subscribe.php {"subscription": {endpoint, keys:{p256dh, auth}}}  -> saves it, sends a test notification
// POST /chat-push-subscribe.php {"remove": "<endpoint>"}           -> deletes it
// Header: Authorization: Bearer <token from chat-login.php>
require __DIR__ . '/chat-config.php';
chat_cors();
$me = chat_read_token(chat_bearer());
if (!$me) chat_json(401, ['error' => 'Log in again.']);
$uid = (int)$me['uid'];

if (!is_file(__DIR__ . '/push-config.php')) chat_json(500, ['error' => 'Notifications are not set up on the DDL website.']);
require_once __DIR__ . '/push-config.php';
if (!defined('VAPID_PUBLIC_KEY')) chat_json(500, ['error' => 'Notifications are not set up on the DDL website.']);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    chat_json(200, ['publicKey' => VAPID_PUBLIC_KEY]);
}

$in = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($in)) chat_json(400, ['error' => 'Bad request.']);
$db = chat_db();

// Only push services' https addresses are accepted.
function chat_push_endpoint_ok($e): bool {
    return is_string($e) && strlen($e) <= 1000 && preg_match('#^https://[a-z0-9.-]+(:\d+)?/#i', $e);
}

if (isset($in['remove'])) {
    if (chat_push_endpoint_ok($in['remove'])) {
        $db->prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')->execute([$uid, $in['remove']]);
    }
    chat_json(200, ['ok' => true]);
}

$sub = $in['subscription'] ?? null;
$endpoint = $sub['endpoint'] ?? null;
$p256dh = $sub['keys']['p256dh'] ?? null;
$auth = $sub['keys']['auth'] ?? null;
if (!chat_push_endpoint_ok($endpoint) || !is_string($p256dh) || !is_string($auth)
    || strlen($p256dh) > 200 || strlen($auth) > 100) {
    chat_json(400, ['error' => 'Bad subscription.']);
}

try {
    // One row per device: replace an older row for the same address.
    $db->prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')->execute([$endpoint]);
    $db->prepare('INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)')
       ->execute([$uid, $endpoint, $p256dh, $auth]);
} catch (Throwable $e) {
    error_log('chat-push-subscribe: ' . $e->getMessage());
    chat_json(500, ['error' => 'Could not save. Try again later.']);
}

// A test notification to this device only, so the player sees it works.
$sent = false;
try {
    if (is_file(__DIR__ . '/vendor/autoload.php') && defined('VAPID_PRIVATE_KEY')) {
        require_once __DIR__ . '/vendor/autoload.php';
        $wp = new \Minishlink\WebPush\WebPush(['VAPID' => [
            'subject' => 'mailto:admin@ddl-online.com',
            'publicKey' => VAPID_PUBLIC_KEY,
            'privateKey' => VAPID_PRIVATE_KEY,
        ]], ['TTL' => 60]);
        $report = $wp->sendOneNotification(
            \Minishlink\WebPush\Subscription::create(['endpoint' => $endpoint, 'keys' => ['p256dh' => $p256dh, 'auth' => $auth]]),
            json_encode(['title' => 'DDL Chat 🔔', 'body' => 'Notifications are on. Tournament reminders and check-in alerts will show up here.']),
            ['urgency' => 'high']
        );
        $sent = $report->isSuccess();
    }
} catch (Throwable $e) {
    error_log('chat-push-subscribe test: ' . $e->getMessage());
}
chat_json(200, ['ok' => true, 'test' => $sent]);
