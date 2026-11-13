<?php
// DDL Chat — shared settings for chat-login.php and chat-upload.php.
// Put the three chat-*.php files in the same folder as the site's index.php and db.php.

// A long random string (32+ characters) that signs the picture-upload token. Make one with:  openssl rand -base64 48
const CHAT_SECRET = 'CHANGE_ME_to_a_long_random_string';
const CHAT_TOKEN_TTL = 60 * 60 * 24 * 30; // app stays logged in for 30 days

// Database: the site's own db.php (same folder) gives $pdo, so no database password is needed here.
// Players log in like on the website: players.email + players.password_hash (password_hash / password_verify),
// admins have players.is_admin = 1, and these membership statuses may not log in:
const BLOCKED_STATUSES = ['removed', 'banned', 'blocked', 'deleted'];

// Firebase: the service account key file of your Firebase project.
// Firebase console > Project settings > Service accounts > Generate new private key.
// Keep this file OUTSIDE the public web root and never upload it to GitHub: it is the master key of the project.
const FIREBASE_SERVICE_ACCOUNT = __DIR__ . '/../private/firebase-service-account.json';

// Pictures
const UPLOAD_DIR      = __DIR__ . '/uploads/chat/';               // folder on disk, writable by PHP (made automatically)
const UPLOAD_BASE_URL = 'https://ddl-online.com/uploads/chat/';   // public URL of that folder (also in firebase/firestore.rules)
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const UPLOAD_MAX_SIDE  = 1280;

function chat_db(): PDO {
    global $pdo;
    if (!isset($pdo) || !($pdo instanceof PDO)) require_once __DIR__ . '/db.php';
    return $pdo;
}

function chat_json(int $status, array $data): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function b64url(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function b64url_decode(string $s): string { return base64_decode(strtr($s, '-_', '+/')); }

// Token = base64url(json) . "." . base64url(HMAC-SHA256(base64url(json))) — verified by server.js
function chat_make_token(array $payload): string {
    $body = b64url(json_encode($payload, JSON_UNESCAPED_UNICODE));
    return $body . '.' . b64url(hash_hmac('sha256', $body, CHAT_SECRET, true));
}

function chat_read_token(?string $token): ?array {
    if (!$token || substr_count($token, '.') !== 1) return null;
    [$body, $sig] = explode('.', $token);
    if (!hash_equals(b64url(hash_hmac('sha256', $body, CHAT_SECRET, true)), $sig)) return null;
    $p = json_decode(b64url_decode($body), true);
    if (!is_array($p) || empty($p['uid']) || ($p['exp'] ?? 0) < time()) return null;
    return $p;
}

function chat_bearer(): ?string {
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!$h && function_exists('getallheaders')) { $all = getallheaders(); $h = $all['Authorization'] ?? $all['authorization'] ?? ''; }
    return preg_match('/^Bearer\s+(\S+)$/i', $h, $m) ? $m[1] : null;
}

// Firebase custom token (RS256 JWT signed with the service account key). The app signs in with it;
// the claims ddlName and ddlRole are what firebase/firestore.rules check.
function firebase_custom_token(string $uid, array $claims): string {
    $sa = json_decode((string)@file_get_contents(FIREBASE_SERVICE_ACCOUNT), true);
    if (!$sa || empty($sa['private_key']) || empty($sa['client_email'])) {
        throw new RuntimeException('Firebase service account file missing or invalid');
    }
    $now = time();
    $header = b64url(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
    $payload = b64url(json_encode([
        'iss' => $sa['client_email'],
        'sub' => $sa['client_email'],
        'aud' => 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
        'iat' => $now,
        'exp' => $now + 3600,
        'uid' => $uid,
        'claims' => $claims,
    ], JSON_UNESCAPED_UNICODE));
    $key = openssl_pkey_get_private($sa['private_key']);
    if (!$key || !openssl_sign($header . '.' . $payload, $sig, $key, OPENSSL_ALGO_SHA256)) {
        throw new RuntimeException('Could not sign the Firebase token');
    }
    return $header . '.' . $payload . '.' . b64url($sig);
}
