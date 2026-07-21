<?php

return [
    'driver'          => env('SESSION_DRIVER', 'redis'),
    'lifetime'        => (int) env('SESSION_LIFETIME', 10080),
    'expire_on_close' => false,
    'encrypt'         => false,
    'files'           => storage_path('framework/sessions'),
    'connection'      => env('SESSION_CONNECTION'),
    'table'           => 'sessions',
    'store'           => env('SESSION_STORE'),
    'lottery'         => [2, 100],
    'cookie'          => 'communityhub_session',
    'path'            => '/',
    'domain'          => env('SESSION_DOMAIN'),
    'secure'          => env('SESSION_SECURE_COOKIE', false),
    'http_only'       => true,
    'same_site'       => 'lax',
];
