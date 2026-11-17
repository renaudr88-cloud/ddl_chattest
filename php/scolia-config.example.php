<?php
// Settings for the Scolia bridge (scolia/bridge.js on the server). Copy to scolia-config.php on the server and fill in.
// scolia-config.php holds a secret: never put the filled-in file in git.

// The same long random secret as "secret" in scolia/config.json on the server.
// Make one with:  php -r "echo bin2hex(random_bytes(32));"
const SCOLIA_BRIDGE_SECRET = '';

// Where the bridge answers on the server itself (live score, board check). Normally this.
const SCOLIA_BRIDGE_URL = 'http://127.0.0.1:8787';
