<?php

namespace Tests\Feature\Messages;

use App\Events\MessageDeleted;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class MessageDeleteTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_author_can_delete_their_message(): void
    {
        Event::fake([MessageDeleted::class]);

        $author = User::factory()->create();
        $message = Message::factory()->create(['author_id' => $author->id]);

        $response = $this->actingAs($author)->deleteJson("/api/messages/{$message->id}");

        $response->assertOk();
        $response->assertJson(['deleted' => true]);
        $this->assertSoftDeleted('messages', ['id' => $message->id]);

        Event::assertDispatched(MessageDeleted::class);
    }

    public function test_a_non_author_cannot_delete_a_message(): void
    {
        $author = User::factory()->create();
        $other = User::factory()->create();
        $message = Message::factory()->create(['author_id' => $author->id]);

        $response = $this->actingAs($other)->deleteJson("/api/messages/{$message->id}");

        $response->assertForbidden();
        $this->assertDatabaseHas('messages', ['id' => $message->id, 'deleted_at' => null]);
    }
}
