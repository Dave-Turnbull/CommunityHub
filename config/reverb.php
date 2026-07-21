<?php

return [
    'default' => env('REVERB_SERVER', 'reverb'),

    'servers' => [
        'reverb' => [
            'host'    => env('REVERB_SERVER_HOST', '0.0.0.0'),
            'port'    => env('REVERB_SERVER_PORT', 8080),
            'hostname'=> env('REVERB_HOST'),
            'options' => [],
            'max_request_size' => 10_000,
            'scaling' => [
                'enabled'  => env('REVERB_SCALING_ENABLED', false),
                'channel'  => 'reverb',
                'server'   => [
                    'url'  => env('REDIS_URL'),
                    'host' => env('REDIS_HOST', 'redis'),
                    'port' => env('REDIS_PORT', '6379'),
                ],
            ],
            'pulse_ingest_interval' => 15,
        ],
    ],

    'apps' => [
        'provider' => 'config',
        'apps' => [
            [
                'key'             => env('REVERB_APP_KEY'),
                'secret'          => env('REVERB_APP_SECRET'),
                'app_id'          => env('REVERB_APP_ID'),
                'options'         => [
                    'host'   => env('REVERB_HOST', 'localhost'),
                    'port'   => env('REVERB_PORT', 8080),
                    'scheme' => env('REVERB_SCHEME', 'http'),
                    'useTLS' => env('REVERB_SCHEME', 'http') === 'https',
                ],
                'allowed_origins' => ['*'],
                'ping_interval'   => 60,
                'activity_timeout'=> 30,
                'max_message_size'=> 10_000,
            ],
        ],
    ],
];
