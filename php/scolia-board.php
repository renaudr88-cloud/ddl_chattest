<?php
// "My Scolia board": a player links the serial number of their Scolia board to their DDL account.
// In a DDL Scolia match the DDL Scolia bridge then follows both boards and fills in the result and stats by itself.
// "Check my board" asks the bridge whether the board is online and calibrated.
require_once 'session.php';
require_once 'db.php';
require_login();
$isLoggedIn = true;   // for navbar.php
require_once __DIR__ . '/scolia-api-lib.php';

$uid = (int)($_SESSION['user_id'] ?? 0);
if (empty($_SESSION['scolia_board_token'])) $_SESSION['scolia_board_token'] = bin2hex(random_bytes(16));
$token = $_SESSION['scolia_board_token'];
$msg = ''; $bad = false; $check = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST' && hash_equals($token, (string)($_POST['token'] ?? ''))) {
    $action = (string)($_POST['action'] ?? '');
    if ($action === 'save') {
        $serial = scolia_serial_clean($_POST['serial'] ?? '');
        if ($serial === '') { $msg = 'That is not a valid serial number (letters, digits and dashes).'; $bad = true; }
        elseif (($e = scolia_serial_save($pdo, $uid, $serial)) !== '') { $msg = $e; $bad = true; }
        else { $msg = 'Board saved. Checking it now…'; $check = scolia_bridge_get('/check?serial=' . urlencode($serial)); }
    } elseif ($action === 'remove') {
        scolia_serial_save($pdo, $uid, '');
        $msg = 'Board removed from your DDL account.';
    } elseif ($action === 'check') {
        $s = scolia_serial_of($pdo, $uid);
        if ($s !== '') $check = scolia_bridge_get('/check?serial=' . urlencode($s));
    }
}
$serial = scolia_serial_of($pdo, $uid);
[$ready, $words] = $check !== null || ($_POST['action'] ?? '') === 'check' || ($_POST['action'] ?? '') === 'save' ? scolia_board_words($check) : [null, ''];
$h = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES);
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>My Scolia board • Digital Darts League</title>
  <link rel="icon" type="image/png" href="images/favicon.png">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&family=Oswald:wght@500;600;700&display=swap" rel="stylesheet"/>
  <link href="master.css" rel="stylesheet"/>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <style>
    .sb-hero{background:linear-gradient(135deg,#0a1f44,#0f2c5c 60%,#0a1f44);color:#fff;text-align:center;padding:96px 20px 30px;border-bottom:3px solid #0a9a2e}
    .sb-hero p{font-family:Oswald,sans-serif;letter-spacing:4px;color:#3ccf5f;font-size:13px;text-transform:uppercase;margin:0}
    .sb-hero h1{font-family:Oswald,sans-serif;font-size:38px;text-transform:uppercase;margin:4px 0 6px;color:#fff}
    .sb-hero span{color:#c9d5ee;font:15px Poppins,sans-serif;display:block;max-width:560px;margin:0 auto}
    .sb-wrap{max-width:640px;margin:24px auto 60px;padding:0 14px;box-sizing:border-box;font-family:Poppins,sans-serif;color:#0a1f44}
    .sb-card{background:#fff;border-radius:18px;box-shadow:0 6px 22px rgba(10,31,68,.09);padding:22px;margin-bottom:18px}
    .sb-card h2{font-family:Oswald,sans-serif;text-transform:uppercase;font-size:20px;margin:0 0 10px}
    .sb-in{width:100%;box-sizing:border-box;font:600 18px Poppins,sans-serif;padding:13px 14px;border:2px solid #dfe4ee;border-radius:12px;letter-spacing:1px;text-transform:uppercase}
    .sb-btn{border:0;background:#0a9a2e;color:#fff;font:800 16px Poppins,sans-serif;padding:13px 22px;border-radius:12px;cursor:pointer;margin-top:12px}
    .sb-btn.sec{background:#0a1f44}
    .sb-btn.del{background:none;color:#c0392b;padding:13px 6px}
    .sb-msg{border-radius:12px;padding:12px 14px;font-weight:700;margin-bottom:14px;background:#e6f6ec;color:#12803f}
    .sb-msg.bad{background:#fdecea;color:#b3261e}
    .sb-state{display:flex;align-items:center;gap:12px;font-size:17px;font-weight:700;margin:6px 0 4px}
    .sb-dot{width:14px;height:14px;border-radius:50%;background:#c0392b;flex:none}
    .sb-dot.ok{background:#12a150}
    .sb-serial{font:700 22px Oswald,sans-serif;letter-spacing:2px}
    .sb-small{color:#6b7488;font-size:13.5px;margin:8px 0 0}
    .sb-steps{margin:0;padding-left:20px;line-height:1.7}
  </style>
</head>
<body>
<?php include 'navbar.php'; ?>
<div class="sb-hero">
  <p>Scolia</p>
  <h1>My Scolia board</h1>
  <span>Link your board once. In DDL Scolia matches your result and stats are then filled in automatically.</span>
</div>
<div class="sb-wrap">
  <?php if ($msg !== ''): ?><div class="sb-msg<?= $bad ? ' bad' : '' ?>"><?= $h($msg) ?></div><?php endif; ?>

  <div class="sb-card">
    <?php if ($serial === ''): ?>
      <h2>Link your board</h2>
      <form method="post">
        <input type="hidden" name="token" value="<?= $h($token) ?>"><input type="hidden" name="action" value="save">
        <label for="serial" style="font-weight:700">Serial number of your Scolia board</label>
        <input class="sb-in" id="serial" name="serial" maxlength="40" autocomplete="off" placeholder="e.g. ABC123-XYZ" required>
        <button class="sb-btn">Save my board</button>
      </form>
      <p class="sb-small">You find the serial number in the Scolia app with your board, or on the label of your Scolia device.</p>
    <?php else: ?>
      <h2>Your board</h2>
      <div class="sb-serial"><?= $h($serial) ?></div>
      <?php if ($ready !== null): ?>
        <div class="sb-state"><span class="sb-dot<?= $ready ? ' ok' : '' ?>"></span><?= $h($words) ?></div>
      <?php endif; ?>
      <form method="post" style="display:inline">
        <input type="hidden" name="token" value="<?= $h($token) ?>"><input type="hidden" name="action" value="check">
        <button class="sb-btn">Check my board</button>
      </form>
      <form method="post" style="display:inline" onsubmit="return confirm('Remove this board from your DDL account?')">
        <input type="hidden" name="token" value="<?= $h($token) ?>"><input type="hidden" name="action" value="remove">
        <button class="sb-btn del">Remove</button>
      </form>
    <?php endif; ?>
  </div>

  <div class="sb-card">
    <h2>How it works</h2>
    <ol class="sb-steps">
      <li>Play your DDL Scolia match in the Scolia app as always.</li>
      <li>DDL follows the darts on both boards and keeps the score.</li>
      <li>When the match is over, the result and stats go on the bracket by themselves. No screenshot needed.</li>
      <li>Both players need a linked board. If not, enter the result the normal way.</li>
    </ol>
    <p class="sb-small"><a href="scolia-live.php">Watch Scolia matches live →</a></p>
  </div>
</div>
</body>
</html>
