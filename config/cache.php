<?php

return [
    'default' => env('CACHE_STORE', 'redis'),
    'stores'  => [
        'redis' => [
            'driver'          => 'redis',
            'connection'      => 'cache',
            'lock_connection' => 'default',
        ],
        'file' => [
            'driver' => 'file',
            'path'   => storage_path('framework/cache/data'),
        ],
    ],
    'prefix' => 'communityhub_cache',
];
