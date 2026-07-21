<?php

namespace Tests\Feature\Channels;

use App\Models\Channel;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Channel::TEXT_CAPABLE_TYPES is an allow-list, not a "block voice" special
 * case — a channel type has no text chat unless explicitly listed. The
 * 'drawing' type here isn't real yet; it stands in for any future custom
 * channel type, proving the guard covers it by default with no code change.
 */
class ChannelTextCapabilityGuardTest extends TestCase
{
    use RefreshDatabase;

    private function member(Room $room): User
    {
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();

        return $user;
    }

    public function test_a_member_cannot_post_a_text_message_into_a_voice_channel(): void
    {
        $room    = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'voice']);
        $user    = $this->member($room);

        $response = $this->actingAs($user)
            ->postJson("/api/channels/{$channel->id}/messages", ['content' => 'Hello!']);

        $response->assertStatus(422);
        $this->assertDatabaseCount('messages', 0);
    }

    public function test_a_member_cannot_list_messages_for_a_voice_channel(): void
    {
        $room    = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'voice']);
        $user    = $this->member($room);

        $response = $this->actingAs($user)->getJson("/api/channels/{$channel->id}/messages");

        $response->assertStatus(422);
    }

    public function test_a_member_cannot_post_into_an_arbitrary_unrecognized_channel_type(): void
    {
        $room    = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'drawing']);
        $user    = $this->member($room);

        $response = $this->actingAs($user)
            ->postJson("/api/channels/{$channel->id}/messages", ['content' => 'Hello!']);

        $response->assertStatus(422);
        $this->assertDatabaseCount('messages', 0);
    }

    public function test_a_member_cannot_list_messages_for_an_arbitrary_unrecognized_channel_type(): void
    {
        $room    = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'drawing']);
        $user    = $this->member($room);

        $response = $this->actingAs($user)->getJson("/api/channels/{$channel->id}/messages");

        $response->assertStatus(422);
    }

    public function test_announcement_channels_remain_text_capable(): void
    {
        $room    = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'announcement']);
        $user    = $this->member($room);

        $response = $this->actingAs($user)
            ->postJson("/api/channels/{$channel->id}/messages", ['content' => 'Hello!']);

        $response->assertCreated();
    }
}
