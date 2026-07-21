<?php

namespace Tests\Feature\Notifications;

use App\Models\NotificationPreference;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationPreferenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_can_list_the_effective_preference_for_every_category(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->getJson('/api/notification-preferences');

        $response->assertOk();
        $response->assertJsonFragment(['category' => 'room_invite', 'email' => true, 'in_app' => true]);
        $response->assertJsonFragment(['category' => 'room_message', 'email' => false, 'in_app' => false]);
        $response->assertJsonFragment(['category' => 'direct_message', 'email' => false, 'in_app' => true]);
    }

    public function test_listing_reflects_a_stored_override(): void
    {
        $user = User::factory()->create();
        NotificationPreference::factory()->for($user)->create([
            'category' => 'room_message',
            'email'    => true,
            'in_app'   => true,
        ]);

        $response = $this->actingAs($user)->getJson('/api/notification-preferences');

        // assertJsonFragment checks each field's presence anywhere in the payload,
        // not that they co-occur on one element — not strict enough here, since
        // the untouched categories' defaults could coincidentally supply the same
        // values. Pull the one entry out and compare it directly instead.
        $entry = collect($response->json())->firstWhere('category', 'room_message');
        $this->assertSame(['category' => 'room_message', 'email' => true, 'in_app' => true], $entry);
    }

    public function test_a_user_can_update_a_preference(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->putJson('/api/notification-preferences', [
            'category' => 'room_message',
            'email'    => true,
            'in_app'   => true,
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('notification_preferences', [
            'user_id'  => $user->id,
            'category' => 'room_message',
            'email'    => true,
            'in_app'   => true,
        ]);
    }

    public function test_direct_message_in_app_cannot_be_disabled(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->putJson('/api/notification-preferences', [
            'category' => 'direct_message',
            'email'    => false,
            'in_app'   => false,
        ]);

        $response->assertUnprocessable();
        $this->assertDatabaseMissing('notification_preferences', ['user_id' => $user->id, 'category' => 'direct_message']);
    }

    public function test_direct_message_email_can_still_be_toggled(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->putJson('/api/notification-preferences', [
            'category' => 'direct_message',
            'email'    => true,
            'in_app'   => true,
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('notification_preferences', [
            'user_id' => $user->id, 'category' => 'direct_message', 'email' => true, 'in_app' => true,
        ]);
    }

    public function test_updating_a_preference_twice_overwrites_rather_than_duplicates(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->putJson('/api/notification-preferences', [
            'category' => 'room_invite', 'email' => false, 'in_app' => true,
        ]);
        $this->actingAs($user)->putJson('/api/notification-preferences', [
            'category' => 'room_invite', 'email' => true, 'in_app' => true,
        ]);

        $this->assertSame(1, NotificationPreference::where('user_id', $user->id)->where('category', 'room_invite')->count());
        $this->assertTrue(NotificationPreference::where('user_id', $user->id)->first()->email);
    }

    public function test_an_unknown_category_is_rejected(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->putJson('/api/notification-preferences', [
            'category' => 'not-a-real-category',
            'email'    => true,
            'in_app'   => true,
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors('category');
    }

    public function test_a_guest_cannot_view_or_update_preferences(): void
    {
        $this->getJson('/api/notification-preferences')->assertUnauthorized();
        $this->putJson('/api/notification-preferences', [
            'category' => 'room_invite', 'email' => true, 'in_app' => true,
        ])->assertUnauthorized();
    }
}
