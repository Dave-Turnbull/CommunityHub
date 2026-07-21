<?php

namespace Tests\Feature\Messages;

use App\Events\MessageSent;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class ConversationMessageTest extends TestCase
{
    use RefreshDatabase;

    private function participant(Conversation $conversation): User
    {
        $user = User::factory()->create();
        ConversationParticipant::factory()->for($conversation)->for($user)->create();

        return $user;
    }

    public function test_a_participant_can_send_a_conversation_message(): void
    {
        Event::fake([MessageSent::class]);

        $conversation = Conversation::factory()->create();
        $user = $this->participant($conversation);

        $response = $this->actingAs($user)
            ->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'Hey!']);

        $response->assertCreated();
        $this->assertDatabaseHas('messages', [
            'conversation_id' => $conversation->id,
            'author_id'       => $user->id,
            'content'         => 'Hey!',
        ]);

        Event::assertDispatched(MessageSent::class, fn ($e) => $e->scopeType === 'conversation' && $e->scopeId === $conversation->id);
    }

    public function test_a_non_participant_cannot_send_a_conversation_message(): void
    {
        $conversation = Conversation::factory()->create();
        $user = User::factory()->create();

        $response = $this->actingAs($user)
            ->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'Hey!']);

        $response->assertForbidden();
    }

    public function test_a_non_participant_cannot_list_conversation_messages(): void
    {
        $conversation = Conversation::factory()->create();
        $user = User::factory()->create();

        $response = $this->actingAs($user)->getJson("/api/conversations/{$conversation->id}/messages");

        $response->assertForbidden();
    }

    public function test_a_participant_can_list_conversation_messages(): void
    {
        $conversation = Conversation::factory()->create();
        $user = $this->participant($conversation);
        $message = Message::factory()->inConversation()->create(['conversation_id' => $conversation->id]);

        $response = $this->actingAs($user)->getJson("/api/conversations/{$conversation->id}/messages");

        $response->assertOk();
        $response->assertJsonPath('data.0.id', $message->id);
    }
}
