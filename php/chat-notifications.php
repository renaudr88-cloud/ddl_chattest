<?php
// The website's notifications (table notifications) in the chat.
// GET  /chat-notifications.php          -> {"list": [{id, title, body, ts, read}], "unread": n}
// POST /chat-notifications.php {"read": true}  -> marks them all as read (same as opening notifications.php)
// Header: Authorization: Bearer <token from chat-login.php>
require __DIR__ . '/chat-config.php';
chat_cors();
$me = chat_read_token(chat_bearer());
if (!$me) chat_json(401, ['error' => 'Log in again.']);
$uid = (int)$me['uid'];
$db = chat_db();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $db->prepare('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL')->execute([$uid]);
    chat_json(200, ['ok' => true]);
}

$st = $db->prepare('SELECT id, title, body, created_at, read_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50');
$st->execute([$uid]);
$list = [];
$unread = 0;
foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $n) {
    $read = $n['read_at'] !== null;
    if (!$read) $unread++;
    $list[] = ['id' => (int)$n['id'], 'title' => (string)$n['title'], 'body' => (string)$n['body'],
               'ts' => strtotime((string)$n['created_at']) * 1000, 'read' => $read];
}
chat_json(200, ['list' => $list, 'unread' => $unread]);
