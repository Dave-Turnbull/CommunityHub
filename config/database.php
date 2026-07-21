<?php

return [
    'default' => env('DB_CONNECTION', 'pgsql'),

    'connections' => [
        // Used only by the test suite (phpunit.xml sets DB_CONNECTION=sqlite,
        // DB_DATABASE=:memory:) so Feature tests don't touch the dev Postgres data.
        'sqlite' => [
            'driver'                  => 'sqlite',
            'database'                => env('DB_DATABASE', database_path('database.sqlite')),
            'prefix'                  => '',
            'foreign_key_constraints' => true,
        ],

        'pgsql' => [
            'driver'   => 'pgsql',
            'host'     => env('DB_HOST', 'postgres'),
            'port'     => env('DB_PORT', '5432'),
            'database' => env('DB_DATABASE', 'communityhub'),
            'username' => env('DB_USERNAME', 'communityhub'),
            'password' => env('DB_PASSWORD', 'secret'),
            'charset'  => 'utf8',
            'schema'   => 'public',
            'sslmode'  => 'prefer',
        ],
    ],

    'migrations' => ['table' => 'migrations'],

    'redis' => [
        'client'  => env('REDIS_CLIENT', 'phpredis'),
        'options' => ['prefix' => env('REDIS_PREFIX', 'communityhub_')],
        'default' => [
            'host'     => env('REDIS_HOST', 'redis'),
            'password' => env('REDIS_PASSWORD'),
            'port'     => env('REDIS_PORT', '6379'),
            'database' => 0,
        ],
        'cache' => [
            'host'     => env('REDIS_HOST', 'redis'),
            'password' => env('REDIS_PASSWORD'),
            'port'     => env('REDIS_PORT', '6379'),
            'database' => 1,
        ],
    ],
];
