<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Support\Permission;
use App\Support\PermissionChecker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RegistrationTest extends TestCase
{
    use RefreshDatabase;

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
}
