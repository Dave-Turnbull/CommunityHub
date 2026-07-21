<?php

namespace Tests\Unit\Models;

use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ConversationTest extends TestCase
{
    use RefreshDatabase;

    public function test_has_participant_reflects_membership(): void
    {
        $conversation = Conversation::factory()->create();
        $participant = User::factory()->create();
        $stranger = User::factory()->create();
        ConversationParticipant::factory()->for($conversation)->for($participant)->create();

        $this->assertTrue($conversation->hasParticipant($participant->id));
        $this->assertFalse($conversation->hasParticipant($stranger->id));
    }
}
