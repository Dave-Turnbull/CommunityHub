<?php

namespace Tests\Feature\Rooms;

use App\Models\Room;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoomCreationTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_can_create_a_room_and_becomes_the_owner_and_member(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->post('/rooms', [
            'name' => 'My Cool Room',
        ]);

        $room = Room::where('name', 'My Cool Room')->firstOrFail();

        $this->assertSame($user->id, $room->owner_id);
        $this->assertTrue($room->hasMember($user->id));
        $this->assertNotEmpty($room->invite_code);
    }

    public function test_creating_a_room_also_creates_a_general_channel_and_redirects_to_it(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->post('/rooms', [
            'name' => 'My Cool Room',
        ]);

        $room    = Room::where('name', 'My Cool Room')->firstOrFail();
        $channel = $room->channels()->where('type', 'text')->firstOrFail();

        $this->assertSame('general', $channel->name);
        $this->assertSame('text', $channel->type);
        $response->assertRedirect("/channels/{$channel->id}");
    }

    public function test_creating_a_room_also_creates_a_default_voice_channel(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->post('/rooms', ['name' => 'My Cool Room']);

        $room  = Room::where('name', 'My Cool Room')->firstOrFail();
        $voice = $room->channels()->where('type', 'voice')->firstOrFail();

        $this->assertSame('Voice Chat', $voice->name);
        $this->assertSame(1, $voice->position);
        $this->assertCount(2, $room->channels);
    }

    public function test_default_channels_get_settings_seeded_from_their_channel_type(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->post('/rooms', ['name' => 'My Cool Room']);

        $room = Room::where('name', 'My Cool Room')->firstOrFail();

        foreach ($room->channels as $channel) {
            $this->assertSame([], $channel->settings);
        }
    }

    public function test_room_name_is_required(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->post('/rooms', ['name' => '']);

        $response->assertSessionHasErrors('name');
    }

    public function test_a_guest_cannot_create_a_room(): void
    {
        $response = $this->post('/rooms', ['name' => 'Nope']);

        $response->assertRedirect('/login');
        $this->assertDatabaseCount('rooms', 0);
    }
}
