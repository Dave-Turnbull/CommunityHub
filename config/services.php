<?php

return [
    // Only used when MAIL_MAILER=ses. Deliberately separate from the AWS_*
    // vars used for R2 storage (config/filesystems.php) — those are R2
    // credentials scoped to AWS_ENDPOINT and are not valid AWS credentials
    // for a real AWS service like SES.
    'ses' => [
        'key'    => env('MAIL_SES_KEY'),
        'secret' => env('MAIL_SES_SECRET'),
        'region' => env('MAIL_SES_REGION', 'us-east-1'),
    ],

    // Optional additional login method — see docs/auth-and-sso.md. Kept in
    // this file rather than a dedicated config/authentik.php: Socialite's
    // own convention (and socialiteproviders/authentik specifically) reads
    // OAuth driver credentials from config('services.<driver>'), so
    // splitting this across two files would fight the package's own
    // convention for no benefit. `enabled` is checked per-request in
    // AuthentikController, not at route-registration time, so it can be
    // flipped without restarting anything route-cache-sensitive.
    'authentik' => [
        'enabled'       => (bool) env('AUTHENTIK_ENABLED', false),
        'client_id'     => env('AUTHENTIK_CLIENT_ID'),
        'client_secret' => env('AUTHENTIK_CLIENT_SECRET'),
        'redirect'      => env('AUTHENTIK_REDIRECT_URI', env('APP_URL') . '/auth/authentik/callback'),
        // Authentik's own base URL, e.g. https://authentik.example.com —
        // Provider::getBaseUrl() appends /application/o/authorize|token/.
        'base_url'      => env('AUTHENTIK_BASE_URL'),
    ],
];
