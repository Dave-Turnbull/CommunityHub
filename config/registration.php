<?php

// Env-driven *defaults* only — the live values an admin can toggle from
// Settings live in the instance_settings table (see App\Models\InstanceSetting),
// seeded from these on first read. Changing these env vars after the row
// already exists has no effect; they're a first-boot default, not a live
// override. See docs/roles-and-permissions.md's "Server signup paths".
return [
    'manual_enabled'       => env('SIGNUP_MANUAL_ENABLED', true),
    'email_invite_enabled' => env('SIGNUP_EMAIL_INVITE_ENABLED', true),
    'oauth_enabled'        => env('SIGNUP_OAUTH_ENABLED', true),
];
