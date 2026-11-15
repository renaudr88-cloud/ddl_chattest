<?php
// Admins: League Match Planner — who plays when, who still has to answer, who called a match off (and why).
// Players plan their league matches in DDL Chat (chat-league.php); everything lands here.
require_once 'session.php';
require_once 'db.php';
require_once __DIR__ . '/league-schedule-lib.php';

if (empty($_SESSION['user_id']) || empty($_SESSION['is_admin']) || $_SESSION['is_admin'] != 1) {
    http_response_code(403);
    die('Access denied.');
}
ls_tables($pdo);

$tab = in_array($_GET['tab'] ?? '', ['upcoming', 'waiting', 'cancelled', 'all'], true) ? $_GET['tab'] : 'upcoming';
$leagueFilter = (int)($_GET['league'] ?? 0);
$now = time();

$where = ["s.status <> 'replaced'"];
$args = [];
if ($tab === 'upcoming') { $where[] = "s.status IN ('proposed','confirmed') AND s.play_ts >= ?"; $args[] = $now - 3 * 3600; }
if ($tab === 'waiting')  { $where[] = "s.status = 'proposed'"; }
if ($tab === 'cancelled'){ $where[] = "s.status = 'cancelled'"; }
if ($leagueFilter)       { $where[] = 'l.id = ?'; $args[] = $leagueFilter; }
$order = $tab === 'cancelled' || $tab === 'all' ? 's.updated_at DESC' : 's.play_ts ASC';
$plans = [];
try {
    $st = $pdo->prepare(LS_PLAN_SQL . ' WHERE ' . implode(' AND ', $where) . " ORDER BY $order LIMIT 300");
    $st->execute($args);
    $plans = array_map('ls_row', $st->fetchAll(PDO::FETCH_ASSOC));
} catch (Throwable $e) { error_log('league-schedule: ' . $e->getMessage()); }

// History per match (every proposed / confirmed / replaced / cancelled / reminded).
$history = [];
if ($plans) {
    $ids = array_values(array_unique(array_column($plans, 'fixture')));
    $in = implode(',', array_fill(0, count($ids), '?'));
    try {
        $h = $pdo->prepare("SELECT lg.*, p.dartsmind_username AS dm, p.name AS pname FROM league_schedule_log lg
            LEFT JOIN players p ON p.id = lg.by_player WHERE lg.fixture_id IN ($in) ORDER BY lg.id ASC");
        $h->execute($ids);
        foreach ($h->fetchAll(PDO::FETCH_ASSOC) as $r) $history[(int)$r['fixture_id']][] = $r;
    } catch (Throwable $e) { error_log('league-schedule log: ' . $e->getMessage()); }
}

$leagues = [];
try { $leagues = $pdo->query('SELECT DISTINCT l.id, l.name FROM league_match_schedule s JOIN league_group_matches m ON m.id = s.fixture_id
    JOIN league_groups g ON g.id = m.group_id JOIN leagues l ON l.id = g.league_id ORDER BY l.name')->fetchAll(PDO::FETCH_ASSOC); } catch (Throwable $e) {}

$uk = new DateTimeZone('Europe/London');
$fmt = function (int $ts) use ($uk) { $d = (new DateTime('@' . $ts))->setTimezone($uk); return [$d->format('D d/m'), $d->format('H:i')]; };
$ago = function (string $dt) { if (!$dt) return ''; $s = time() - strtotime($dt); return $s < 3600 ? max(1, intdiv($s, 60)) . ' min ago' : ($s < 86400 ? intdiv($s, 3600) . 'h ago' : date('d/m H:i', strtotime($dt))); };
$label = ['proposed' => ['Waiting', 'wait'], 'confirmed' => ['Confirmed', 'ok'], 'cancelled' => ['Called off', 'no'], 'replaced' => ['Replaced', 'wait']];
$actionTxt = ['proposed' => 'suggested', 'confirmed' => 'accepted', 'replaced' => 'replaced by a new time', 'cancelled' => 'called off', 'reminded' => 'reminder sent'];
$q = fn($t) => '?' . http_build_query(array_filter(['tab' => $t, 'league' => $leagueFilter ?: null]));
$isLoggedIn = true;
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>League Match Planner • Digital Darts League</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&family=Oswald:wght@500;600;700&display=swap" rel="stylesheet"/>
  <link href="master.css" rel="stylesheet"/>
  <style>
    .lp-hero{background:linear-gradient(135deg,#0a1f44,#0f2c5c 60%,#0a1f44);color:#fff;text-align:center;padding:90px 20px 30px;border-bottom:3px solid #ff7a00}
    .lp-hero p{font-family:Oswald,sans-serif;letter-spacing:4px;color:#ff7a00;font-size:13px;text-transform:uppercase;margin:0}
    .lp-hero h1{font-family:Oswald,sans-serif;font-size:38px;text-transform:uppercase;margin:6px 0 4px;color:#fff}
    .lp-hero span{color:#c9d5ee;font-size:14px}
    .lp-wrap{max-width:1000px;margin:22px auto 60px;padding:0 14px;font-family:Poppins,sans-serif}
    .lp-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px}
    .lp-tab{padding:8px 15px;border-radius:999px;background:#eef2fa;color:#0a1f44 !important;font-weight:800;font-size:13px;text-decoration:none}
    .lp-tab.on{background:#0a1f44;color:#fff !important}
    .lp-bar select{margin-left:auto;padding:7px 10px;border-radius:9px;border:1px solid #dfe4ee;font-family:inherit}
    .lp-card{background:#fff;border-radius:16px;box-shadow:0 6px 20px rgba(10,31,68,.08);overflow:hidden}
    .lp-row{display:grid;grid-template-columns:110px minmax(0,1fr) minmax(0,1.1fr);gap:14px;padding:13px 16px;border-bottom:1px solid #f0f2f6;font-size:14px}
    .lp-row.head{font-size:11px;font-weight:800;letter-spacing:1px;color:#8a93a6;text-transform:uppercase;padding:10px 16px}
    .lp-when b{display:block;color:#0a1f44}.lp-when small{color:#8a93a6}
    .lp-match b{color:#0a1f44}.lp-match small{display:block;color:#8a93a6;font-size:12px}
    .chip{display:inline-block;font-size:11.5px;font-weight:800;padding:3px 10px;border-radius:999px}
    .ok{background:#e6f6ec;color:#12803f}.wait{background:#fff3e0;color:#c25a00}.no{background:#fdeaea;color:#c9353b}
    .lp-st small{display:block;color:#6b7488;font-size:12px;margin-top:3px}
    .lp-st details{margin-top:4px;font-size:12px;color:#6b7488}
    .lp-st summary{cursor:pointer;color:#0a1f44;font-weight:700}
    .lp-empty{padding:30px;text-align:center;color:#8a93a6}
    .lp-local{color:#ff7a00;font-weight:700}
    @media(max-width:640px){.lp-row{grid-template-columns:1fr}.lp-row.head{display:none}}
  </style>
</head>
<body>
<?php include 'navbar.php'; ?>
<div class="lp-hero"><p>Digital Darts League · Admin</p><h1>League Match Planner</h1><span>Planned in DDL Chat by the players. Times in UK time.</span></div>
<div class="lp-wrap">
  <div class="lp-bar">
    <?php foreach (['upcoming' => 'Upcoming', 'waiting' => 'Waiting', 'cancelled' => 'Called off', 'all' => 'All'] as $k => $t): ?>
      <a class="lp-tab <?= $tab === $k ? 'on' : '' ?>" href="<?= htmlspecialchars($q($k)) ?>"><?= $t ?></a>
    <?php endforeach; ?>
    <select onchange="location.href='?tab=<?= $tab ?>&league='+this.value">
      <option value="0">All leagues</option>
      <?php foreach ($leagues as $l): ?><option value="<?= (int)$l['id'] ?>" <?= $leagueFilter === (int)$l['id'] ? 'selected' : '' ?>><?= htmlspecialchars($l['name']) ?></option><?php endforeach; ?>
    </select>
  </div>
  <div class="lp-card">
    <div class="lp-row head"><div>When (UK)</div><div>Match</div><div>Status</div></div>
    <?php if (!$plans): ?><div class="lp-empty">Nothing here yet. Players plan their league matches in DDL Chat: 📅 in a private chat, or click the opponent's name on the league page → Message in DDL Chat.</div><?php endif; ?>
    <?php foreach ($plans as $p): [$d, $t] = $fmt($p['at']); [$lab, $cls] = $label[$p['status']] ?? [$p['status'], 'wait']; ?>
      <div class="lp-row">
        <div class="lp-when"><b><?= $d ?></b><small><?= $t ?></small></div>
        <div class="lp-match"><b><?= htmlspecialchars($p['by']['name']) ?> vs <?= htmlspecialchars($p['opponent']['name']) ?></b>
          <small><?= htmlspecialchars($p['league']) ?><?= $p['group'] !== '' ? ' · Group ' . htmlspecialchars($p['group']) : '' ?> · Week <?= (int)$p['week'] ?></small></div>
        <div class="lp-st"><span class="chip <?= $cls ?>"><?= $lab ?></span>
          <?php if ($p['status'] === 'proposed'): ?><small>proposed by <?= htmlspecialchars($p['by']['name']) ?> · <?= $ago($p['created']) ?> · waiting for <?= htmlspecialchars($p['opponent']['name']) ?></small>
          <?php elseif ($p['status'] === 'confirmed'): ?><small>proposed by <?= htmlspecialchars($p['by']['name']) ?> · accepted by <?= htmlspecialchars($p['opponent']['name']) ?></small>
          <?php elseif ($p['status'] === 'cancelled'): ?><small>by <b><?= htmlspecialchars($p['cancelledBy']['name'] ?? '?') ?></b><?= $p['reason'] !== '' ? ' · "' . htmlspecialchars($p['reason']) . '"' : ' · no reason given' ?> · <?= $ago($p['cancelled']) ?></small><?php endif; ?>
          <?php if (!empty($history[$p['fixture']])): ?>
            <details><summary>History (<?= count($history[$p['fixture']]) ?>)</summary>
              <?php foreach ($history[$p['fixture']] as $h): ?>
                <div><?= date('d/m H:i', strtotime($h['at'])) ?> · <?= htmlspecialchars(ls_name($h['dm'], $h['pname'], (int)$h['by_player']) === 'Player 0' ? 'DDL' : ls_name($h['dm'], $h['pname'], (int)$h['by_player'])) ?>
                  <?= $actionTxt[$h['action']] ?? htmlspecialchars($h['action']) ?><?= $h['detail'] !== '' && !in_array($h['action'], ['proposed', 'replaced'], true) ? ': ' . htmlspecialchars($h['detail']) : '' ?></div>
              <?php endforeach; ?>
            </details>
          <?php endif; ?>
        </div>
      </div>
    <?php endforeach; ?>
  </div>
</div>
</body>
</html>
