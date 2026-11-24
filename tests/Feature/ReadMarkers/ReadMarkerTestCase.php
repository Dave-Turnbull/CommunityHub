<?php

namespace Tests\Feature\ReadMarkers;

use App\Models\Channel;
use App\Models\ChannelRoleVisibility;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Message;
use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

abstract class ReadMarkerTestCase extends TestCase
{
    use RefreshDatabase;

    protected Carbon $now;

    protected function setUp(): void
    {
        parent::setUp();

        $this->now = Carbon::parse('2025-01-10 12:00:00');
        Carbon::setTestNow($this->now);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    protected function memberOf(Room $room, ?Carbon $joinedAt = null): User
    {
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create(['joined_at' => $joinedAt ?? $this->now->copy()->subDay()]);

        return $user;
    }

    protected function participantIn(Conversation $conversation, ?Carbon $joinedAt = null): User
    {
        $user = User::factory()->create();
        ConversationParticipant::factory()->for($conversation)->for($user)->create([
            'created_at' => $joinedAt ?? $this->now->copy()->subDay(),
        ]);

        return $user;
    }

    protected function channelMessage(Channel $channel, ?Carbon $at = null, array $attributes = []): Message
    {
        return Message::factory()->create($attributes + [
            'channel_id' => $channel->id,
            'created_at' => $at ?? $this->now->copy()->subHour(),
        ]);
    }

    protected function conversationMessage(Conversation $conversation, ?Carbon $at = null, array $attributes = []): Message
    {
        return Message::factory()->create($attributes + [
            'channel_id'      => null,
            'conversation_id' => $conversation->id,
            'created_at'      => $at ?? $this->now->copy()->subHour(),
        ]);
    }

    protected function restrictToNewRole(Channel $channel, User ...$allowed): Role
    {
        $role = Role::factory()->for($channel->room)->create();
        foreach ($allowed as $user) {
            RoleAssignment::factory()->for($role)->for($user)->create();
        }
        ChannelRoleVisibility::create(['channel_id' => $channel->id, 'role_id' => $role->id]);

        return $role;
    }
}
