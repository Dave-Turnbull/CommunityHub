<?php

namespace Tests\Feature\Messages;

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
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * Web\MessageController::show — the "go to message" direct-link entry point
 * (see CLAUDE.md). Resolves a bare message id to its channel/conversation,
 * checks the same visibility a normal page load would, and redirects with
 * ?message= for the receiving page controller to seed a window around
 * (TextMessageService::list's `around` cursor — see MessageAroundCursorTest).
 */
class MessageLinkTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_room_member_is_redirected_to_the_channel_with_the_message_flagged(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();
        $message = Message::factory()->for($channel)->create();

        $this->actingAs($user)
            ->get("/messages/{$message->id}")
            ->assertRedirect("/channels/{$channel->id}?message={$message->id}");
    }

    public function test_a_non_member_of_the_room_cannot_resolve_a_channel_message_link(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $message = Message::factory()->for($channel)->create();

        $this->actingAs(User::factory()->create())
            ->get("/messages/{$message->id}")
            ->assertForbidden();
    }

    public function test_a_room_member_denied_by_channel_visibility_cannot_resolve_the_link(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $restrictedRole = Role::factory()->for($room)->create();
        ChannelRoleVisibility::create(['channel_id' => $channel->id, 'role_id' => $restrictedRole->id]);

        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();
        $message = Message::factory()->for($channel)->create();

        $this->actingAs($user)
            ->get("/messages/{$message->id}")
            ->assertForbidden();
    }

    public function test_see_all_channels_permission_bypasses_the_restriction_for_the_link(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $restrictedRole = Role::factory()->for($room)->create();
        ChannelRoleVisibility::create(['channel_id' => $channel->id, 'role_id' => $restrictedRole->id]);

        $staff = User::factory()->create();
        RoomMember::factory()->for($room)->for($staff)->create();
        $staffRole = Role::factory()->for($room)->create();
        $staffRole->grant(Permission::SeeAllChannels);
        RoleAssignment::factory()->for($staffRole)->for($staff)->create();

        $message = Message::factory()->for($channel)->create();

        $this->actingAs($staff)
            ->get("/messages/{$message->id}")
            ->assertRedirect("/channels/{$channel->id}?message={$message->id}");
    }

    public function test_a_participant_is_redirected_to_the_conversation_with_the_message_flagged(): void
    {
        $conversation = Conversation::create(['type' => 'dm']);
        $user = User::factory()->create();
        ConversationParticipant::create(['conversation_id' => $conversation->id, 'user_id' => $user->id]);
        $message = Message::factory()->inConversation()->create(['conversation_id' => $conversation->id]);

        $this->actingAs($user)
            ->get("/messages/{$message->id}")
            ->assertRedirect("/conversations/{$conversation->id}?message={$message->id}");
    }

    public function test_a_non_participant_cannot_resolve_a_conversation_message_link(): void
    {
        $conversation = Conversation::create(['type' => 'dm']);
        $message = Message::factory()->inConversation()->create(['conversation_id' => $conversation->id]);

        $this->actingAs(User::factory()->create())
            ->get("/messages/{$message->id}")
            ->assertForbidden();
    }

    public function test_a_deleted_message_has_nothing_to_link_to(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();
        $message = Message::factory()->for($channel)->create();
        $message->delete();

        $this->actingAs($user)
            ->get("/messages/{$message->id}")
            ->assertNotFound();
    }

    private function commentOn(Message $parent, array $attributes = []): Message
    {
        return Message::factory()->create([
            'channel_id'        => null,
            'parent_message_id' => $parent->id,
            'root_message_id'   => $parent->parent_message_id ? $parent->root_message_id : $parent->id,
            'depth'             => $parent->depth + 1,
            ...$attributes,
        ]);
    }

    public function test_a_comment_link_lands_on_its_root_message_in_the_roots_channel(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();
        $root = Message::factory()->for($channel)->create();
        $comment = $this->commentOn($root);

        $this->actingAs($user)
            ->get("/messages/{$comment->id}")
            ->assertRedirect("/channels/{$channel->id}?message={$root->id}");
    }

    public function test_a_nested_comment_link_resolves_to_the_same_root(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();
        $root = Message::factory()->for($channel)->create();
        $nested = $this->commentOn($this->commentOn($this->commentOn($root)));

        $this->actingAs($user)
            ->get("/messages/{$nested->id}")
            ->assertRedirect("/channels/{$channel->id}?message={$root->id}");
    }

    public function test_a_non_member_cannot_resolve_a_comment_link(): void
    {
        $channel = Channel::factory()->create();
        $comment = $this->commentOn(Message::factory()->for($channel)->create());

        $this->actingAs(User::factory()->create())
            ->get("/messages/{$comment->id}")
            ->assertForbidden();
    }

    public function test_a_comment_in_a_channel_hidden_from_the_user_is_forbidden(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $restrictedRole = Role::factory()->for($room)->create();
        ChannelRoleVisibility::create(['channel_id' => $channel->id, 'role_id' => $restrictedRole->id]);
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();
        $comment = $this->commentOn(Message::factory()->for($channel)->create());

        $this->actingAs($user)
            ->get("/messages/{$comment->id}")
            ->assertForbidden();
    }

    public function test_a_comment_whose_root_is_tombstoned_has_nothing_to_link_to(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();
        $root = Message::factory()->for($channel)->create();
        $comment = $this->commentOn($root);
        $root->update(['is_tombstoned' => true]);
        $root->delete();

        $this->actingAs($user)
            ->get("/messages/{$comment->id}")
            ->assertNotFound();
    }

    public function test_a_tombstoned_root_does_not_reveal_itself_to_a_non_member(): void
    {
        $channel = Channel::factory()->create();
        $root = Message::factory()->for($channel)->create();
        $comment = $this->commentOn($root);
        $root->update(['is_tombstoned' => true]);
        $root->delete();

        $this->actingAs(User::factory()->create())
            ->get("/messages/{$comment->id}")
            ->assertForbidden();
    }

    public function test_following_the_link_seeds_the_channel_page_with_a_window_around_the_message(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();

        $messages = Message::factory()
            ->for($channel)
            ->count(80)
            ->sequence(fn ($seq) => ['created_at' => now()->addSeconds($seq->index)])
            ->create();

        $target = $messages[40];

        $this->actingAs($user)
            ->get("/channels/{$channel->id}?message={$target->id}")
            ->assertInertia(fn (Assert $page) => $page
                ->component('Channels/Show')
                ->where('highlight_message_id', $target->id)
                ->where('messages.data.25.id', $target->id)
            );
    }
}
