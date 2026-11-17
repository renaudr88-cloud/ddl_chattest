<?php
// Scolia Leagues: coming soon. The DDL leagues are played on Dartsmind for now; this page is the place for the
// Scolia leagues once they start (menu: Scolia > Scolia Leagues).
require_once 'session.php';
require_once 'db.php';   // footer.php: unread notifications
$isLoggedIn = isset($_SESSION['user_name']);   // for navbar.php
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Scolia Leagues • Digital Darts League</title>
  <link rel="icon" type="image/png" href="images/favicon.png">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&family=Oswald:wght@500;600;700&display=swap" rel="stylesheet"/>
  <link href="master.css" rel="stylesheet"/>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <style>
    .sg-hero{background:linear-gradient(135deg,#0a1f44,#0f2c5c 60%,#0a1f44);color:#fff;text-align:center;padding:96px 20px 30px;border-bottom:3px solid #0a9a2e}
    .sg-hero p{font-family:Oswald,sans-serif;letter-spacing:4px;color:#3ccf5f;font-size:13px;text-transform:uppercase;margin:0}
    .sg-hero h1{font-family:Oswald,sans-serif;font-size:38px;text-transform:uppercase;margin:4px 0 6px;color:#fff}
    .sg-hero span{color:#c9d5ee;font:15px Poppins,sans-serif;display:block;max-width:560px;margin:0 auto}
    .sg-wrap{max-width:640px;margin:24px auto 60px;padding:0 14px;box-sizing:border-box;font-family:Poppins,sans-serif;color:#0a1f44}
    .sg-card{background:#fff;border-radius:18px;box-shadow:0 6px 22px rgba(10,31,68,.09);padding:22px;margin-bottom:18px}
    .sg-card h2{font-family:Oswald,sans-serif;text-transform:uppercase;font-size:20px;margin:0 0 10px}
    .sg-soon{display:inline-block;background:#0a9a2e;color:#fff;font:800 12px Poppins,sans-serif;letter-spacing:1.5px;padding:5px 12px;border-radius:999px;text-transform:uppercase;margin-bottom:10px}
    .sg-list{margin:0;padding-left:20px;line-height:1.8}
    .sg-btn{display:inline-block;background:#0a9a2e;color:#fff !important;font:800 16px Poppins,sans-serif;padding:13px 22px;border-radius:12px;text-decoration:none;margin:12px 8px 0 0}
    .sg-btn.sec{background:#0a1f44}
  </style>
</head>
<body>
<?php include 'navbar.php'; ?>
<div class="sg-hero">
  <p>Scolia</p>
  <h1>Scolia Leagues</h1>
  <span>Weekly league darts on your Scolia board, against the players in your group.</span>
</div>
<div class="sg-wrap">
  <div class="sg-card">
    <span class="sg-soon">Coming soon</span>
    <h2>The first Scolia season is on its way</h2>
    <ul class="sg-list">
      <li>One match a week against the players in your group</li>
      <li>Plan your matches with your opponent in the DDL Chat app</li>
      <li>Results and stats filled in automatically from your Scolia board</li>
      <li>Promotion and relegation, just like the DDL leagues</li>
    </ul>
    <a class="sg-btn" href="scolia-board.php">Link my Scolia board</a>
    <a class="sg-btn sec" href="league-explained.php">How DDL leagues work</a>
  </div>
</div>
<?php include 'footer.php'; ?>
</body>
</html>
