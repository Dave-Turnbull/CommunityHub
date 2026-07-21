<?php

namespace Tests\Feature\Channels;

use App\Models\Channel;
use App\Models\Message;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ChannelShowTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_member_can_view_a_channel_with_its_messages(): void
    {
        $room = Room::factory()->create();
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();
        $channel = Channel::factory()->for($room)->create();
        $message = Message::factory()->for($channel)->create(['content' => 'Hello world']);

        $response = $this->actingAs($user)->get("/channels/{$channel->id}");

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('Channels/Show')
            ->where('channel.id', $channel->id)
            ->where('messages.data.0.id', $message->id)
        );
    }

    public function test_a_non_member_cannot_view_a_channel(): void
    {
        $channel = Channel::factory()->create();
        $user = User::factory()->create();

        $response = $this->actingAs($user)->get("/channels/{$channel->id}");

        $response->assertForbidden();
    }

    public function test_a_guest_is_redirected_to_login(): void
    {
        $channel = Channel::factory()->create();

        $response = $this->get("/channels/{$channel->id}");

        $response->assertRedirect('/login');
    }
}
