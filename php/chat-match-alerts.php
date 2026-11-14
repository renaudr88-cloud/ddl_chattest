<?php
// DDL Chat: a phone notification "Your match is ready" as soon as a player's opponent is known
// (brackets drawn, or the next round filled in). Tapping it opens the private chat with the opponent.
//
// No cron job needed: chat-matches.php (asked by every open chat every few minutes) runs this at most
// once a minute. It can also run on its own:  php chat-match-alerts.php
// Each player gets one notification per match (table chat_match_alerts, made here).
// Only to the chat's own devices (chat_push_endpoints), like chat-push-send.php.

function chat_match_alerts(PDO $db): int {
    // At most once a minute, and never twice at the same time.
    $lock = sys_get_temp_dir() . '/ddl-chat-match-alerts.lock';
    $fh = @fopen($lock, 'c');
    if (!$fh || !flock($fh, LOCK_EX | LOCK_NB)) return 0;
    $last = (int)@file_get_contents($lock . '.time');
    if (time() - $last < 60) { flock($fh, LOCK_UN); return 0; }
    @file_put_contents($lock . '.time', (string)time());

    $sent = 0;
    try {
        $db->exec("CREATE TABLE IF NOT EXISTS chat_match_alerts (
            match_id INT NOT NULL, player_id INT NOT NULL, sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (match_id, player_id))");
        $db->exec("CREATE TABLE IF NOT EXISTS chat_push_endpoints (
            endpoint_hash CHAR(40) NOT NULL PRIMARY KEY, endpoint TEXT NOT NULL, user_id INT NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY user_id (user_id))");

        // Open matches with both players known, in tournaments of yesterday, today or tomorrow,
        // where at least one of the two players has not had the notification yet.
        $rows = null;
        foreach (['t.platform AS platform,', ''] as $extra) {
            try {
                $st = $db->query("
                    SELECT m.id, m.round, $extra t.name AS tournament,
                           m.player1_id AS a, m.player2_id AS b,
                           pa.name AS an, pa.dartsmind_username AS ad, pb.name AS bn, pb.dartsmind_username AS bd
                    FROM matches m
                    JOIN tournaments t ON t.id = m.tournament_id
                    JOIN players pa ON pa.id = m.player1_id
                    JOIN players pb ON pb.id = m.player2_id
                    WHERE m.winner_id IS NULL
                      AND t.completed_at IS NULL AND t.archived_at IS NULL
                      AND t.start_date BETWEEN CURDATE() - INTERVAL 1 DAY AND CURDATE() + INTERVAL 1 DAY
                      AND (NOT EXISTS (SELECT 1 FROM chat_match_alerts x WHERE x.match_id = m.id AND x.player_id = m.player1_id)
                        OR NOT EXISTS (SELECT 1 FROM chat_match_alerts x WHERE x.match_id = m.id AND x.player_id = m.player2_id))
                    ORDER BY m.id ASC
                    LIMIT 150");
                $rows = $st->fetchAll(PDO::FETCH_ASSOC);
                break;
            } catch (Throwable $e) {
                if ($extra === '') throw $e;
            }
        }
        if (!$rows) { flock($fh, LOCK_UN); return 0; }

        $claim = $db->prepare('INSERT IGNORE INTO chat_match_alerts (match_id, player_id) VALUES (?, ?)');
        $subsQ = $db->prepare('SELECT ps.endpoint, ps.p256dh, ps.auth FROM chat_push_endpoints ce
            JOIN push_subscriptions ps ON ps.endpoint = ce.endpoint WHERE ce.user_id = ?');
        $isBye = fn($name, $dm) => stripos((string)$name, 'bye') === 0 || stripos((string)$dm, 'bye') !== false;

        $queue = [];   // [subscription row, payload]
        foreach ($rows as $r) {
            $bye = $isBye($r['an'], $r['ad']) || $isBye($r['bn'], $r['bd']);
            foreach ([[$r['a'], $r['b'], $r['bn'], $r['bd']], [$r['b'], $r['a'], $r['an'], $r['ad']]] as [$me, $opp, $oppName, $oppDm]) {
                $claim->execute([(int)$r['id'], (int)$me]);
                if ($claim->rowCount() === 0 || $bye) continue;   // already told, or a bye (nothing to play)
                $platform = ($r['platform'] ?? '') === 'scolia' ? 'scolia' : 'dartsmind';
                $name = trim((string)$oppName) ?: (trim((string)$oppDm) ?: 'your opponent');
                $payload = [
                    'title' => '🎯 Your match is ready',
                    'body' => mb_substr(trim((string)$r['tournament']), 0, 60) . ($r['round'] ? ' · Round ' . (int)$r['round'] : '') . ': vs ' . mb_substr($name, 0, 30),
                    'url' => '/?dm=' . (int)$opp . '&p=' . $platform,
                    'tag' => 'match-' . (int)$r['id'],
                ];
                $subsQ->execute([(int)$me]);
                foreach ($subsQ->fetchAll(PDO::FETCH_ASSOC) as $s) $queue[] = [$s, $payload];
            }
        }
        if (!$queue) { flock($fh, LOCK_UN); return 0; }

        if (!is_file(__DIR__ . '/push-config.php') || !is_file(__DIR__ . '/vendor/autoload.php')) { flock($fh, LOCK_UN); return 0; }
        require_once __DIR__ . '/push-config.php';
        require_once __DIR__ . '/vendor/autoload.php';
        if (!defined('VAPID_PUBLIC_KEY') || !defined('VAPID_PRIVATE_KEY')) { flock($fh, LOCK_UN); return 0; }
        $wp = new \Minishlink\WebPush\WebPush(['VAPID' => [
            'subject' => 'mailto:admin@ddl-online.com', 'publicKey' => VAPID_PUBLIC_KEY, 'privateKey' => VAPID_PRIVATE_KEY,
        ]], ['TTL' => 3600]);
        foreach ($queue as [$s, $payload]) {
            $wp->queueNotification(
                \Minishlink\WebPush\Subscription::create(['endpoint' => $s['endpoint'], 'keys' => ['p256dh' => $s['p256dh'], 'auth' => $s['auth']]]),
                json_encode($payload), ['urgency' => 'high', 'topic' => substr(preg_replace('/[^A-Za-z0-9_-]/', '', $payload['tag']), 0, 32)]
            );
        }
        foreach ($wp->flush() as $report) {
            if ($report->isSuccess()) { $sent++; continue; }
            if (method_exists($report, 'isSubscriptionExpired') && $report->isSubscriptionExpired()) {
                $e = $report->getEndpoint();
                $db->prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')->execute([$e]);
                $db->prepare('DELETE FROM chat_push_endpoints WHERE endpoint_hash = ?')->execute([sha1($e)]);
            }
        }
        // Old rows are not needed: matches are only checked for a few days.
        if (mt_rand(1, 100) === 1) $db->exec('DELETE FROM chat_match_alerts WHERE sent_at < NOW() - INTERVAL 30 DAY');
    } catch (Throwable $e) {
        error_log('chat-match-alerts: ' . $e->getMessage());
    }
    flock($fh, LOCK_UN);
    return $sent;
}

// On its own (command line / cron):  php chat-match-alerts.php
if (PHP_SAPI === 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    require __DIR__ . '/chat-config.php';
    echo 'sent ' . chat_match_alerts(chat_db()) . "\n";
}
