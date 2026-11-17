<?php
// For the Scolia bridge only (signed): the Scolia matches that are on now, with each player's board.
// GET -> {matches: [{match, tournament, tournamentName, legsToWin, players: [{id, name, serial}, {…}]}]}
//        league matches: {match: "L<id>", kind: "league", league, format: fixed|first, legsToWin, totalLegs, players}
require __DIR__ . '/chat-config.php';
require_once __DIR__ . '/scolia-api-lib.php';
header('Content-Type: application/json');
if (!scolia_bridge_verified('')) { http_response_code(403); echo '{"error":"Not allowed."}'; exit; }
$pdo = chat_db();
// Tournament matches, and planned matches of Scolia leagues.
echo json_encode(['matches' => array_merge(scolia_open_matches($pdo), scolia_open_league_matches($pdo))], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
