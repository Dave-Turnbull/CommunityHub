<?php

namespace Tests\Feature\Auth;

use App\Models\InstanceSetting;
use App\Models\User;
use App\Models\UserOAuthIdentity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as SocialiteUser;
use Tests\TestCase;

class AuthentikOAuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        config(['services.authentik.enabled' => true]);
    }

    private function fakeOAuthUser(array $overrides = []): SocialiteUser
    {
        return SocialiteUser::fake(array_merge([
            'id'       => 'sub-123',
            'email'    => 'oauth-user@example.com',
            'name'     => 'OAuth User',
            'nickname' => 'oauthuser',
        ], $overrides));
    }

    public function test_redirect_and_callback_404_when_authentik_is_disabled(): void
    {
        config(['services.authentik.enabled' => false]);

        $this->get('/auth/authentik/redirect')->assertNotFound();
        $this->get('/auth/authentik/callback')->assertNotFound();
    }

    public function test_redirect_sends_the_browser_to_authentik(): void
    {
        config(['services.authentik.base_url' => 'https://authentik.example.com']);

        $response = $this->get('/auth/authentik/redirect');

        $response->assertRedirect();
        $this->assertStringStartsWith(
            'https://authentik.example.com/application/o/authorize/',
            $response->headers->get('Location')
        );
    }

    public function test_an_existing_linked_identity_logs_in_directly(): void
    {
        $user = User::factory()->create();
        UserOAuthIdentity::factory()->for($user)->create(['provider_user_id' => 'sub-123']);

        Socialite::fake('authentik', $this->fakeOAuthUser());

        $response = $this->get('/auth/authentik/callback');

        $response->assertRedirect('/');
        $this->assertAuthenticatedAs($user);
    }

    public function test_a_matching_email_with_no_linked_identity_requires_manual_link(): void
    {
        $user = User::factory()->create(['email' => 'oauth-user@example.com', 'password' => Hash::make('secret123')]);

        Socialite::fake('authentik', $this->fakeOAuthUser());

        $response = $this->get('/auth/authentik/callback');

        $response->assertRedirect('/auth/link-account');
        $this->assertGuest();
        $this->assertDatabaseCount('user_oauth_identities', 0);

        // The link page shows the matched email and the correct password links it.
        $page = $this->get('/auth/link-account');
        $page->assertOk();

        $link = $this->post('/auth/link-account', ['password' => 'secret123']);
        $link->assertRedirect('/');
        $this->assertAuthenticatedAs($user);
        $this->assertDatabaseHas('user_oauth_identities', ['user_id' => $user->id, 'provider_user_id' => 'sub-123']);
    }

    public function test_an_incorrect_password_on_the_link_step_is_rejected(): void
    {
        $user = User::factory()->create(['email' => 'oauth-user@example.com', 'password' => Hash::make('secret123')]);
        Socialite::fake('authentik', $this->fakeOAuthUser());
        $this->get('/auth/authentik/callback');

        $response = $this->post('/auth/link-account', ['password' => 'wrong-password']);

        $response->assertSessionHasErrors('password');
        $this->assertGuest();
        $this->assertDatabaseCount('user_oauth_identities', 0);
    }

    public function test_a_new_identity_with_no_match_provisions_a_new_account_when_oauth_signup_is_open(): void
    {
        InstanceSetting::factory()->create([
            'signup_manual_enabled'       => true,
            'signup_email_invite_enabled' => true,
            'signup_oauth_enabled'        => true,
        ]);
        Socialite::fake('authentik', $this->fakeOAuthUser());

        $response = $this->get('/auth/authentik/callback');

        $response->assertRedirect('/');
        $user = User::where('email', 'oauth-user@example.com')->firstOrFail();
        $this->assertAuthenticatedAs($user);
        $this->assertNull($user->password);
        $this->assertDatabaseHas('user_oauth_identities', ['user_id' => $user->id, 'provider_user_id' => 'sub-123']);
    }

    public function test_a_new_identity_is_rejected_when_oauth_signup_is_closed(): void
    {
        InstanceSetting::factory()->create([
            'signup_manual_enabled'       => true,
            'signup_email_invite_enabled' => true,
            'signup_oauth_enabled'        => false,
        ]);
        Socialite::fake('authentik', $this->fakeOAuthUser());

        $response = $this->get('/auth/authentik/callback');

        $response->assertRedirect('/login');
        $this->assertGuest();
        $this->assertDatabaseCount('users', 0);
    }

    public function test_the_callback_route_is_throttled(): void
    {
        // oauth signup closed and no matching local account — every call is
        // rejected and the requester stays a guest throughout, so the
        // throttle key (IP for guests, user id once authenticated — see
        // Laravel's default ThrottleRequests resolver) doesn't shift
        // mid-loop and split the count across two buckets.
        InstanceSetting::factory()->create([
            'signup_manual_enabled'       => true,
            'signup_email_invite_enabled' => true,
            'signup_oauth_enabled'        => false,
        ]);
        Socialite::fake('authentik', fn () => $this->fakeOAuthUser(['id' => (string) Str::uuid()]));

        for ($i = 0; $i < 10; $i++) {
            $this->get('/auth/authentik/callback');
        }

        $response = $this->get('/auth/authentik/callback');

        $response->assertStatus(429);
    }
}
