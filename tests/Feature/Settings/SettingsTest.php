<?php

namespace Tests\Feature\Settings;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_can_update_their_profile(): void
    {
        $user = User::factory()->create(['display_name' => 'Old Name']);

        $response = $this->actingAs($user)->patch('/settings', [
            'display_name' => 'New Name',
            'bio'           => 'Hello there',
        ]);

        $response->assertRedirect();
        $response->assertSessionHas('success');

        $user->refresh();
        $this->assertSame('New Name', $user->display_name);
        $this->assertSame('Hello there', $user->bio);
    }

    public function test_a_guest_cannot_update_settings(): void
    {
        $response = $this->patch('/settings', ['display_name' => 'Nope']);

        $response->assertRedirect('/login');
    }
}
