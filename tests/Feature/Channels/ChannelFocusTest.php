<?php

namespace Tests\Feature\Channels;

use App\Models\Channel;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use App\Support\ChannelFocus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class ChannelFocusTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    private function member(Room $room): User
    {
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();

        return $user;
    }

    public function test_a_room_member_can_mark_a_channel_focused(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = $this->member($room);

        $response = $this->actingAs($user)->postJson("/api/channels/{$channel->id}/focus");

        $response->assertOk();
        $this->assertTrue(ChannelFocus::isFocused($user->id, $channel->id));
    }

    public function test_a_room_member_can_mark_a_channel_blurred(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = $this->member($room);
        ChannelFocus::focus($user->id, $channel->id);

        $response = $this->actingAs($user)->postJson("/api/channels/{$channel->id}/blur");

        $response->assertOk();
        $this->assertFalse(ChannelFocus::isFocused($user->id, $channel->id));
    }

    public function test_a_non_member_cannot_focus_a_channel(): void
    {
        $channel = Channel::factory()->create();
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson("/api/channels/{$channel->id}/focus");

        $response->assertForbidden();
        $this->assertFalse(ChannelFocus::isFocused($user->id, $channel->id));
    }

    public function test_a_guest_cannot_focus_a_channel(): void
    {
        $channel = Channel::factory()->create();

        $response = $this->postJson("/api/channels/{$channel->id}/focus");

        $response->assertUnauthorized();
    }
}
