<?php
// The name a player has in the chat: their Dartsmind name, or their real name when they have none.
// (Kept out of chat-config.php, which holds the secrets and is filled in by hand on the server.)
function chat_display_name(array $p): string {
    $n = trim((string)($p['dartsmind_username'] ?? '')) ?: trim((string)($p['name'] ?? ''));
    return $n !== '' ? mb_substr($n, 0, 30) : 'Player ' . ($p['id'] ?? '');
}
