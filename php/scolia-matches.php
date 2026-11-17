<?php
// For the Scolia bridge only (signed): the Scolia matches that are on now, with each player's board.
// GET -> {matches: [{match, tournament, tournamentName, legsToWin, players: [{id, name, serial}, {…}]}]}
require __DIR__ . '/chat-config.php';
require_once __DIR__ . '/scolia-api-lib.php';
header('Content-Type: application/json');
if (!scolia_bridge_verified('')) { http_response_code(403); echo '{"error":"Not allowed."}'; exit; }
$pdo = chat_db();
echo json_encode(['matches' => scolia_open_matches($pdo)], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
