<?php

namespace Tests\Feature\Auth;

use App\Events\UserStatusChanged;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class LoginTest extends TestCase
{
    use RefreshDatabase;

    // POST /login is throttled (see routes/web.php) — the throttle middleware
    // counts attempts in the cache store, which isn't reset by
    // RefreshDatabase, so an earlier test's attempts would otherwise leak
    // into this one and trip a stray 429 (see the analogous ChannelFocus
    // convention in CLAUDE.md's Testing section).
    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    public function test_a_user_can_login_with_email(): void
    {
        $user = User::factory()->create([
            'email'    => 'alice@example.com',
            'password' => Hash::make('password'),
            'status'   => 'offline',
        ]);

        $response = $this->post('/login', [
            'login'    => 'alice@example.com',
            'password' => 'password',
        ]);

        $response->assertRedirect('/');
        $this->assertAuthenticatedAs($user);
        $this->assertSame('online', $user->fresh()->status);
    }

    public function test_logging_in_forces_online_and_clears_any_existing_custom_status(): void
    {
        $user = User::factory()->create([
            'email'    => 'alice@example.com',
            'password' => Hash::make('password'),
            'status'   => 'custom',
            'custom_status' => 'On vacation',
            'custom_status_color' => '#112233',
        ]);

        $this->post('/login', ['login' => 'alice@example.com', 'password' => 'password']);

        $user->refresh();
        $this->assertSame('online', $user->status);
        $this->assertNull($user->custom_status);
        $this->assertNull($user->custom_status_color);
    }

    public function test_a_user_can_login_with_username(): void
    {
        $user = User::factory()->create([
            'username' => 'alice',
            'password' => Hash::make('password'),
            'status'   => 'offline',
        ]);

        $response = $this->post('/login', [
            'login'    => 'alice',
            'password' => 'password',
        ]);

        $response->assertRedirect('/');
        $this->assertAuthenticatedAs($user);
        $this->assertSame('online', $user->fresh()->status);
    }

    public function test_login_broadcasts_the_forced_online_status_live(): void
    {
        Event::fake([UserStatusChanged::class]);
        $user = User::factory()->create([
            'email'    => 'alice@example.com',
            'password' => Hash::make('password'),
            'status'   => 'offline',
        ]);

        $this->post('/login', ['login' => 'alice@example.com', 'password' => 'password']);

        Event::assertDispatched(
            UserStatusChanged::class,
            fn (UserStatusChanged $event) => $event->userId === $user->id && $event->status === 'online'
        );
    }

    public function test_login_fails_with_incorrect_password(): void
    {
        User::factory()->create([
            'email'    => 'alice@example.com',
            'password' => Hash::make('password'),
        ]);

        $response = $this->post('/login', [
            'login'    => 'alice@example.com',
            'password' => 'wrong-password',
        ]);

        $response->assertSessionHasErrors('login');
        $this->assertGuest();
    }

    public function test_login_fails_for_unknown_email(): void
    {
        $response = $this->post('/login', [
            'login'    => 'nobody@example.com',
            'password' => 'password',
        ]);

        $response->assertSessionHasErrors('login');
        $this->assertGuest();
    }

    public function test_login_fails_for_unknown_username(): void
    {
        $response = $this->post('/login', [
            'login'    => 'nobody',
            'password' => 'password',
        ]);

        $response->assertSessionHasErrors('login');
        $this->assertGuest();
    }

    public function test_an_authenticated_user_is_redirected_away_from_login(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->get('/login');

        $response->assertRedirect('/');
    }

    public function test_repeated_login_attempts_are_throttled(): void
    {
        $credentials = ['login' => 'nobody@example.com', 'password' => 'wrong'];

        for ($i = 0; $i < 5; $i++) {
            $this->post('/login', $credentials)->assertSessionHasErrors('login');
        }

        $this->post('/login', $credentials)->assertStatus(429);
    }
}
