<?php

namespace Tests\Feature\Messages;

use App\Models\Channel;
use App\Models\ChannelRoleVisibility;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Message;
use App\Models\Role;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
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
