<?php
// A small, fast version of a Members Swaps photo for DDL Chat → Dartswap.
// GET /chat-swap-img.php?f=uploads/swaps/swap_12_abc.jpg&w=640   (w: 320, 640 or 1280)
// The website's originals are often several MB; this sends a resized JPEG (made once with GD and kept in
// uploads/swaps/small/). Read only: the original is never changed. No GD or an odd file: the original is sent.
$f = (string)($_GET['f'] ?? '');
$w = (int)($_GET['w'] ?? 640);
$w = in_array($w, [320, 640, 1280], true) ? $w : 640;

$root = realpath(__DIR__ . '/uploads/swaps');
$src = $root ? realpath(__DIR__ . '/' . ltrim($f, '/')) : false;
if (!$src || strpos($src, $root . DIRECTORY_SEPARATOR) !== 0 || !is_file($src)
    || !preg_match('~\.(jpe?g|png|webp|gif)$~i', $src)) {
    http_response_code(404);
    exit;
}

$dir = $root . '/small';
$out = $dir . '/' . pathinfo($src, PATHINFO_FILENAME) . '_' . $w . '_' . filemtime($src) . '.jpg';

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
        // Phone photos: turn them the right way up (EXIF orientation).
        if (($info[2] ?? 0) === IMAGETYPE_JPEG && function_exists('exif_read_data')) {
            $o = (int)(@exif_read_data($src)['Orientation'] ?? 1);
            if ($o === 3) $img = imagerotate($img, 180, 0);
            elseif ($o === 6) $img = imagerotate($img, -90, 0);
            elseif ($o === 8) $img = imagerotate($img, 90, 0);
        }
        $iw = imagesx($img); $ih = imagesy($img);
        $scale = min(1, $w / max($iw, $ih));
        $nw = max(1, (int)round($iw * $scale)); $nh = max(1, (int)round($ih * $scale));
        $dst = imagecreatetruecolor($nw, $nh);
        imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));
        imagecopyresampled($dst, $img, 0, 0, 0, 0, $nw, $nh, $iw, $ih);
        if (!is_dir($dir)) @mkdir($dir, 0755, true);
        @imagejpeg($dst, $out, 80);
        imagedestroy($dst); imagedestroy($img);
    }
}

header('Access-Control-Allow-Origin: *');
if (is_file($out)) {
    header('Content-Type: image/jpeg');
    header('Cache-Control: public, max-age=2592000');   // keep it for 30 days
    readfile($out);
} else {
    header('Location: ' . rtrim(dirname($_SERVER['SCRIPT_NAME']), '/') . '/' . ltrim($f, '/'));
}
