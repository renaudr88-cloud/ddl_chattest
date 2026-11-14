<?php
// POST /chat-login.php   JSON {"login": "email address", "password": "..."}
// -> 200 {"token": "...", "firebaseToken": "...", "user": {...}}  |  401/403 {"error": "..."}
// Same check as the website's login.php: players.email + password_verify, blocked statuses refused.
// The app signs in to Firebase with firebaseToken and keeps token for picture uploads (chat-upload.php).
require __DIR__ . '/chat-config.php';
chat_cors();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') chat_json(405, ['error' => 'Use POST.']);

$in = json_decode(file_get_contents('php://input'), true) ?: $_POST;
$login = trim((string)($in['login'] ?? ''));
$password = (string)($in['password'] ?? '');
if ($login === '' || $password === '') chat_json(400, ['error' => 'Enter your email address and your password.']);

// Basic brute-force brake: max 10 failed attempts per IP per 15 minutes (uses APCu when available).
$ipKey = 'chatlogin_' . ($_SERVER['REMOTE_ADDR'] ?? 'x');
if (function_exists('apcu_fetch') && (int)apcu_fetch($ipKey) >= 10) chat_json(429, ['error' => 'Too many attempts. Try again in 15 minutes.']);

$st = chat_db()->prepare('SELECT id, name, password_hash, is_admin, membership_status, photo FROM players WHERE email = ? LIMIT 1');
$st->execute([$login]);
$u = $st->fetch(PDO::FETCH_ASSOC);

if (!$u || !password_verify($password, (string)$u['password_hash'])) {
    if (function_exists('apcu_fetch')) { apcu_add($ipKey, 0, 900); apcu_inc($ipKey); }
    usleep(400000);
    chat_json(401, ['error' => 'Incorrect email or password.']);
}
if (in_array(strtolower((string)($u['membership_status'] ?? '')), BLOCKED_STATUSES, true)) {
    chat_json(403, ['error' => 'This account has been removed. If you believe this is a mistake, please contact an admin.']);
}
// Chat bans and mutes are kept in Firebase (sanctions/{uid}); the rules there block those players.

$user = [
    'uid'    => (string)$u['id'],
    'name'   => trim((string)$u['name']) !== '' ? mb_substr(trim((string)$u['name']), 0, 30) : 'Player ' . $u['id'],
    'role'   => (int)$u['is_admin'] === 1 ? 'admin' : 'player',
    'avatar' => chat_photo_url((string)($u['photo'] ?? '')),
];
$token = chat_make_token($user + ['exp' => time() + CHAT_TOKEN_TTL]);   // for picture uploads (chat-upload.php)

// Firebase sign-in for the chat itself. uid "ddl-<id>" is this player's id in Firebase.
try {
    $firebaseToken = firebase_custom_token('ddl-' . $user['uid'], array_filter(
        ['ddlName' => $user['name'], 'ddlRole' => $user['role'], 'ddlPhoto' => $user['avatar']],
        fn($v) => $v !== null));
} catch (Throwable $e) {
    error_log('chat-login: ' . $e->getMessage());
    chat_json(500, ['error' => 'The chat is not set up correctly yet. Try again later.']);
}

chat_json(200, [
    'token' => $token,
    'firebaseToken' => $firebaseToken,
    'user' => ['id' => 'ddl-' . $user['uid'], 'name' => $user['name'], 'role' => $user['role'], 'avatar' => $user['avatar']],
]);
