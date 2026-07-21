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
];
