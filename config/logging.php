<?php

return [
    'default' => env('LOG_CHANNEL', 'stack'),
    'deprecations' => ['channel' => 'null', 'trace' => false],
    'channels' => [
        'stack'  => ['driver' => 'stack', 'channels' => ['single'], 'ignore_exceptions' => false],
        'single' => ['driver' => 'single', 'path' => storage_path('logs/laravel.log'), 'level' => 'debug'],
        'stderr' => [
            'driver'  => 'monolog',
            'handler' => Monolog\Handler\StreamHandler::class,
            'with'    => ['stream' => 'php://stderr'],
        ],
        'null'   => ['driver' => 'monolog', 'handler' => Monolog\Handler\NullHandler::class],
    ],
];
