<?php

// First-party voice infra config (coturn), mirroring config/broadcasting.php's
// shape rather than config/services.php — this isn't a third-party API key,
// it's our own docker-compose coturn service. See CLAUDE.md for the env var
// split: TURN_PUBLIC_HOST is server-side (PHP builds the URL string sent to
// the browser in the ICE servers response) — there is deliberately no
// VITE_TURN_* counterpart, since credentials are fetched at runtime from an
// authenticated endpoint rather than baked into the JS bundle at build time.
return [
    'secret'      => env('TURN_SECRET'),
    'realm'       => env('TURN_REALM', 'communityhub'),
    'port'        => env('TURN_PORT', 3478),
    'public_host' => env('TURN_PUBLIC_HOST', 'localhost'),

    // How long an ephemeral TURN credential stays valid for.
    'credential_ttl' => 3600,
];
