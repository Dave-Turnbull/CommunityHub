<?php

return [
    'paths'                    => ['api/*', 'sanctum/csrf-cookie', 'broadcasting/auth'],
    'allowed_methods'          => ['*'],

    // A wildcard origin combined with supports_credentials below is an
    // unsafe combination on a session-cookie app reachable from the public
    // internet — default to just this app's own origin, with an optional
    // comma-separated CORS_ALLOWED_ORIGINS env var for any additional origin
    // (e.g. a future separate mobile app) that also needs credentialed
    // access to these paths.
    'allowed_origins' => array_values(array_filter(array_merge(
        [config('app.url')],
        array_filter(explode(',', env('CORS_ALLOWED_ORIGINS', ''))),
    ))),

    'allowed_origins_patterns' => [],
    'allowed_headers'          => ['*'],
    'exposed_headers'          => [],
    'max_age'                  => 0,
    'supports_credentials'     => true,
];
