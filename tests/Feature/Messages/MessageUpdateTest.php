<?php

namespace Tests\Feature\Messages;

use App\Events\MessageUpdated;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class MessageUpdateTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_author_can_edit_their_message(): void
    {
        Event::fake([MessageUpdated::class]);

        $author = User::factory()->create();
        $message = Message::factory()->create(['author_id' => $author->id, 'content' => 'original']);

        $response = $this->actingAs($author)
            ->patchJson("/api/messages/{$message->id}", ['content' => 'edited']);

        $response->assertOk();
        $response->assertJsonPath('content', 'edited');
        $response->assertJsonPath('is_edited', true);

        $this->assertDatabaseHas('messages', [
            'id'        => $message->id,
            'content'   => 'edited',
            'is_edited' => true,
        ]);

        Event::assertDispatched(MessageUpdated::class);
    }

    public function test_a_non_author_cannot_edit_a_message(): void
    {
        $author = User::factory()->create();
        $other = User::factory()->create();
        $message = Message::factory()->create(['author_id' => $author->id, 'content' => 'original']);

        $response = $this->actingAs($other)
            ->patchJson("/api/messages/{$message->id}", ['content' => 'hacked']);

        $response->assertForbidden();
        $this->assertDatabaseHas('messages', ['id' => $message->id, 'content' => 'original']);
    }

    public function test_edited_content_is_required(): void
    {
        $author = User::factory()->create();
        $message = Message::factory()->create(['author_id' => $author->id]);

        $response = $this->actingAs($author)
            ->patchJson("/api/messages/{$message->id}", ['content' => '']);

        $response->assertStatus(422);
    }
}
