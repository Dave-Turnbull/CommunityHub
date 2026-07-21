<?php

namespace Tests\Feature\Rooms;

use App\Models\Channel;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoomShowTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_member_visiting_a_room_is_redirected_to_its_first_text_channel(): void
    {
        $room = Room::factory()->create();
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'text', 'position' => 0]);

        $response = $this->actingAs($user)->get("/rooms/{$room->id}");

        $response->assertRedirect("/channels/{$channel->id}");
    }

    public function test_a_non_member_cannot_view_a_room(): void
    {
        $room = Room::factory()->create();
        $user = User::factory()->create();

        $response = $this->actingAs($user)->get("/rooms/{$room->id}");

        $response->assertForbidden();
    }
}
