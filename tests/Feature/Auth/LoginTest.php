<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class LoginTest extends TestCase
{
    use RefreshDatabase;

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
}
