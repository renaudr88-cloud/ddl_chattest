<?php
// Scolia League Rules (menu: Rules > Scolia League Rules, and Scolia > Scolia League Rules).
require_once 'session.php';
require_once 'db.php';   // footer.php: unread notifications
$isLoggedIn = isset($_SESSION['user_name']);   // for navbar.php

// The rules, section by section. Text in **…** is shown bold.
$sections = [
    ['Requirements', 'fa-list-check', [
        'A Scolia board (Scolia Home or Scolia Spark), set up and connected to the internet',
        'A Scolia account and the Scolia app',
        'Your board\'s serial number linked to your DDL account (menu: **Scolia → My Scolia Board**)',
        'Your Scolia username filled in on your DDL profile, exactly as it is in Scolia',
        '**The DDL Chat app for communication** (free on iPhone, Android and computer: <a href="download-app.php">download the app</a>)',
        'A stable internet connection; your board must stay online during the whole match',
        'Connection or power problems during a match are not considered a valid excuse',
        'All fixtures to be arranged directly with your opponent. All opponents can be contacted by sending them a private message in the DDL Chat app.',
    ]],
    ['Competition Format', 'fa-sitemap', [
        'Divisions by average: see your league page for your division and its players',
        'Round Robin format, play each opponent in the league once',
    ]],
    ['Points System', 'fa-trophy', [
        '3 points for a win',
        '0 points for a loss',
        'No draws',
    ]],
    ['Match Structure', 'fa-calendar-week', [
        '1 match per week, following the official schedule',
        'Divisions with an odd number of players will mean one player sits out each week',
        'Matches must follow calendar order',
        '**Plan every match in the League Match Planner.** Only planned matches are followed by our system and get their result saved automatically.',
        'Exceptions must be discussed with your division admin',
        'Players are responsible for contacting each other to arrange their match within the gameweek',
    ]],
    ['Results', 'fa-robot', [
        'Your result is saved automatically from your Scolia boards: legs, average, 100+, 140+, 180s and checkouts. No screenshots needed.',
        'Result not showing after your match (for example because a board went offline)? Contact your division admin. Do not replay the match.',
    ]],
    ['Game Rules', 'fa-bullseye', [
        '501 single-in, double-out',
        '**First to 5 legs**',
        'No draws: the first player to win 5 legs wins the match',
    ]],
    ['Important Rules', 'fa-triangle-exclamation', [
        'No re-throws on a bounce out',
        'Always check that Scolia registered your darts correctly before removing them',
        'Incorrect scores must be corrected immediately in the Scolia app, before the next throw',
    ]],
    ['Match Setup', 'fa-camera', [
        'Make sure your board is switched on and shows as ready on <a href="scolia-board.php">My Scolia Board</a> before the planned match time',
        'Keep the area around your board clear, so the Scolia cameras can see every dart',
        'Microphones off unless both agree otherwise',
    ]],
    ['Technical Issues', 'fa-wifi', [
        'Lost connection or board offline? Replay the current leg',
        'Repeated board or connection failures may result in match termination',
        'Always report issues to your division admin',
    ]],
    ['Scheduling & Forfeits', 'fa-clock', [
        'No-show without valid notice = forfeit',
        'Repeated absences may lead to league removal',
        'Falling 2 games behind = first game forfeited',
    ]],
];
$fmt = fn($t) => preg_replace('/\*\*(.+?)\*\*/', '<strong>$1</strong>', $t);   // rule texts are written above, not user input
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Scolia League Rules • Digital Darts League</title>
  <link rel="icon" type="image/png" href="images/favicon.png">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&family=Oswald:wght@500;600;700&display=swap" rel="stylesheet"/>
  <link href="master.css" rel="stylesheet"/>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <style>
    .sr-hero{background:linear-gradient(135deg,#0a1f44,#0f2c5c 60%,#0a1f44);color:#fff;text-align:center;padding:96px 20px 30px;border-bottom:3px solid #0a9a2e;position:relative;overflow:hidden}
    .sr-hero::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(115deg,rgba(255,255,255,.035) 0 2px,transparent 2px 22px);pointer-events:none}
    .sr-hero p{position:relative;font-family:Oswald,sans-serif;letter-spacing:4px;color:#3ccf5f;font-size:13px;text-transform:uppercase;margin:0}
    .sr-hero h1{position:relative;font-family:Oswald,sans-serif;font-size:38px;text-transform:uppercase;margin:4px 0 8px;color:#fff}
    .sr-hero span{position:relative;color:#c9d5ee;font:15px Poppins,sans-serif;display:block;max-width:560px;margin:0 auto}
    .sr-wrap{max-width:820px;margin:24px auto 60px;padding:0 14px;box-sizing:border-box;font-family:Poppins,sans-serif;color:#0a1f44}
    .sr-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .sr-card{background:#fff;border-radius:18px;box-shadow:0 6px 22px rgba(10,31,68,.09);padding:20px 22px;border-top:4px solid #0a9a2e}
    .sr-card.wide{grid-column:1/-1}
    .sr-card h2{display:flex;align-items:center;gap:10px;margin:0 0 10px;font-family:Oswald,sans-serif;text-transform:uppercase;letter-spacing:.5px;font-size:20px;color:#0a1f44}
    .sr-card h2 i{width:32px;height:32px;border-radius:9px;background:#e3f5e8;color:#0a9a2e;display:inline-flex;align-items:center;justify-content:center;font-size:15px}
    .sr-card ul{margin:0;padding-left:20px}
    .sr-card li{margin:6px 0;font-size:14.5px;line-height:1.5;color:#2b3550}
    .sr-card li::marker{color:#0a9a2e}
    .sr-card a{color:#0a9a2e !important;font-weight:600}
    .sr-end{margin:22px 0 0;text-align:center;font-weight:800;font-size:16px;color:#0a1f44}
    .sr-other{display:block;text-align:center;margin-top:10px;font-size:13.5px;color:#6b7385 !important}
    @media(max-width:700px){.sr-grid{grid-template-columns:1fr}.sr-hero h1{font-size:30px}}
  </style>
</head>
<body>
<?php include 'navbar.php'; ?>

<div class="sr-hero">
  <p>Digital Darts League · Scolia</p>
  <h1>Scolia League Rules</h1>
  <span>The rules for leagues played on Scolia boards. Results are saved automatically from your board.</span>
</div>

<div class="sr-wrap">
  <div class="sr-grid">
    <?php foreach ($sections as $i => [$title, $icon, $rules]): ?>
    <div class="sr-card<?= in_array($title, ['Requirements', 'Scheduling & Forfeits'], true) ? ' wide' : '' ?>">
      <h2><i class="fa-solid <?= $icon ?>"></i><?= htmlspecialchars($title) ?></h2>
      <ul>
        <?php foreach ($rules as $r): ?><li><?= $fmt($r) ?></li><?php endforeach; ?>
      </ul>
    </div>
    <?php endforeach; ?>
  </div>
  <p class="sr-end">Good luck to all players! Play fair and represent your division with pride.</p>
  <a class="sr-other" href="league.php">Playing on Dartsmind? See the 501 League Rules</a>
</div>

<?php include 'footer.php'; ?>
</body>
</html>
