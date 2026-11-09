<?php
// POST /chat-upload.php   multipart field "image", header "Authorization: Bearer <token>"
// -> 200 {"url": "https://ddl-online.com/uploads/chat/<random>.jpg"}
// Re-encodes every picture with GD (strips EXIF/GPS and anything hidden in the file) and shrinks it.
require __DIR__ . '/chat-config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') chat_json(405, ['error' => 'Use POST.']);
$me = chat_read_token(chat_bearer());
if (!$me) chat_json(401, ['error' => 'Log in again.']);

$s = chat_db()->prepare('SELECT muted_until, kicked_until, banned FROM chat_sanctions WHERE user_id = ?');
$s->execute([(string)$me['uid']]);
if ($row = $s->fetch()) {
    $t = (int)round(microtime(true) * 1000);
    if ($row['banned'] || $row['kicked_until'] > $t || $row['muted_until'] > $t) chat_json(403, ['error' => 'You cannot post pictures right now.']);
}

$f = $_FILES['image'] ?? null;
if (!$f || $f['error'] !== UPLOAD_ERR_OK) chat_json(400, ['error' => 'No picture received.']);
if ($f['size'] > UPLOAD_MAX_BYTES) chat_json(413, ['error' => 'That picture is too big (max 10 MB).']);

$info = @getimagesize($f['tmp_name']);
$types = [IMAGETYPE_JPEG => 'imagecreatefromjpeg', IMAGETYPE_PNG => 'imagecreatefrompng', IMAGETYPE_WEBP => 'imagecreatefromwebp', IMAGETYPE_GIF => 'imagecreatefromgif'];
if (!$info || !isset($types[$info[2]])) chat_json(415, ['error' => 'Use a JPG, PNG, WebP or GIF picture.']);
if ($info[0] * $info[1] > 40_000_000) chat_json(413, ['error' => 'That picture is too large.']);

$src = @$types[$info[2]]($f['tmp_name']);
if (!$src) chat_json(415, ['error' => 'Could not read that picture.']);

// Respect phone camera orientation.
if ($info[2] === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
    $o = @exif_read_data($f['tmp_name'])['Orientation'] ?? 1;
    if ($o == 3) $src = imagerotate($src, 180, 0);
    if ($o == 6) $src = imagerotate($src, -90, 0);
    if ($o == 8) $src = imagerotate($src, 90, 0);
}

$w = imagesx($src); $h = imagesy($src);
$scale = min(1, UPLOAD_MAX_SIDE / max($w, $h));
$nw = (int)round($w * $scale); $nh = (int)round($h * $scale);
$dst = imagecreatetruecolor($nw, $nh);
imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255)); // flatten transparency
imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);

if (!is_dir(UPLOAD_DIR)) mkdir(UPLOAD_DIR, 0755, true);
$name = date('Ym') . '-' . bin2hex(random_bytes(12)) . '.jpg';
if (!imagejpeg($dst, UPLOAD_DIR . $name, 80)) chat_json(500, ['error' => 'Could not save the picture.']);

chat_json(200, ['url' => UPLOAD_BASE_URL . $name, 'width' => $nw, 'height' => $nh]);
