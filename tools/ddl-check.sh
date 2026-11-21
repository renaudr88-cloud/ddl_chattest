#!/bin/bash
# DDL website speed check (read only: changes nothing, prints no passwords).
# Run on the server:  bash ddl-check.sh > /root/ddl-check.txt 2>&1
SITE=/var/www/html
echo "===== DDL speed check $(date '+%Y-%m-%d %H:%M') ====="

echo; echo "===== MACHINE ====="
echo "cpu cores: $(nproc)"; uptime; free -h; df -h / | tail -1
echo; echo "--- busiest processes now ---"
ps -eo pid,pcpu,pmem,rss,etime,comm --sort=-pcpu | head -12
echo; echo "--- process counts ---"
for p in apache2 httpd php-fpm nginx mysqld mariadbd node; do n=$(pgrep -c -x "$p" 2>/dev/null || true); [ -n "$n" ] && [ "$n" != 0 ] && echo "$p: $n"; done
pgrep -fc 'php-fpm' >/dev/null 2>&1 && echo "php-fpm (any version): $(pgrep -fc 'php-fpm')"

echo; echo "===== WEB SERVER ====="
(apache2ctl -V 2>/dev/null || httpd -V 2>/dev/null) | grep -iE 'version|MPM'
apache2ctl -M 2>/dev/null | grep -iE 'mpm|php|proxy_fcgi|http2|deflate|expires|headers' | tr '\n' ' '; echo
grep -RhiE '^\s*(StartServers|MinSpareServers|MaxSpareServers|MaxRequestWorkers|MaxClients|ServerLimit|ThreadsPerChild|KeepAlive|KeepAliveTimeout|MaxKeepAliveRequests|Timeout)\b' /etc/apache2/apache2.conf /etc/apache2/mods-enabled/*.conf 2>/dev/null | sed 's/^\s*//'
echo "--- php-fpm pools ---"
grep -RhE '^\s*(pm|pm\.max_children|pm\.start_servers|pm\.min_spare_servers|pm\.max_spare_servers|pm\.max_requests|request_slowlog_timeout)\s*=' /etc/php/*/fpm/pool.d/*.conf 2>/dev/null
echo "--- php ---"
php -v | head -1
for ini in /etc/php/*/apache2/php.ini /etc/php/*/fpm/php.ini; do [ -f "$ini" ] && echo "$ini: $(grep -hE '^\s*(opcache\.enable|opcache\.memory_consumption|memory_limit|max_execution_time|session\.save_handler)\s*=' "$ini" | tr '\n' ' ')"; done
php -r 'echo "opcache loaded (cli): ", extension_loaded("Zend OPcache") ? "yes" : "no", "\n";'

echo; echo "===== ERRORS THAT MEAN 'TOO BUSY' ====="
for f in /var/log/apache2/error.log /var/log/apache2/error.log.1; do [ -f "$f" ] && echo "$f: $(grep -ciE 'MaxRequestWorkers|server reached|max_children|Too many connections|Lock wait timeout|Deadlock|Allowed memory size|Maximum execution time' "$f")"; done
grep -hiE 'MaxRequestWorkers|server reached|max_children|Too many connections' /var/log/apache2/error.log /var/log/apache2/error.log.1 /var/log/php*-fpm.log 2>/dev/null | tail -5

echo; echo "===== WHAT IS ASKED MOST (access log) ====="
LOG=/var/log/apache2/access.log; [ -f /var/log/apache2/access.log.1 ] && [ $(wc -l </var/log/apache2/access.log) -lt 50000 ] && LOG="/var/log/apache2/access.log.1 /var/log/apache2/access.log"
echo "log: $LOG"
cat $LOG 2>/dev/null | awk '{print $4}' | cut -d: -f1-3 | sort | uniq -c | sort -rn | head -8 | sed 's/^/requests per hour: /'
echo "--- top pages (all time in log) ---"
cat $LOG 2>/dev/null | awk '{print $7}' | cut -d'?' -f1 | sort | uniq -c | sort -rn | head -25
BUSY=$(cat $LOG 2>/dev/null | awk '{print $4}' | cut -d: -f1-3 | sort | uniq -c | sort -rn | head -1 | awk '{print $2}')
if [ -n "$BUSY" ]; then
  echo "--- top pages in the busiest hour ($BUSY) ---"
  grep -F "$BUSY" $LOG | awk '{print $7}' | cut -d'?' -f1 | sort | uniq -c | sort -rn | head -15
  echo "--- different visitors (IPs) in that hour: $(grep -F "$BUSY" $LOG | awk '{print $1}' | sort -u | wc -l)"
fi

echo; echo "===== DATABASE ====="
cd "$SITE" && php -r '
error_reporting(0);
require "db.php";
$v = fn($q) => $pdo->query($q)->fetchAll(PDO::FETCH_KEY_PAIR);
try {
foreach ($v("SHOW VARIABLES WHERE Variable_name IN (\"version\",\"max_connections\",\"innodb_buffer_pool_size\",\"slow_query_log\",\"long_query_time\",\"wait_timeout\",\"table_open_cache\",\"tmp_table_size\")") as $k => $x) echo "$k = $x\n";
foreach ($v("SHOW GLOBAL STATUS WHERE Variable_name IN (\"Uptime\",\"Threads_connected\",\"Max_used_connections\",\"Slow_queries\",\"Questions\",\"Created_tmp_disk_tables\",\"Select_full_join\",\"Select_scan\",\"Innodb_buffer_pool_reads\",\"Innodb_buffer_pool_read_requests\")") as $k => $x) echo "$k = $x\n";
} catch (Throwable $e) { echo "settings: ", $e->getMessage(), "\n"; }
echo "\n--- biggest tables (rows, MB, indexes) ---\n";
try {
$db = $pdo->query("SELECT DATABASE()")->fetchColumn();
$t = $pdo->prepare("SELECT table_name, table_rows, ROUND((data_length+index_length)/1048576,1) mb, engine FROM information_schema.tables WHERE table_schema = ? ORDER BY data_length+index_length DESC LIMIT 25");
$t->execute([$db]);
foreach ($t->fetchAll(PDO::FETCH_ASSOC) as $r) {
  $ix = $pdo->query("SHOW INDEX FROM `".$r["table_name"]."`")->fetchAll(PDO::FETCH_ASSOC);
  $cols = []; foreach ($ix as $i) $cols[$i["Key_name"]][] = $i["Column_name"];
  echo str_pad($r["table_name"], 34), str_pad($r["table_rows"], 9, " ", STR_PAD_LEFT), " rows ", str_pad($r["mb"], 6, " ", STR_PAD_LEFT), " MB  ", $r["engine"], "  idx: ", implode(" | ", array_map(fn($k, $c) => "$k(" . implode(",", $c) . ")", array_keys($cols), $cols)), "\n";
}
} catch (Throwable $e) { echo "tables: ", $e->getMessage(), "\n"; }
echo "\n--- running queries now ---\n";
try {
foreach ($pdo->query("SHOW FULL PROCESSLIST")->fetchAll(PDO::FETCH_ASSOC) as $p) if ($p["Command"] !== "Sleep") echo $p["Time"], "s ", $p["State"], " ", substr(preg_replace("/\s+/", " ", (string)$p["Info"]), 0, 160), "\n";
} catch (Throwable $e) { echo "processlist: ", $e->getMessage(), "\n"; }
'
echo; echo "===== SESSIONS ====="
d=$(php -r 'echo session_save_path() ?: "/var/lib/php/sessions";'); echo "session dir: $d, files: $(ls "$d" 2>/dev/null | wc -l)"
echo; echo "===== done ====="
