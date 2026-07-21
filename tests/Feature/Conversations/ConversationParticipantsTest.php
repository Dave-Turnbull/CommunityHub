<?php

namespace Tests\Feature\Conversations;

use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ConversationParticipantsTest extends TestCase
{
    use RefreshDatabase;

    private function shareARoom(User ...$users): void
    {
        $room = Room::factory()->create();
        foreach ($users as $user) {
            RoomMember::factory()->for($room)->for($user)->create();
        }
    }

    public function test_a_participant_can_add_new_shared_room_users(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $dave = User::factory()->create();
        $this->shareARoom($alice, $bob, $dave);

        $group = Conversation::factory()->create(['type' => 'group', 'name' => 'Squad']);
        ConversationParticipant::factory()->for($group)->for($alice)->create();
        ConversationParticipant::factory()->for($group)->for($bob)->create();

        $response = $this->actingAs($alice)->postJson("/api/conversations/{$group->id}/participants", [
            'user_ids' => [$dave->id],
        ]);

        $response->assertOk();
        $this->assertTrue($group->fresh()->hasParticipant($dave->id));
        $this->assertSame(1, $dave->appNotifications()->where('type', 'direct_message')->count());
    }

    public function test_a_non_participant_cannot_add_participants(): void
    {
        $outsider = User::factory()->create();
        $bob = User::factory()->create();
        $dave = User::factory()->create();
        $this->shareARoom($outsider, $bob, $dave);

        $group = Conversation::factory()->create(['type' => 'group']);
        ConversationParticipant::factory()->for($group)->for($bob)->create();

        $response = $this->actingAs($outsider)->postJson("/api/conversations/{$group->id}/participants", [
            'user_ids' => [$dave->id],
        ]);

        $response->assertForbidden();
    }

    public function test_participants_cannot_be_added_to_a_dm(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $carol = User::factory()->create();
        $this->shareARoom($alice, $bob, $carol);

        $dm = Conversation::factory()->create(['type' => 'dm']);
        ConversationParticipant::factory()->for($dm)->for($alice)->create();
        ConversationParticipant::factory()->for($dm)->for($bob)->create();

        $response = $this->actingAs($alice)->postJson("/api/conversations/{$dm->id}/participants", [
            'user_ids' => [$carol->id],
        ]);

        $response->assertForbidden();
    }

    public function test_it_rejects_adding_a_user_without_a_shared_room(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $stranger = User::factory()->create();
        $this->shareARoom($alice, $bob);

        $group = Conversation::factory()->create(['type' => 'group']);
        ConversationParticipant::factory()->for($group)->for($alice)->create();
        ConversationParticipant::factory()->for($group)->for($bob)->create();

        $response = $this->actingAs($alice)->postJson("/api/conversations/{$group->id}/participants", [
            'user_ids' => [$stranger->id],
        ]);

        $response->assertForbidden();
        $this->assertFalse($group->fresh()->hasParticipant($stranger->id));
    }
}
