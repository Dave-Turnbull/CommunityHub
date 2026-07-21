<?php

namespace Tests\Feature\Voice;

use App\Models\Channel;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ChannelShowVoiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_viewing_a_voice_channel_does_not_load_messages(): void
    {
        $room = Room::factory()->create();
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'voice']);

        $response = $this->actingAs($user)->get("/channels/{$channel->id}");

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('Channels/Show')
            ->where('channel.id', $channel->id)
            ->where('messages', null)
        );
    }

    public function test_viewing_a_text_channel_still_loads_messages(): void
    {
        $room = Room::factory()->create();
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'text']);

        $response = $this->actingAs($user)->get("/channels/{$channel->id}");

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('Channels/Show')
            ->has('messages.data')
        );
    }
}
