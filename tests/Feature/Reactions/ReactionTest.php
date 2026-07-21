<?php

namespace Tests\Feature\Reactions;

use App\Events\ReactionChanged;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Message;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class ReactionTest extends TestCase
{
    use RefreshDatabase;

    private function member(Room $room): User
    {
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();

        return $user;
    }

    private function participant(Conversation $conversation): User
    {
        $user = User::factory()->create();
        ConversationParticipant::factory()->for($conversation)->for($user)->create();

        return $user;
    }

    public function test_a_user_can_react_to_a_message(): void
    {
        Event::fake([ReactionChanged::class]);

        $message = Message::factory()->create();
        $user = $this->member($message->channel->room);

        $response = $this->actingAs($user)
            ->postJson("/api/messages/{$message->id}/reactions", ['emoji' => '👍']);

        $response->assertOk();
        $this->assertDatabaseHas('reactions', [
            'message_id' => $message->id,
            'user_id'    => $user->id,
            'emoji'      => '👍',
        ]);

        $summary = $response->json();
        $this->assertSame('👍', $summary[0]['emoji']);
        $this->assertSame(1, $summary[0]['count']);
        $this->assertTrue($summary[0]['reacted']);

        Event::assertDispatched(ReactionChanged::class);
    }

    public function test_reacting_twice_with_the_same_emoji_does_not_duplicate(): void
    {
        $message = Message::factory()->create();
        $user = $this->member($message->channel->room);

        $this->actingAs($user)->postJson("/api/messages/{$message->id}/reactions", ['emoji' => '👍']);
        $this->actingAs($user)->postJson("/api/messages/{$message->id}/reactions", ['emoji' => '👍']);

        $this->assertSame(1, $message->reactions()->count());
    }

    public function test_a_user_can_remove_their_reaction(): void
    {
        $message = Message::factory()->create();
        $user = $this->member($message->channel->room);

        $this->actingAs($user)->postJson("/api/messages/{$message->id}/reactions", ['emoji' => '👍']);

        $response = $this->actingAs($user)
            ->deleteJson("/api/messages/{$message->id}/reactions/" . urlencode('👍'));

        $response->assertOk();
        $response->assertJson([]);
        $this->assertDatabaseMissing('reactions', [
            'message_id' => $message->id,
            'user_id'    => $user->id,
            'emoji'      => '👍',
        ]);
    }

    public function test_reaction_summary_aggregates_multiple_users(): void
    {
        $message = Message::factory()->create();
        $userA = $this->member($message->channel->room);
        $userB = $this->member($message->channel->room);

        $this->actingAs($userA)->postJson("/api/messages/{$message->id}/reactions", ['emoji' => '🎉']);
        $response = $this->actingAs($userB)
            ->postJson("/api/messages/{$message->id}/reactions", ['emoji' => '🎉']);

        $summary = $response->json();
        $this->assertSame(2, $summary[0]['count']);
        // Viewer is userB, who did react.
        $this->assertTrue($summary[0]['reacted']);
    }

    public function test_a_non_member_cannot_react_to_a_channel_message(): void
    {
        $message = Message::factory()->create();
        $user = User::factory()->create();

        $response = $this->actingAs($user)
            ->postJson("/api/messages/{$message->id}/reactions", ['emoji' => '👍']);

        $response->assertForbidden();
    }

    public function test_a_non_member_cannot_remove_a_reaction_on_a_channel_message(): void
    {
        $message = Message::factory()->create();
        $user = User::factory()->create();

        $response = $this->actingAs($user)
            ->deleteJson("/api/messages/{$message->id}/reactions/" . urlencode('👍'));

        $response->assertForbidden();
    }

    public function test_a_non_participant_cannot_react_to_a_conversation_message(): void
    {
        $message = Message::factory()->inConversation()->create();
        $user = User::factory()->create();

        $response = $this->actingAs($user)
            ->postJson("/api/messages/{$message->id}/reactions", ['emoji' => '👍']);

        $response->assertForbidden();
    }

    public function test_a_participant_can_react_to_a_conversation_message(): void
    {
        Event::fake([ReactionChanged::class]);

        $message = Message::factory()->inConversation()->create();
        $user = $this->participant($message->conversation);

        $response = $this->actingAs($user)
            ->postJson("/api/messages/{$message->id}/reactions", ['emoji' => '👍']);

        $response->assertOk();
    }
}
