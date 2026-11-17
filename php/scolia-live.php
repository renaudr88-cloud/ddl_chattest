<?php
// Live Scolia matches: the score as the darts land, for everyone (no login needed).
// scolia-live.php            -> the page (refreshes itself every 3 seconds)
// scolia-live.php?json=1     -> [{match, tournament, players: [{name, board}], leg, turn, left: [..], legs: [..], avg: [..], darts: [..]}]
require_once __DIR__ . '/scolia-api-lib.php';

if (isset($_GET['json'])) {
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    header('Access-Control-Allow-Origin: *');
    $live = scolia_bridge_get('/live', 3);
    if ($live === null) { echo '{"matches":[],"offline":true}'; exit; }
    // Only what a scoreboard needs (no board serials).
    $out = array_map(fn($m) => [
        'match' => $m['match'], 'tournament' => $m['tournament'] ?? null,
        'players' => array_map(fn($p) => ['name' => (string)($p['name'] ?? ''), 'board' => (string)($p['board'] ?? '')], $m['players'] ?? []),
        'leg' => $m['leg'] ?? 1, 'turn' => $m['turn'], 'left' => $m['left'] ?? [], 'legs' => $m['legs'] ?? [], 'avg' => $m['avg'] ?? [],
        'darts' => $m['darts'] ?? [],
    ], array_values(array_filter($live, fn($m) => !empty($m['started']))));
    echo json_encode(['matches' => $out], JSON_UNESCAPED_UNICODE);
    exit;
}
require_once 'session.php';
require_once 'db.php';   // footer.php: unread notifications
$isLoggedIn = isset($_SESSION['user_name']);   // for navbar.php
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Scolia Live • Digital Darts League</title>
  <link rel="icon" type="image/png" href="images/favicon.png">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&family=Oswald:wght@500;600;700&display=swap" rel="stylesheet"/>
  <link href="master.css" rel="stylesheet"/>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <style>
    .sl-hero{background:linear-gradient(135deg,#0a1f44,#0f2c5c 60%,#0a1f44);color:#fff;text-align:center;padding:96px 20px 28px;border-bottom:3px solid #0a9a2e}
    .sl-hero p{font-family:Oswald,sans-serif;letter-spacing:4px;color:#3ccf5f;font-size:13px;text-transform:uppercase;margin:0}
    .sl-hero h1{font-family:Oswald,sans-serif;font-size:38px;text-transform:uppercase;margin:4px 0 0;color:#fff}
    .sl-wrap{max-width:820px;margin:22px auto 60px;padding:0 14px;box-sizing:border-box;font-family:Poppins,sans-serif;color:#0a1f44;display:grid;gap:16px}
    .sl-card{background:#0a1f44;color:#fff;border-radius:18px;overflow:hidden;box-shadow:0 6px 22px rgba(10,31,68,.18)}
    .sl-top{display:flex;justify-content:space-between;padding:10px 16px;background:#0f2c5c;font-size:13px;color:#c9d5ee}
    .sl-live{color:#3ccf5f;font-weight:800;letter-spacing:1px}
    .sl-row{display:grid;grid-template-columns:22px 1fr auto auto;align-items:center;gap:12px;padding:12px 16px;border-top:1px solid rgba(255,255,255,.08)}
    .sl-row.on{background:rgba(10,154,46,.18)}
    .sl-turn{width:10px;height:10px;border-radius:50%;background:transparent}
    .sl-row.on .sl-turn{background:#3ccf5f;box-shadow:0 0 0 4px rgba(60,207,95,.25)}
    .sl-name{font-weight:700;font-size:17px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sl-name small{display:block;color:#9fb0d0;font-weight:600;font-size:12px}
    .sl-legs{font:700 22px Oswald,sans-serif;background:#ff7a00;border-radius:8px;min-width:34px;text-align:center;padding:2px 6px}
    .sl-left{font:700 36px Oswald,sans-serif;min-width:72px;text-align:right}
    .sl-darts{padding:8px 16px 12px;color:#c9d5ee;font-size:14px;min-height:20px}
    .sl-darts b{display:inline-block;background:#fff;color:#0a1f44;border-radius:6px;padding:1px 8px;margin-right:6px;font-weight:800}
    .sl-empty{text-align:center;color:#6b7488;padding:40px 10px;background:#fff;border-radius:18px}
  </style>
</head>
<body>
<?php include 'navbar.php'; ?>
<div class="sl-hero"><p>Scolia</p><h1>Live matches</h1></div>
<div class="sl-wrap" id="live"><div class="sl-empty">Loading…</div></div>
<script>
(function () {
  const box = document.getElementById('live');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function draw(d) {
    const list = d.matches || [];
    if (!list.length) { box.innerHTML = '<div class="sl-empty">No Scolia match is being played right now.<br>Matches show up here as soon as the first dart lands.</div>'; return; }
    box.innerHTML = list.map(m => `
      <div class="sl-card">
        <div class="sl-top"><span>Leg ${esc(m.leg)}</span><span class="sl-live">● LIVE</span></div>
        ${m.players.map((p, i) => `
          <div class="sl-row${m.turn === i ? ' on' : ''}">
            <span class="sl-turn"></span>
            <div class="sl-name">${esc(p.name)}<small>Avg ${esc((m.avg[i] ?? 0).toFixed ? m.avg[i].toFixed(2) : m.avg[i])}${p.board && p.board !== 'Ready' ? ' · board ' + esc(p.board) : ''}</small></div>
            <div class="sl-legs">${esc(m.legs[i] ?? 0)}</div>
            <div class="sl-left">${esc(m.left[i])}</div>
          </div>`).join('')}
        <div class="sl-darts">${(m.darts || []).map(x => '<b>' + esc(x) + '</b>').join('')}</div>
      </div>`).join('');
  }
  async function tick() {
    try { draw(await (await fetch('scolia-live.php?json=1', { cache: 'no-store' })).json()); } catch (e) {}
    setTimeout(tick, 3000);
  }
  tick();
})();
</script>
<?php include 'footer.php'; ?>
</body>
</html>
