<?php
// DDL Chat — shared settings for chat-login.php and chat-upload.php.
// Keep this file OUTSIDE the public web root if possible, or block direct access to it.

// Same value as CHAT_SECRET in server/.env (32+ random characters).
const CHAT_SECRET = 'CHANGE_ME_to_a_long_random_string';
const CHAT_TOKEN_TTL = 60 * 60 * 24 * 30; // app stays logged in for 30 days

// Database (the existing DDL database)
const CHAT_DB_DSN  = 'mysql:host=localhost;dbname=ddl;charset=utf8mb4';
const CHAT_DB_USER = 'ddl';
const CHAT_DB_PASS = '';

// Map these to the existing DDL users table.
const USERS_TABLE   = 'users';
const COL_ID        = 'id';
const COL_USERNAME  = 'username';
const COL_EMAIL     = 'email';
const COL_PASSWORD  = 'password';  // must hold password_hash() output
const COL_AVATAR    = null;        // e.g. 'avatar_url', or null
const COL_ROLE      = 'role';      // set to null to use ADMIN_IDS only
const ADMIN_ROLES   = ['admin', 'staff', 'moderator'];
const ADMIN_IDS     = [];          // extra admins by user id, e.g. [1, 2]

// Firebase: the service account key file of your Firebase project.
// Firebase console > Project settings > Service accounts > Generate new private key.
// Keep this file OUTSIDE the public web root and never upload it to GitHub: it is the master key of the project.
const FIREBASE_SERVICE_ACCOUNT = __DIR__ . '/../private/firebase-service-account.json';

// Pictures
const UPLOAD_DIR      = __DIR__ . '/../uploads/chat/';            // folder on disk, writable by PHP
const UPLOAD_BASE_URL = 'https://ddl-online.com/uploads/chat/';   // public URL of that folder (same as server/.env)
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const UPLOAD_MAX_SIDE  = 1280;

function chat_db(): PDO {
    static $pdo = null;
    if (!$pdo) {
        $pdo = new PDO(CHAT_DB_DSN, CHAT_DB_USER, CHAT_DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }
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
