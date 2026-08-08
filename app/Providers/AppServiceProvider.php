<?php

namespace App\Providers;

use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;
use SocialiteProviders\Authentik\Provider as AuthentikProvider;
use SocialiteProviders\Manager\SocialiteWasCalled;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void {}

    public function boot(): void
    {
        // Wires Socialite's 'authentik' driver to socialiteproviders/authentik
        // — see AuthentikController/docs/auth-and-sso.md. Registered
        // unconditionally (cheap, no I/O); whether the driver is actually
        // reachable is gated per-request by config('services.authentik.enabled')
        // in AuthentikController, not by whether this listener exists.
        Event::listen(function (SocialiteWasCalled $event) {
            $event->extendSocialite('authentik', AuthentikProvider::class);
        });
    }
}
