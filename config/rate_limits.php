<?php

// Per-user, per-minute ceilings for the write-heavy /api/* routes — the named
// limiters registered in AppServiceProvider::boot() and applied in
// routes/api.php. Set well above what a person does by hand; they exist to stop
// one account flooding a channel, the disk, or the mail queue.
return [
    'messages' => (int) env('RATE_LIMIT_MESSAGES_PER_MINUTE', 60),
    'uploads' => (int) env('RATE_LIMIT_UPLOADS_PER_MINUTE', 30),
    'reactions' => (int) env('RATE_LIMIT_REACTIONS_PER_MINUTE', 120),
    'invites' => (int) env('RATE_LIMIT_INVITES_PER_MINUTE', 20),
    'conversations' => (int) env('RATE_LIMIT_CONVERSATIONS_PER_MINUTE', 20),
];
