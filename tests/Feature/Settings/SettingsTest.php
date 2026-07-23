<?php

namespace Tests\Feature\Settings;

use App\Events\UserStatusChanged;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class SettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_can_update_their_profile(): void
    {
        $user = User::factory()->create(['display_name' => 'Old Name']);

        $response = $this->actingAs($user)->patch('/settings', [
            'display_name'  => 'New Name',
            'bio'           => 'Hello there',
            'status'        => 'dnd',
            'custom_status' => 'Busy',
        ]);

        $response->assertRedirect();
        $response->assertSessionHas('success');

        $user->refresh();
        $this->assertSame('New Name', $user->display_name);
        $this->assertSame('Hello there', $user->bio);
        $this->assertSame('dnd', $user->status);
        $this->assertSame('Busy', $user->custom_status);
    }

    public function test_changing_status_broadcasts_it_live_to_already_connected_sessions(): void
    {
        Event::fake([UserStatusChanged::class]);
        $user = User::factory()->create(['status' => 'online']);

        $this->actingAs($user)->patch('/settings', ['status' => 'dnd']);

        Event::assertDispatched(
            UserStatusChanged::class,
            fn (UserStatusChanged $event) => $event->userId === $user->id && $event->status === 'dnd'
        );
    }

    public function test_status_must_be_a_valid_enum_value(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->patch('/settings', ['status' => 'not-a-status']);

        $response->assertSessionHasErrors('status');
    }

    public function test_a_guest_cannot_update_settings(): void
    {
        $response = $this->patch('/settings', ['display_name' => 'Nope']);

        $response->assertRedirect('/login');
    }
}
