<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Auth\Middleware\EnsureEmailIsVerified;
use Illuminate\Http\Request;

/**
 * Wraps Laravel's stock EnsureEmailIsVerified so verification enforcement is
 * a runtime config toggle (config('verification.enabled'), see
 * config/verification.php) rather than fixed at route-registration time.
 * routes/web.php's authenticated group always carries this middleware —
 * whether it actually blocks anyone is decided per-request, not baked into
 * which routes got registered at boot.
 */
class EnsureEmailIsVerifiedIfRequired
{
    public function handle(Request $request, Closure $next)
    {
        if (! config('verification.enabled')) {
            return $next($request);
        }

        return app(EnsureEmailIsVerified::class)->handle($request, $next);
    }
}
