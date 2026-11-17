#!/bin/sh
# Installs (or updates) the DDL Scolia bridge on the web server. Run as root:
#   sh install.sh
# It copies the bridge to /opt/ddl-scolia, installs Node.js if needed, makes a secret,
# writes /var/www/html/scolia-config.php and starts the service. Your access token goes in afterwards:
#   nano /opt/ddl-scolia/config.json      ("accessToken"), then: systemctl restart ddl-scolia
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
DEST=/opt/ddl-scolia
SITE=${SITE_DIR:-/var/www/html}

if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  echo "Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

mkdir -p "$DEST"
cp "$HERE/bridge.js" "$HERE/x01.js" "$HERE/package.json" "$HERE/package-lock.json" "$DEST/"
cd "$DEST" && npm install --omit=dev --silent

if [ ! -f "$DEST/config.json" ]; then
  SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  cat > "$DEST/config.json" <<JSON
{
  "scoliaUrl": "wss://game.scoliadarts.com/api/v1/external",
  "accessToken": "",
  "siteUrl": "https://ddl-online.com",
  "secret": "$SECRET",
  "port": 8787,
  "pollSeconds": 30
}
JSON
  cat > "$SITE/scolia-config.php" <<PHP
<?php
// Made by scolia/install.sh. Holds a secret: never put this file in git.
const SCOLIA_BRIDGE_SECRET = '$SECRET';
const SCOLIA_BRIDGE_URL = 'http://127.0.0.1:8787';
PHP
  echo "Made a new secret in $DEST/config.json and $SITE/scolia-config.php"
fi
chown -R www-data:www-data "$DEST"
chmod 600 "$DEST/config.json"
chown www-data:www-data "$SITE/scolia-config.php" && chmod 640 "$SITE/scolia-config.php"

cp "$HERE/ddl-scolia.service" /etc/systemd/system/ddl-scolia.service
systemctl daemon-reload
systemctl enable ddl-scolia >/dev/null
systemctl restart ddl-scolia
sleep 2
systemctl --no-pager --lines=5 status ddl-scolia || true
echo
echo "Done. Put the Scolia access token in $DEST/config.json, then: systemctl restart ddl-scolia"
