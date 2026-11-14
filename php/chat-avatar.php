<?php
// Small square profile photo for DDL Chat. The website's photos are often several MB; the chat shows
// dozens of them at once, so it asks for this resized copy instead (made once with GD, kept in images/chat-avatars/).
// GET /chat-avatar.php?f=images/player-photos/player_12_abc.jpg&s=96   (s: 64, 96 or 200)
// Only files under images/ or uploads/ of the website. Read only: the original is never changed.
$f = ltrim((string)($_GET['f'] ?? ''), '/');
$s = (int)($_GET['s'] ?? 96);
$s = in_array($s, [64, 96, 200], true) ? $s : 96;

$base = realpath(__DIR__);
$src = realpath(__DIR__ . '/' . $f);
$ok = $src && is_file($src) && preg_match('~\.(jpe?g|png|webp|gif)$~i', $src)
    && (strpos($src, $base . '/images/') === 0 || strpos($src, $base . '/uploads/') === 0);
if (!$ok) { http_response_code(404); exit; }

$dir = $base . '/images/chat-avatars';
$out = $dir . '/' . substr(sha1($f), 0, 16) . '_' . $s . '_' . filemtime($src) . '.jpg';

if (!is_file($out) && function_exists('imagecreatetruecolor')) {
    $info = @getimagesize($src);
    $img = null;
    if ($info) {
        switch ($info[2]) {
            case IMAGETYPE_JPEG: $img = @imagecreatefromjpeg($src); break;
            case IMAGETYPE_PNG:  $img = @imagecreatefrompng($src);  break;
            case IMAGETYPE_GIF:  $img = @imagecreatefromgif($src);  break;
            case IMAGETYPE_WEBP: $img = function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($src) : null; break;
        }
    }
    if ($img) {
        if (($info[2] ?? 0) === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
            $o = (int)(@exif_read_data($src)['Orientation'] ?? 1);
            if ($o === 3) $img = imagerotate($img, 180, 0);
            elseif ($o === 6) $img = imagerotate($img, -90, 0);
            elseif ($o === 8) $img = imagerotate($img, 90, 0);
        }
        $w = imagesx($img); $h = imagesy($img); $side = min($w, $h);
        $dst = imagecreatetruecolor($s, $s);
        imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));
        imagecopyresampled($dst, $img, 0, 0, (int)(($w - $side) / 2), (int)(($h - $side) / 2), $s, $s, $side, $side);
        if (!is_dir($dir)) @mkdir($dir, 0755, true);
        @imagejpeg($dst, $out, 82);
        imagedestroy($dst); imagedestroy($img);
    }
}

header('Access-Control-Allow-Origin: *');
if (is_file($out)) {
    header('Content-Type: image/jpeg');
    header('Cache-Control: public, max-age=2592000');
    readfile($out);
} else {
    header('Location: ' . rtrim(dirname($_SERVER['SCRIPT_NAME']), '/') . '/' . $f);
}
