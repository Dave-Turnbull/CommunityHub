<?php

return [
    // mailpit (dev catcher) | smtp (any real provider) | log | array | ses
    'default' => env('MAIL_MAILER', 'mailpit'),

    'mailers' => [
        'mailpit' => [
            'transport' => 'smtp',
            'host'      => env('MAIL_HOST', 'mailpit'),
            'port'      => env('MAIL_PORT', 1025),
        ],
        'smtp' => [
            'transport'  => 'smtp',
            'host'       => env('MAIL_HOST'),
            'port'       => env('MAIL_PORT', 587),
            'username'   => env('MAIL_USERNAME'),
            'password'   => env('MAIL_PASSWORD'),
            'encryption' => env('MAIL_ENCRYPTION', 'tls'),
        ],
        'ses'   => ['transport' => 'ses'],
        'log'   => ['transport' => 'log'],
        'array' => ['transport' => 'array'],
    ],

    'from' => [
        'address' => env('MAIL_FROM_ADDRESS', 'noreply@communityhub.test'),
        'name'    => env('MAIL_FROM_NAME', 'CommunityHub'),
    ],
];
