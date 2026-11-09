<?php
// POST /chat-login.php   JSON {"login": "username or email", "password": "..."}
// -> 200 {"token": "...", "user": {...}}  |  401 {"error": "..."}
// The app keeps the token and sends it to the WebSocket server and to chat-upload.php.
require __DIR__ . '/chat-config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') chat_json(405, ['error' => 'Use POST.']);

$in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$login = trim((string)($in['login'] ?? ''));
$password = (string)($in['password'] ?? '');
if ($login === '' || $password === '') chat_json(400, ['error' => 'Enter your username or email and your password.']);

// Basic brute-force brake: max 10 failed attempts per IP per 15 minutes (uses APCu when available).
$ipKey = 'chatlogin_' . ($_SERVER['REMOTE_ADDR'] ?? 'x');
if (function_exists('apcu_fetch') && (int)apcu_fetch($ipKey) >= 10) chat_json(429, ['error' => 'Too many attempts. Try again in 15 minutes.']);

$cols = [COL_ID . ' AS id', COL_USERNAME . ' AS username', COL_PASSWORD . ' AS hash'];
if (COL_AVATAR) $cols[] = COL_AVATAR . ' AS avatar';
if (COL_ROLE)   $cols[] = COL_ROLE . ' AS role';
$sql = 'SELECT ' . implode(',', $cols) . ' FROM ' . USERS_TABLE .
       ' WHERE ' . COL_USERNAME . ' = ? OR ' . COL_EMAIL . ' = ? LIMIT 1';
$st = chat_db()->prepare($sql);
$st->execute([$login, $login]);
$u = $st->fetch();

if (!$u || !password_verify($password, $u['hash'])) {
    if (function_exists('apcu_fetch')) { apcu_add($ipKey, 0, 900); apcu_inc($ipKey); }
    usleep(400000);
    chat_json(401, ['error' => 'Username or password is wrong.']);
}

// Banned players can't get a token.
$ban = chat_db()->prepare('SELECT banned FROM chat_sanctions WHERE user_id = ?');
$ban->execute([(string)$u['id']]);
if ((int)$ban->fetchColumn() === 1) chat_json(403, ['error' => 'This account is banned from the DDL chat.']);

$isAdmin = in_array((int)$u['id'], ADMIN_IDS, true) || (COL_ROLE && in_array(strtolower((string)$u['role']), ADMIN_ROLES, true));
$user = [
    'uid'    => (string)$u['id'],
    'name'   => $u['username'],
    'role'   => $isAdmin ? 'admin' : 'player',
    'avatar' => $u['avatar'] ?? null,
];
$token = chat_make_token($user + ['exp' => time() + CHAT_TOKEN_TTL]);

chat_json(200, ['token' => $token, 'user' => ['id' => $user['uid'], 'name' => $user['name'], 'role' => $user['role'], 'avatar' => $user['avatar']]]);
