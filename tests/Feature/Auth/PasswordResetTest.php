<?php

namespace Tests\Feature\Auth;

use App\Mail\PasswordResetMail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Mail::fake();
    }

    public function test_the_forgot_password_page_renders_for_guests(): void
    {
        $this->get('/forgot-password')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('Auth/ForgotPassword'));
    }

    public function test_the_reset_password_page_receives_the_token_and_email(): void
    {
        $this->get('/reset-password/abc123?email=alice@example.com')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Auth/ResetPassword')
                ->where('token', 'abc123')
                ->where('email', 'alice@example.com'));
    }

    public function test_logged_in_users_are_redirected_away_from_the_guest_pages(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->get('/forgot-password')->assertRedirect('/');
        $this->actingAs($user)->get('/reset-password/abc123')->assertRedirect('/');
        $this->actingAs($user)->post('/forgot-password', ['email' => $user->email])->assertRedirect('/');
        $this->actingAs($user)->post('/reset-password', [])->assertRedirect('/');
        Mail::assertNothingQueued();
    }

    public function test_requesting_a_link_for_a_real_email_queues_the_reset_mail(): void
    {
        $user = User::factory()->create(['email' => 'alice@example.com', 'display_name' => 'Alice']);

        $response = $this->post('/forgot-password', ['email' => 'alice@example.com']);

        $response->assertRedirect();
        $response->assertSessionHas('success');

        Mail::assertQueued(PasswordResetMail::class, function (PasswordResetMail $mail) use ($user) {
            return $mail->hasTo('alice@example.com') && $mail->user->is($user);
        });
        $this->assertDatabaseHas('password_reset_tokens', ['email' => 'alice@example.com']);
    }

    public function test_the_mail_links_to_the_reset_page_and_uses_the_app_name(): void
    {
        config(['app.name' => 'Hubby']);
        $user = User::factory()->create(['email' => 'alice@example.com']);

        $mail = new PasswordResetMail($user, 'tok-123');

        $mail->assertHasSubject('Reset your Hubby password');
        $mail->assertSeeInHtml(url('/reset-password/tok-123') . '?email=alice%40example.com', false);
        $mail->assertSeeInHtml('Hubby');
    }

    public function test_an_unknown_email_gets_the_same_response_and_sends_nothing(): void
    {
        User::factory()->create(['email' => 'alice@example.com']);

        $known   = $this->post('/forgot-password', ['email' => 'alice@example.com']);
        Cache::flush();
        $unknown = $this->post('/forgot-password', ['email' => 'nobody@example.com']);

        $this->assertSame($known->getStatusCode(), $unknown->getStatusCode());
        $this->assertSame($known->headers->get('Location'), $unknown->headers->get('Location'));
        $unknown->assertSessionHas('success', $known->getSession()->get('success'));
        $unknown->assertSessionHasNoErrors();

        Mail::assertQueuedCount(1);
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => 'nobody@example.com']);
    }

    public function test_a_throttled_request_looks_identical_to_a_successful_one(): void
    {
        User::factory()->create(['email' => 'alice@example.com']);

        $first  = $this->post('/forgot-password', ['email' => 'alice@example.com']);
        $second = $this->post('/forgot-password', ['email' => 'alice@example.com']);

        $second->assertSessionHasNoErrors();
        $second->assertSessionHas('success', $first->getSession()->get('success'));
        Mail::assertQueuedCount(1);
    }

    public function test_a_malformed_email_is_rejected(): void
    {
        $this->post('/forgot-password', ['email' => 'not-an-email'])->assertSessionHasErrors('email');
    }

    public function test_the_forgot_password_post_is_throttled(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->post('/forgot-password', ['email' => "nobody{$i}@example.com"])->assertRedirect();
        }

        $this->post('/forgot-password', ['email' => 'nobody@example.com'])->assertStatus(429);
    }

    public function test_a_valid_token_resets_the_password_and_the_user_can_log_in_with_it(): void
    {
        $user  = User::factory()->create(['email' => 'alice@example.com', 'password' => Hash::make('old-password')]);
        $user->forceFill(['remember_token' => 'old-remember'])->save();
        $token = Password::createToken($user);

        $response = $this->post('/reset-password', [
            'token'                 => $token,
            'email'                 => 'alice@example.com',
            'password'              => 'new-password-1',
            'password_confirmation' => 'new-password-1',
        ]);

        $response->assertRedirect('/login');
        $response->assertSessionHas('success');
        $this->assertGuest();

        $user->refresh();
        $this->assertTrue(Hash::check('new-password-1', $user->password));
        $this->assertNotSame('old-remember', $user->remember_token);

        $this->post('/login', ['login' => 'alice@example.com', 'password' => 'new-password-1'])->assertRedirect('/');
        $this->assertAuthenticatedAs($user);
    }

    public function test_a_reset_token_cannot_be_reused(): void
    {
        $user  = User::factory()->create(['email' => 'alice@example.com']);
        $token = Password::createToken($user);
        $body  = [
            'token' => $token, 'email' => 'alice@example.com',
            'password' => 'new-password-1', 'password_confirmation' => 'new-password-1',
        ];

        $this->post('/reset-password', $body)->assertRedirect('/login');

        $second = $this->post('/reset-password', [...$body, 'password' => 'another-pass-2', 'password_confirmation' => 'another-pass-2']);
        $second->assertSessionHasErrors('email');
        $this->assertTrue(Hash::check('new-password-1', $user->fresh()->password));
    }

    public function test_an_invalid_token_is_rejected(): void
    {
        $user = User::factory()->create(['email' => 'alice@example.com', 'password' => Hash::make('old-password')]);
        Password::createToken($user);

        $this->post('/reset-password', [
            'token' => 'wrong', 'email' => 'alice@example.com',
            'password' => 'new-password-1', 'password_confirmation' => 'new-password-1',
        ])->assertSessionHasErrors('email');

        $this->assertTrue(Hash::check('old-password', $user->fresh()->password));
    }

    public function test_an_expired_token_is_rejected(): void
    {
        $user  = User::factory()->create(['email' => 'alice@example.com', 'password' => Hash::make('old-password')]);
        $token = Password::createToken($user);

        $this->travel(config('auth.passwords.users.expire') + 1)->minutes();

        $this->post('/reset-password', [
            'token' => $token, 'email' => 'alice@example.com',
            'password' => 'new-password-1', 'password_confirmation' => 'new-password-1',
        ])->assertSessionHasErrors('email');

        $this->assertTrue(Hash::check('old-password', $user->fresh()->password));
    }

    public function test_an_unknown_email_on_reset_gets_the_same_error_as_a_bad_token(): void
    {
        $user = User::factory()->create(['email' => 'alice@example.com']);

        $bad     = $this->post('/reset-password', [
            'token' => 'wrong', 'email' => 'alice@example.com',
            'password' => 'new-password-1', 'password_confirmation' => 'new-password-1',
        ]);
        $unknown = $this->post('/reset-password', [
            'token' => Password::createToken($user), 'email' => 'nobody@example.com',
            'password' => 'new-password-1', 'password_confirmation' => 'new-password-1',
        ]);

        $this->assertSame(
            $bad->getSession()->get('errors')->first('email'),
            $unknown->getSession()->get('errors')->first('email'),
        );
    }

    public function test_a_mismatched_confirmation_is_rejected(): void
    {
        $user  = User::factory()->create(['email' => 'alice@example.com', 'password' => Hash::make('old-password')]);
        $token = Password::createToken($user);

        $this->post('/reset-password', [
            'token' => $token, 'email' => 'alice@example.com',
            'password' => 'new-password-1', 'password_confirmation' => 'different-1',
        ])->assertSessionHasErrors('password');

        $this->assertTrue(Hash::check('old-password', $user->fresh()->password));
    }

    public function test_a_too_short_password_is_rejected(): void
    {
        $user  = User::factory()->create(['email' => 'alice@example.com', 'password' => Hash::make('old-password')]);
        $token = Password::createToken($user);

        $this->post('/reset-password', [
            'token' => $token, 'email' => 'alice@example.com',
            'password' => 'short', 'password_confirmation' => 'short',
        ])->assertSessionHasErrors('password');

        $this->assertTrue(Hash::check('old-password', $user->fresh()->password));
    }

    public function test_an_oauth_only_account_can_set_a_first_password_and_then_log_in(): void
    {
        $user = User::factory()->create(['email' => 'oauth@example.com']);
        $user->forceFill(['password' => null])->save();
        $this->assertNull($user->fresh()->password);

        $this->post('/forgot-password', ['email' => 'oauth@example.com'])->assertSessionHas('success');
        Mail::assertQueued(PasswordResetMail::class, fn (PasswordResetMail $m) => $m->hasTo('oauth@example.com'));

        $this->post('/reset-password', [
            'token' => Password::createToken($user), 'email' => 'oauth@example.com',
            'password' => 'first-password-1', 'password_confirmation' => 'first-password-1',
        ])->assertRedirect('/login');

        $this->assertTrue(Hash::check('first-password-1', $user->fresh()->password));

        $this->post('/login', ['login' => 'oauth@example.com', 'password' => 'first-password-1'])->assertRedirect('/');
        $this->assertAuthenticatedAs($user);
    }

    public function test_the_flow_works_with_email_verification_enabled_and_signups_closed(): void
    {
        config(['verification.enabled' => true]);
        \App\Models\InstanceSetting::current()->update([
            'signup_manual_enabled' => false, 'signup_email_invite_enabled' => false, 'signup_oauth_enabled' => false,
        ]);
        $user = User::factory()->create(['email' => 'alice@example.com', 'email_verified_at' => null]);

        $this->post('/forgot-password', ['email' => 'alice@example.com'])->assertSessionHas('success');
        Mail::assertQueued(PasswordResetMail::class);

        $this->post('/reset-password', [
            'token' => Password::createToken($user), 'email' => 'alice@example.com',
            'password' => 'new-password-1', 'password_confirmation' => 'new-password-1',
        ])->assertRedirect('/login');
    }
}
