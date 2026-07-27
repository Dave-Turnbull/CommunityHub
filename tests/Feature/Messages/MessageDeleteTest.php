<?php

namespace Tests\Feature\Messages;

use App\Events\MessageDeleted;
use App\Models\Attachment;
use App\Models\Message;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
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

    public function test_deleting_a_message_removes_its_attachments_file_and_row(): void
    {
        Storage::fake('local');
        $path = UploadedFile::fake()->image('photo.jpg')->store('uploads', 'local');

        $author = User::factory()->create();
        $message = Message::factory()->create(['author_id' => $author->id]);
        $attachment = Attachment::factory()->for($message)->create(['path' => $path]);

        Storage::disk('local')->assertExists($path);

        $this->actingAs($author)->deleteJson("/api/messages/{$message->id}")->assertOk();

        Storage::disk('local')->assertMissing($path);
        $this->assertDatabaseMissing('attachments', ['id' => $attachment->id]);
        // The message itself only soft-deletes — unaffected by attachment cleanup.
        $this->assertSoftDeleted('messages', ['id' => $message->id]);
    }
}
