<?php

namespace Tests\Feature\Conversations;

use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ConversationShowTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_participant_can_view_a_conversation_with_its_messages(): void
    {
        $conversation = Conversation::factory()->create();
        $user = User::factory()->create();
        ConversationParticipant::factory()->for($conversation)->for($user)->create();
        $message = Message::factory()->create([
            'channel_id'      => null,
            'conversation_id' => $conversation->id,
        ]);

        $response = $this->actingAs($user)->get("/conversations/{$conversation->id}");

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page
            ->component('DM/Show')
            ->where('conversation.id', $conversation->id)
            ->where('messages.data.0.id', $message->id)
        );
    }

    public function test_a_non_participant_cannot_view_a_conversation(): void
    {
        $conversation = Conversation::factory()->create();
        $user = User::factory()->create();

        $response = $this->actingAs($user)->get("/conversations/{$conversation->id}");

        $response->assertForbidden();
    }

    public function test_the_dm_hub_renders_for_an_authenticated_user(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->get('/');

        $response->assertOk();
        $response->assertInertia(fn (Assert $page) => $page->component('DM/Index'));
    }
}
