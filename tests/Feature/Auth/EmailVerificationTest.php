<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class EmailVerificationTest extends TestCase
{
    use RefreshDatabase;

    // /email/verify/{id}/{hash} and /email/resend are throttled.
    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    public function test_an_unverified_user_is_blocked_from_the_app_when_verification_is_enabled(): void
    {
        config(['verification.enabled' => true]);
        $user = User::factory()->create(['email_verified_at' => null]);

        $response = $this->actingAs($user)->get('/');

        $response->assertRedirect('/email/verify');
    }

    public function test_a_verified_user_is_not_blocked_when_verification_is_enabled(): void
    {
        config(['verification.enabled' => true]);
        $user = User::factory()->create(['email_verified_at' => now()]);

        $response = $this->actingAs($user)->get('/');

        $response->assertOk();
    }

    public function test_an_unverified_user_is_not_blocked_when_verification_is_disabled(): void
    {
        config(['verification.enabled' => false]);
        $user = User::factory()->create(['email_verified_at' => null]);

        $response = $this->actingAs($user)->get('/');

        $response->assertOk();
    }

    public function test_a_valid_signed_link_verifies_the_user_and_redirects_home(): void
    {
        config(['verification.enabled' => true]);
        $user = User::factory()->create(['email_verified_at' => null]);

        $url = URL::temporarySignedRoute(
            'verification.verify',
            now()->addMinutes(60),
            ['id' => $user->id, 'hash' => sha1($user->email)]
        );

        $response = $this->actingAs($user)->get($url);

        $response->assertRedirect('/');
        $this->assertNotNull($user->fresh()->email_verified_at);
    }

    public function test_an_invalid_signature_is_rejected(): void
    {
        $user = User::factory()->create(['email_verified_at' => null]);

        $response = $this->actingAs($user)->get("/email/verify/{$user->id}/" . sha1('wrong-email'));

        $response->assertForbidden();
        $this->assertNull($user->fresh()->email_verified_at);
    }

    public function test_resend_sends_the_verification_notification(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email_verified_at' => null]);

        $response = $this->actingAs($user)->post('/email/resend');

        $response->assertRedirect();
        Notification::assertSentTo($user, VerifyEmail::class);
    }

    public function test_resend_is_throttled(): void
    {
        Notification::fake();
        $user = User::factory()->create(['email_verified_at' => null]);

        for ($i = 0; $i < 6; $i++) {
            $this->actingAs($user)->post('/email/resend')->assertRedirect();
        }

        $this->actingAs($user)->post('/email/resend')->assertStatus(429);
    }

    public function test_the_verify_and_resend_routes_stay_reachable_even_when_verification_is_disabled(): void
    {
        config(['verification.enabled' => false]);
        Notification::fake();
        $user = User::factory()->create(['email_verified_at' => null]);

        $this->actingAs($user)->post('/email/resend')->assertRedirect();
        Notification::assertSentTo($user, VerifyEmail::class);
    }

    public function test_registering_sends_the_verification_notification_when_enabled(): void
    {
        config(['verification.enabled' => true]);
        Notification::fake();

        $this->post('/register', [
            'username'              => 'newuser',
            'display_name'          => 'New User',
            'email'                 => 'new@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $user = User::where('email', 'new@example.com')->firstOrFail();
        Notification::assertSentTo($user, VerifyEmail::class);
    }

    public function test_registering_does_not_send_the_verification_notification_when_disabled(): void
    {
        config(['verification.enabled' => false]);
        Notification::fake();

        $this->post('/register', [
            'username'              => 'newuser',
            'display_name'          => 'New User',
            'email'                 => 'new@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
        ]);

        Notification::assertNothingSent();
    }
}
