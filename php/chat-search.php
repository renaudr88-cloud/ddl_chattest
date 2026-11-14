<?php
// GET /chat-search.php?q=jor   (header Authorization: Bearer <token from chat-login.php>)
// -> {"list": [{id, name, role, avatar, dartsmind}]}  DDL players whose name or Dartsmind name starts with q
// (or contains it, for 3+ letters). Read only. Used by Messages → + New to start a private chat.
require __DIR__ . '/chat-config.php';
chat_cors();
$me = chat_read_token(chat_bearer());
if (!$me) chat_json(401, ['error' => 'Log in again.']);

$q = trim((string)($_GET['q'] ?? ''));
if (mb_strlen($q) < 2 || mb_strlen($q) > 30) chat_json(200, ['list' => []]);
$like = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q);
$start = $like . '%';
$any = mb_strlen($q) >= 3 ? '%' . $like . '%' : $start;
$blocked = implode(',', array_map(fn($s) => chat_db()->quote($s), BLOCKED_STATUSES));

try {
    $st = chat_db()->prepare("
        SELECT id, name, is_admin, photo, dartsmind_username
        FROM players
        WHERE (name LIKE ? OR dartsmind_username LIKE ?)
          AND id <> ?
          AND LOWER(COALESCE(membership_status, '')) NOT IN ($blocked)
        ORDER BY (name LIKE ? OR dartsmind_username LIKE ?) DESC, name ASC
        LIMIT 15");
    $st->execute([$any, $any, (int)$me['uid'], $start, $start]);
    $rows = $st->fetchAll(PDO::FETCH_ASSOC);
} catch (Throwable $e) {
    error_log('chat-search: ' . $e->getMessage());
    chat_json(200, ['list' => []]);
}

chat_json(200, ['list' => array_map(fn($p) => [
    'id' => 'ddl-' . $p['id'],
    'name' => trim((string)$p['name']) !== '' ? mb_substr(trim((string)$p['name']), 0, 30) : 'Player ' . $p['id'],
    'role' => (int)$p['is_admin'] === 1 ? 'admin' : 'player',
    'avatar' => chat_photo_url((string)($p['photo'] ?? '')),
    'dartsmind' => trim((string)($p['dartsmind_username'] ?? '')) ?: null,
], $rows)]);
