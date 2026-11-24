<?php

namespace App\Providers;

use App\Models\Message;
use App\Services\DefaultRoomService;
use Illuminate\Auth\Events\Verified;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
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

        // The deferred half of default-room enrolment — see
        // DefaultRoomService::enrollIn() for why an unverified account is
        // skipped at creation while verification is enforced.
        Event::listen(function (Verified $event) {
            app(DefaultRoomService::class)->enrollIfEligible($event->user);
        });

        // Reaches a tombstone (see Message::scopeListed) — only the routes
        // that name {listedMessage} resolve one; every other {message} route
        // keeps the default binding, which 404s a soft-deleted row.
        Route::bind('listedMessage', fn (string $id) => Message::listed()->findOrFail($id));

        foreach (['messages', 'uploads', 'reactions', 'invites', 'conversations'] as $name) {
            RateLimiter::for($name, fn (Request $request) => Limit::perMinute(
                (int) config("rate_limits.{$name}")
            )->by($request->user()?->id ?? $request->ip()));
        }
    }
}
