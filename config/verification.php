<?php

// Whether an unverified user is blocked from the app until they click the
// link in a verification email — see routes/web.php's conditional 'verified'
// middleware and Web\EmailVerificationController. User always implements
// MustVerifyEmail regardless of this flag (the interface is inert until the
// middleware is actually applied) — this is the one switch that matters.
return [
    'enabled' => (bool) env('EMAIL_VERIFICATION_ENABLED', false),
];
