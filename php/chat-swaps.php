<?php
// Members Swaps (member-swaps.php on ddl-online.com) in DDL Chat → Dartswap: one marketplace for site and chat.
// GET  /chat-swaps.php                          -> {"list": [{id, title, desc, swapFor, price, images[], user{id,name,avatar,dartsmind}, ts}]}
// POST /chat-swaps.php {"action":"add", title, desc, swapFor, price, images:["data:image/jpeg;base64,..."]}  -> {"ok":true,"id":..}
// POST /chat-swaps.php {"action":"remove", "id": 12}   -> owner or DDL admin takes the listing down (is_active = 0, like the site)
// Header: Authorization: Bearer <token from chat-login.php>. Same rules as add-swap.php: title + description,
// a price or a swap item, at least one picture (max 3). Pictures go to uploads/swaps/ like the website's.
require __DIR__ . '/chat-config.php';
chat_cors();
$me = chat_read_token(chat_bearer());
if (!$me) chat_json(401, ['error' => 'Log in again.']);
$uid = (int)$me['uid'];
$db = chat_db();

function swap_img_url($path) {
    $path = trim((string)$path);
    if ($path === '' || str_contains($path, '..') || !preg_match('~^[A-Za-z0-9_./-]+\.(jpe?g|png|webp|gif)$~i', $path)) return null;
    return rtrim(CHAT_SITE_URL, '/') . '/' . ltrim($path, '/');
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    try {
        $st = $db->query("
            SELECT s.id, s.user_id, s.title, s.description, s.swap_for, s.price, s.image_1, s.image_2, s.image_3, s.created_at,
                   p.name, p.dartsmind_username, p.photo, p.membership_status
            FROM member_swaps s JOIN players p ON p.id = s.user_id
            WHERE s.is_active = 1
            ORDER BY s.created_at DESC
            LIMIT 60");
        $rows = $st->fetchAll(PDO::FETCH_ASSOC);
    } catch (Throwable $e) {
        error_log('chat-swaps: ' . $e->getMessage());
        chat_json(200, ['list' => []]);
    }
    $list = [];
    foreach ($rows as $r) {
        if (in_array(strtolower((string)($r['membership_status'] ?? '')), BLOCKED_STATUSES, true)) continue;
        $name = trim((string)$r['dartsmind_username']) ?: trim((string)$r['name']);
        $list[] = [
            'id' => (int)$r['id'],
            'title' => (string)$r['title'],
            'desc' => (string)$r['description'],
            'swapFor' => trim((string)($r['swap_for'] ?? '')) ?: null,
            'price' => $r['price'] !== null && $r['price'] !== '' ? (string)$r['price'] : null,
            'images' => array_values(array_filter([swap_img_url($r['image_1']), swap_img_url($r['image_2']), swap_img_url($r['image_3'])])),
            'user' => [
                'id' => 'ddl-' . (int)$r['user_id'],
                'name' => mb_substr(trim((string)$r['name']) !== '' ? trim((string)$r['name']) : $name, 0, 30),
                'avatar' => chat_photo_url((string)($r['photo'] ?? '')),
                'dartsmind' => trim((string)$r['dartsmind_username']) ?: null,
            ],
            'ts' => strtotime((string)$r['created_at']) * 1000,
        ];
    }
    chat_json(200, ['list' => $list]);
}

$in = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($in)) chat_json(400, ['error' => 'Bad request.']);
$action = $in['action'] ?? '';

if ($action === 'remove') {
    $id = (int)($in['id'] ?? 0);
    $st = $db->prepare('SELECT is_admin FROM players WHERE id = ?');
    $st->execute([$uid]);
    $isAdmin = (int)$st->fetchColumn() === 1;
    $q = $db->prepare('UPDATE member_swaps SET is_active = 0 WHERE id = ?' . ($isAdmin ? '' : ' AND user_id = ?'));
    $q->execute($isAdmin ? [$id] : [$id, $uid]);
    if (!$q->rowCount()) chat_json(403, ['error' => 'You can only remove your own listing.']);
    chat_json(200, ['ok' => true]);
}

if ($action !== 'add') chat_json(400, ['error' => 'Bad request.']);

$title = trim((string)($in['title'] ?? ''));
$desc = trim((string)($in['desc'] ?? ''));
$swapFor = trim((string)($in['swapFor'] ?? ''));
$price = trim(str_replace(',', '.', (string)($in['price'] ?? '')));
$images = is_array($in['images'] ?? null) ? array_slice($in['images'], 0, 3) : [];

if ($title === '' || $desc === '') chat_json(400, ['error' => 'Add a title and a description.']);
if (mb_strlen($title) > 100 || mb_strlen($desc) > 1000 || mb_strlen($swapFor) > 150) chat_json(400, ['error' => 'Text too long.']);
if ($swapFor === '' && $price === '') chat_json(400, ['error' => 'Enter a price or what you want to swap it for.']);
if ($price !== '' && (!is_numeric($price) || (float)$price < 0 || (float)$price > 100000)) chat_json(400, ['error' => 'Enter a valid price.']);
if (!$images) chat_json(400, ['error' => 'Add at least one picture.']);

$dir = __DIR__ . '/uploads/swaps/';
if (!is_dir($dir) && !mkdir($dir, 0755, true)) chat_json(500, ['error' => 'Could not save the pictures.']);
$saved = [null, null, null];
foreach ($images as $i => $data) {
    if (!is_string($data) || !preg_match('~^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$~', $data, $m)) chat_json(400, ['error' => 'Picture ' . ($i + 1) . ' is not valid.']);
    $bin = base64_decode($m[2], true);
    if ($bin === false || strlen($bin) > 4 * 1024 * 1024 || @getimagesizefromstring($bin) === false) chat_json(400, ['error' => 'Picture ' . ($i + 1) . ' is not valid.']);
    $ext = $m[1] === 'jpeg' ? 'jpg' : $m[1];
    $name = uniqid("swap_{$uid}_") . '.' . $ext;
    if (file_put_contents($dir . $name, $bin) === false) chat_json(500, ['error' => 'Could not save the pictures.']);
    $saved[$i] = 'uploads/swaps/' . $name;
}

$st = $db->prepare('INSERT INTO member_swaps (user_id, title, description, swap_for, price, image_1, image_2, image_3, created_at, is_active)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1)');
$st->execute([$uid, $title, $desc, $swapFor ?: null, $price !== '' ? $price : null, $saved[0], $saved[1], $saved[2]]);
chat_json(200, ['ok' => true, 'id' => (int)$db->lastInsertId()]);
