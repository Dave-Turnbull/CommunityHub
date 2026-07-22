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

class ChannelAuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Suite-wide phpunit.xml sets BROADCAST_CONNECTION=null so ordinary
        // Feature tests don't need broadcaster credentials; the null driver's
        // auth() is a no-op that always returns 200, so it can't exercise
        // routes/channels.php authorization. Swap in the real (Pusher-protocol
        // compatible) driver with throwaway credentials just for this class.
        config([
            'broadcasting.default'                   => 'reverb',
            'broadcasting.connections.reverb.key'     => 'test-key',
            'broadcasting.connections.reverb.secret'  => 'test-secret',
            'broadcasting.connections.reverb.app_id'  => 'test-app-id',
        ]);

        // routes/channels.php ran at boot against the (still-null) default
        // connection, so its Broadcast::channel() calls registered on the null
        // broadcaster's registry. Re-require it now that reverb is the
        // default so the same closures register on the driver we just swapped in.
        require base_path('routes/channels.php');
    }

    public function test_a_room_member_can_authorize_the_channel_presence_channel(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();

        $response = $this->actingAs($user)->postJson('/broadcasting/auth', [
            'channel_name' => "presence-channel.{$channel->id}",
            'socket_id'    => '1234.5678',
        ]);

        $response->assertOk();
    }

    public function test_a_non_member_cannot_authorize_the_channel_presence_channel(): void
    {
        $channel = Channel::factory()->create();
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/broadcasting/auth', [
            'channel_name' => "presence-channel.{$channel->id}",
            'socket_id'    => '1234.5678',
        ]);

        $response->assertForbidden();
    }

    public function test_a_participant_can_authorize_the_conversation_private_channel(): void
    {
        $conversation = Conversation::factory()->create();
        $user = User::factory()->create();
        ConversationParticipant::factory()->for($conversation)->for($user)->create();

        $response = $this->actingAs($user)->postJson('/broadcasting/auth', [
            'channel_name' => "private-conversation.{$conversation->id}",
            'socket_id'    => '1234.5678',
        ]);

        $response->assertOk();
    }

    public function test_a_non_participant_cannot_authorize_the_conversation_private_channel(): void
    {
        $conversation = Conversation::factory()->create();
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/broadcasting/auth', [
            'channel_name' => "private-conversation.{$conversation->id}",
            'socket_id'    => '1234.5678',
        ]);

        $response->assertForbidden();
    }

    public function test_a_room_member_can_authorize_the_room_private_channel(): void
    {
        $room = Room::factory()->create();
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();

        $response = $this->actingAs($user)->postJson('/broadcasting/auth', [
            'channel_name' => "private-room.{$room->id}",
            'socket_id'    => '1234.5678',
        ]);

        $response->assertOk();
    }

    public function test_a_non_member_cannot_authorize_the_room_private_channel(): void
    {
        $room = Room::factory()->create();
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/broadcasting/auth', [
            'channel_name' => "private-room.{$room->id}",
            'socket_id'    => '1234.5678',
        ]);

        $response->assertForbidden();
    }

    public function test_a_user_can_authorize_their_own_private_channel(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/broadcasting/auth', [
            'channel_name' => "private-App.Models.User.{$user->id}",
            'socket_id'    => '1234.5678',
        ]);

        $response->assertOk();
    }

    public function test_a_user_cannot_authorize_another_users_private_channel(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/broadcasting/auth', [
            'channel_name' => "private-App.Models.User.{$other->id}",
            'socket_id'    => '1234.5678',
        ]);

        $response->assertForbidden();
    }
}
