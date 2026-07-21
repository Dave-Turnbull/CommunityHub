<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LogoutTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_can_logout(): void
    {
        $user = User::factory()->create(['status' => 'online']);

        $response = $this->actingAs($user)->post('/logout');

        $response->assertRedirect('/login');
        $this->assertGuest();
        $this->assertSame('offline', $user->fresh()->status);
    }

    public function test_a_guest_cannot_logout(): void
    {
        $response = $this->post('/logout');

        $response->assertRedirect('/login');
    }
}
