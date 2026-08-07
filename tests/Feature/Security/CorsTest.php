<?php

namespace Tests\Feature\Security;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * config/cors.php used to allow_origins => ['*'] with supports_credentials
 * true — an unsafe combination once this app is reachable from the public
 * internet with session-cookie auth. Origins are now derived from
 * config('app.url') (+ optional CORS_ALLOWED_ORIGINS).
 */
class CorsTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_configured_app_origin_is_allowed(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->withHeaders([
            'Origin' => config('app.url'),
        ])->getJson('/api/notifications');

        $response->assertHeader('Access-Control-Allow-Origin', config('app.url'));
    }

    public function test_an_unrecognized_origin_never_gets_its_own_origin_echoed_back(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->withHeaders([
            'Origin' => 'https://evil.example.com',
        ])->getJson('/api/notifications');

        // With exactly one configured origin, the CORS layer (fruitcake/php-cors,
        // via Laravel's HandleCors) always echoes that single origin rather than
        // reflecting whatever Origin the request sent — a browser only honors the
        // response if its own Origin matches Access-Control-Allow-Origin, so this
        // never actually grants the evil origin access, but assert the safe
        // value explicitly rather than "any header is fine".
        $response->assertHeader('Access-Control-Allow-Origin', config('app.url'));
    }

    public function test_an_extra_origin_from_env_is_allowed(): void
    {
        config(['cors.allowed_origins' => [config('app.url'), 'https://mobile.example.com']]);
        $user = User::factory()->create();

        $response = $this->actingAs($user)->withHeaders([
            'Origin' => 'https://mobile.example.com',
        ])->getJson('/api/notifications');

        $response->assertHeader('Access-Control-Allow-Origin', 'https://mobile.example.com');
    }
}
