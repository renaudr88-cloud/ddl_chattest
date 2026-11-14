<?php
// GET /chat-player.php?id=12   (header Authorization: Bearer <token from chat-login.php>)
// -> {"user": {"id": "ddl-12", "name": "...", "role": "player", "avatar": "...", "dartsmind": "..."}}
// Used by the chat to open a private chat from the brackets (?dm=12) and to show the opponent's Dartsmind name.
require __DIR__ . '/chat-config.php';
chat_cors();
$me = chat_read_token(chat_bearer());
if (!$me) chat_json(401, ['error' => 'Log in again.']);

$id = (int)preg_replace('/^ddl-/', '', (string)($_GET['id'] ?? ''));
if ($id <= 0) chat_json(400, ['error' => 'Player not found.']);

$st = chat_db()->prepare('SELECT id, name, is_admin, membership_status, photo, dartsmind_username FROM players WHERE id = ? LIMIT 1');
$st->execute([$id]);
$p = $st->fetch(PDO::FETCH_ASSOC);
if (!$p || in_array(strtolower((string)($p['membership_status'] ?? '')), BLOCKED_STATUSES, true)) chat_json(404, ['error' => 'Player not found.']);

chat_json(200, ['user' => [
    'id' => 'ddl-' . $p['id'],
    'name' => trim((string)$p['name']) !== '' ? mb_substr(trim((string)$p['name']), 0, 30) : 'Player ' . $p['id'],
    'role' => (int)$p['is_admin'] === 1 ? 'admin' : 'player',
    'avatar' => chat_photo_url((string)($p['photo'] ?? '')),
    'dartsmind' => trim((string)($p['dartsmind_username'] ?? '')) ?: null,
]]);
