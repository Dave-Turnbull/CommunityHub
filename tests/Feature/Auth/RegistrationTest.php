<?php

namespace Tests\Feature\Auth;

use App\Models\InstanceSetting;
use App\Models\ServerInvite;
use App\Models\User;
use App\Support\Permission;
use App\Support\PermissionChecker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RegistrationTest extends TestCase
{
    use RefreshDatabase;

    // POST /register is throttled (see routes/web.php) — see LoginTest's
    // setUp for why this needs a Cache::flush() the same way ChannelFocus
    // tests do.
    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    public function test_a_visitor_can_register_and_is_logged_in(): void
    {
        $response = $this->post('/register', [
            'username'              => 'newuser',
            'display_name'          => 'New User',
            'email'                 => 'new@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response->assertRedirect('/');
        $this->assertAuthenticated();

        $user = User::where('email', 'new@example.com')->firstOrFail();
        $this->assertSame('newuser', $user->username);
        $this->assertSame('online', $user->status);
        $this->assertTrue(Hash::check('password123', $user->password));
    }

    public function test_registering_assigns_the_global_member_role(): void
    {
        $this->post('/register', [
            'username'              => 'newuser',
            'display_name'          => 'New User',
            'email'                 => 'new@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $user = User::where('email', 'new@example.com')->firstOrFail();

        $this->assertTrue(PermissionChecker::can($user, Permission::SendDirectMessages));
    }

    public function test_username_must_be_lowercase_alphanumeric(): void
    {
        $response = $this->post('/register', [
            'username'              => 'Not Valid!',
            'display_name'          => 'New User',
            'email'                 => 'new@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response->assertSessionHasErrors('username');
        $this->assertGuest();
    }

    public function test_email_must_be_unique(): void
    {
        User::factory()->create(['email' => 'taken@example.com']);

        $response = $this->post('/register', [
            'username'              => 'anotheruser',
            'display_name'          => 'Another User',
            'email'                 => 'taken@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $response->assertSessionHasErrors('email');
    }

    public function test_password_must_be_confirmed(): void
    {
        $response = $this->post('/register', [
            'username'              => 'newuser',
            'display_name'          => 'New User',
            'email'                 => 'new@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'nope',
        ]);

        $response->assertSessionHasErrors('password');
        $this->assertGuest();
    }

    public function test_repeated_registration_attempts_are_throttled(): void
    {
        $payload = [
            'username'              => 'newuser',
            'display_name'          => 'New User',
            'email'                 => 'new@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'wrong-confirmation',
        ];

        for ($i = 0; $i < 3; $i++) {
            $this->post('/register', $payload)->assertSessionHasErrors('password');
        }

        $this->post('/register', $payload)->assertStatus(429);
    }

    public function test_manual_registration_is_rejected_when_the_manual_signup_path_is_closed(): void
    {
        InstanceSetting::factory()->create([
            'signup_manual_enabled'       => false,
            'signup_email_invite_enabled' => false,
            'signup_oauth_enabled'        => false,
        ]);

        $get = $this->get('/register');
        $get->assertRedirect('/login');

        $post = $this->post('/register', [
            'username'              => 'newuser',
            'display_name'          => 'New User',
            'email'                 => 'new@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
        ]);

        $post->assertForbidden();
        $this->assertGuest();
    }

    public function test_a_valid_server_invite_allows_registration_even_with_manual_signup_closed(): void
    {
        InstanceSetting::factory()->create([
            'signup_manual_enabled'       => false,
            'signup_email_invite_enabled' => true,
            'signup_oauth_enabled'        => false,
        ]);
        $invite = ServerInvite::factory()->create(['email' => 'invited@example.com']);

        $response = $this->post('/register', [
            'username'              => 'newuser',
            'display_name'          => 'New User',
            'email'                 => 'invited@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
            'invite_token'          => $invite->token,
        ]);

        $response->assertRedirect('/');
        $this->assertAuthenticated();
        $this->assertNotNull($invite->fresh()->accepted_at);
    }

    public function test_a_server_invite_scoped_to_one_email_rejects_a_different_email(): void
    {
        InstanceSetting::factory()->create([
            'signup_manual_enabled'       => false,
            'signup_email_invite_enabled' => true,
            'signup_oauth_enabled'        => false,
        ]);
        $invite = ServerInvite::factory()->create(['email' => 'invited@example.com']);

        $response = $this->post('/register', [
            'username'              => 'newuser',
            'display_name'          => 'New User',
            'email'                 => 'someone-else@example.com',
            'password'              => 'password123',
            'password_confirmation' => 'password123',
            'invite_token'          => $invite->token,
        ]);

        $response->assertForbidden();
        $this->assertGuest();
    }

    public function test_an_expired_or_reused_server_invite_is_rejected(): void
    {
        InstanceSetting::factory()->create([
            'signup_manual_enabled'       => false,
            'signup_email_invite_enabled' => true,
            'signup_oauth_enabled'        => false,
        ]);
        $expired = ServerInvite::factory()->create(['expires_at' => now()->subDay()]);

        $this->post('/register', [
            'username'              => 'newuser',
            'display_name'          => 'New User',
            'email'                 => $expired->email,
            'password'              => 'password123',
            'password_confirmation' => 'password123',
            'invite_token'          => $expired->token,
        ])->assertForbidden();
    }
}
