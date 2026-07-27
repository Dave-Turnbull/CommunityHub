<?php

namespace Tests\Feature\Conversations;

use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * SendDirectMessages is granted to the global Member role by default (see
 * UserFactory::configure()) — these tests strip it via a dedicated
 * "Restricted" global role, the supported moderation workflow described in
 * docs/roles-and-permissions.md.
 */
class DirectMessagePermissionTest extends TestCase
{
    use RefreshDatabase;

    private function shareARoom(User ...$users): void
    {
        $room = Room::factory()->create();
        foreach ($users as $user) {
            RoomMember::factory()->for($room)->for($user)->create();
        }
    }

    /** Moves $user off the global Member role (which grants SendDirectMessages) onto a bare Restricted role. */
    private function restrict(User $user): void
    {
        $memberRole = Role::whereNull('room_id')->where('is_default', true)->firstOrFail();
        RoleAssignment::where('role_id', $memberRole->id)->where('user_id', $user->id)->delete();

        $restricted = Role::factory()->global()->create(['name' => 'Restricted']);
        RoleAssignment::factory()->for($restricted)->for($user)->create();
    }

    public function test_a_restricted_user_cannot_start_a_new_conversation(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $this->shareARoom($alice, $bob);
        $this->restrict($alice);

        $response = $this->actingAs($alice)->postJson('/api/conversations', [
            'user_ids' => [$bob->id],
            'content'  => 'Hey Bob',
        ]);

        $response->assertForbidden();
        $this->assertDatabaseCount('conversations', 0);
    }

    public function test_a_restricted_user_cannot_send_in_an_existing_conversation(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $this->shareARoom($alice, $bob);

        $conversation = Conversation::create(['type' => 'dm']);
        ConversationParticipant::create(['conversation_id' => $conversation->id, 'user_id' => $alice->id]);
        ConversationParticipant::create(['conversation_id' => $conversation->id, 'user_id' => $bob->id]);

        $this->restrict($alice);

        $response = $this->actingAs($alice)->postJson("/api/conversations/{$conversation->id}/messages", [
            'content' => 'Still trying to talk',
        ]);

        $response->assertForbidden();
    }

    public function test_a_restricted_user_can_still_receive_messages(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $this->shareARoom($alice, $bob);

        $conversation = Conversation::create(['type' => 'dm']);
        ConversationParticipant::create(['conversation_id' => $conversation->id, 'user_id' => $alice->id]);
        ConversationParticipant::create(['conversation_id' => $conversation->id, 'user_id' => $bob->id]);

        $this->restrict($alice);

        $response = $this->actingAs($alice)->getJson("/api/conversations/{$conversation->id}/messages");

        $response->assertOk();
    }

    public function test_a_non_restricted_user_can_start_and_send(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $this->shareARoom($alice, $bob);

        $response = $this->actingAs($alice)->postJson('/api/conversations', [
            'user_ids' => [$bob->id],
            'content'  => 'Hey Bob',
        ]);

        $response->assertCreated();
    }

    public function test_a_restricted_user_cannot_add_participants_to_a_group(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $carol = User::factory()->create();
        $this->shareARoom($alice, $bob, $carol);

        $group = Conversation::create(['type' => 'group', 'name' => 'Group Chat']);
        ConversationParticipant::create(['conversation_id' => $group->id, 'user_id' => $alice->id]);
        ConversationParticipant::create(['conversation_id' => $group->id, 'user_id' => $bob->id]);

        $this->restrict($alice);

        $response = $this->actingAs($alice)->postJson("/api/conversations/{$group->id}/participants", [
            'user_ids' => [$carol->id],
        ]);

        $response->assertForbidden();
        $this->assertDatabaseMissing('conversation_participants', ['conversation_id' => $group->id, 'user_id' => $carol->id]);
    }

    public function test_a_non_restricted_user_can_add_participants_to_a_group(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $carol = User::factory()->create();
        $this->shareARoom($alice, $bob, $carol);

        $group = Conversation::create(['type' => 'group', 'name' => 'Group Chat']);
        ConversationParticipant::create(['conversation_id' => $group->id, 'user_id' => $alice->id]);
        ConversationParticipant::create(['conversation_id' => $group->id, 'user_id' => $bob->id]);

        $response = $this->actingAs($alice)->postJson("/api/conversations/{$group->id}/participants", [
            'user_ids' => [$carol->id],
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('conversation_participants', ['conversation_id' => $group->id, 'user_id' => $carol->id]);
    }
}
