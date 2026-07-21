<?php

namespace Tests\Feature\Broadcasting;

use App\Models\Channel;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class VoiceChannelAuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // See ChannelAuthTest — the null broadcaster's auth() is a no-op that
        // always returns 200, so it can't exercise routes/channels.php
        // authorization. Swap in the real driver with throwaway credentials.
        config([
            'broadcasting.default'                   => 'reverb',
            'broadcasting.connections.reverb.key'     => 'test-key',
            'broadcasting.connections.reverb.secret'  => 'test-secret',
            'broadcasting.connections.reverb.app_id'  => 'test-app-id',
        ]);

        require base_path('routes/channels.php');
    }

    public function test_a_room_member_can_authorize_a_voice_channel(): void
    {
        $room    = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'voice']);
        $user    = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();

        $response = $this->actingAs($user)->postJson('/broadcasting/auth', [
            'channel_name' => "presence-voice.channel.{$channel->id}",
            'socket_id'    => '1234.5678',
        ]);

        $response->assertOk();
    }

    public function test_a_non_member_cannot_authorize_a_voice_channel(): void
    {
        $channel = Channel::factory()->create(['type' => 'voice']);
        $user    = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/broadcasting/auth', [
            'channel_name' => "presence-voice.channel.{$channel->id}",
            'socket_id'    => '1234.5678',
        ]);

        $response->assertForbidden();
    }

    public function test_a_text_channels_id_cannot_authorize_the_voice_channel_name(): void
    {
        $room    = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'text']);
        $user    = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();

        $response = $this->actingAs($user)->postJson('/broadcasting/auth', [
            'channel_name' => "presence-voice.channel.{$channel->id}",
            'socket_id'    => '1234.5678',
        ]);

        $response->assertForbidden();
    }

    public function test_a_participant_can_authorize_a_conversations_voice_channel(): void
    {
        $conversation = Conversation::factory()->create();
        $user         = User::factory()->create();
        ConversationParticipant::factory()->for($conversation)->for($user)->create();

        $response = $this->actingAs($user)->postJson('/broadcasting/auth', [
            'channel_name' => "presence-voice.conversation.{$conversation->id}",
            'socket_id'    => '1234.5678',
        ]);

        $response->assertOk();
    }

    public function test_a_non_participant_cannot_authorize_a_conversations_voice_channel(): void
    {
        $conversation = Conversation::factory()->create();
        $user         = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/broadcasting/auth', [
            'channel_name' => "presence-voice.conversation.{$conversation->id}",
            'socket_id'    => '1234.5678',
        ]);

        $response->assertForbidden();
    }
}
