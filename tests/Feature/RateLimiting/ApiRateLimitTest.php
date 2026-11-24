<?php

namespace Tests\Feature\RateLimiting;

use App\Models\Channel;
use App\Models\Message;
use App\Models\Room;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ApiRateLimitTest extends TestCase
{
    use RefreshDatabase;

    private function memberOf(Room $room): User
    {
        $user = User::factory()->create();
        $room->addMember($user);

        return $user;
    }

    public function test_the_message_after_the_limit_is_rejected_with_retry_after(): void
    {
        config()->set('rate_limits.messages', 2);
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = $this->memberOf($room);

        foreach (['one', 'two'] as $content) {
            $this->actingAs($user)
                ->postJson("/api/channels/{$channel->id}/messages", ['content' => $content])
                ->assertCreated();
        }

        $this->actingAs($user)
            ->postJson("/api/channels/{$channel->id}/messages", ['content' => 'three'])
            ->assertStatus(429)
            ->assertHeader('Retry-After');

        $this->assertDatabaseCount('messages', 2);
    }

    public function test_the_limit_is_read_from_config_at_request_time(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = $this->memberOf($room);

        config()->set('rate_limits.messages', 1);
        $this->actingAs($user)->postJson("/api/channels/{$channel->id}/messages", ['content' => 'one'])->assertCreated();
        $this->actingAs($user)->postJson("/api/channels/{$channel->id}/messages", ['content' => 'two'])->assertStatus(429);

        config()->set('rate_limits.messages', 5);
        $this->actingAs($user)->postJson("/api/channels/{$channel->id}/messages", ['content' => 'three'])->assertCreated();
    }

    public function test_limits_are_per_user(): void
    {
        config()->set('rate_limits.messages', 1);
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $first = $this->memberOf($room);
        $second = $this->memberOf($room);

        $this->actingAs($first)->postJson("/api/channels/{$channel->id}/messages", ['content' => 'one'])->assertCreated();
        $this->actingAs($first)->postJson("/api/channels/{$channel->id}/messages", ['content' => 'two'])->assertStatus(429);

        $this->actingAs($second)->postJson("/api/channels/{$channel->id}/messages", ['content' => 'hi'])->assertCreated();
    }

    public function test_edits_and_comments_share_the_messages_bucket(): void
    {
        config()->set('rate_limits.messages', 2);
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = $this->memberOf($room);
        $message = Message::factory()->for($channel)->create(['author_id' => $user->id]);

        $this->actingAs($user)->patchJson("/api/messages/{$message->id}", ['content' => 'edited'])->assertOk();
        $this->actingAs($user)->postJson("/api/messages/{$message->id}/comments", ['content' => 'c']);
        $this->actingAs($user)->postJson("/api/channels/{$channel->id}/messages", ['content' => 'x'])->assertStatus(429);
    }

    public function test_buckets_are_independent(): void
    {
        config()->set('rate_limits.reactions', 1);
        config()->set('rate_limits.messages', 5);
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = $this->memberOf($room);
        $message = Message::factory()->for($channel)->create();

        $this->actingAs($user)->postJson("/api/messages/{$message->id}/reactions", ['emoji' => '👍'])->assertSuccessful();
        $this->actingAs($user)->postJson("/api/messages/{$message->id}/reactions", ['emoji' => '🎉'])->assertStatus(429);
        $this->actingAs($user)->deleteJson("/api/messages/{$message->id}/reactions/".urlencode('👍'))->assertStatus(429);
        $this->actingAs($user)->postJson("/api/messages/{$message->id}/votes", ['value' => 1])->assertStatus(429);

        $this->actingAs($user)
            ->postJson("/api/channels/{$channel->id}/messages", ['content' => 'still fine'])
            ->assertCreated();
    }

    public function test_history_reads_are_never_throttled(): void
    {
        config()->set('rate_limits.messages', 1);
        config()->set('rate_limits.reactions', 1);
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = $this->memberOf($room);
        Message::factory()->for($channel)->count(3)->create();

        for ($i = 0; $i < 5; $i++) {
            $this->actingAs($user)->getJson("/api/channels/{$channel->id}/messages")->assertOk();
        }
    }

    public function test_the_upload_limit_bites(): void
    {
        config()->set('rate_limits.uploads', 1);
        Storage::fake('local');
        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/upload', ['file' => UploadedFile::fake()->image('a.png')])
            ->assertSuccessful();

        $this->actingAs($user)
            ->postJson('/api/upload', ['file' => UploadedFile::fake()->image('b.png')])
            ->assertStatus(429)
            ->assertHeader('Retry-After');
    }

    public function test_invite_routes_share_a_bucket(): void
    {
        config()->set('rate_limits.invites', 1);
        $room = Room::factory()->create();
        $user = $this->memberOf($room);

        $this->actingAs($user)->postJson("/api/rooms/{$room->id}/invites", ['email' => 'a@example.com']);
        $this->actingAs($user)->postJson("/api/rooms/{$room->id}/invites", ['email' => 'b@example.com'])->assertStatus(429);
        $this->actingAs($user)->postJson('/api/server-invites', [])->assertStatus(429);
    }

    public function test_conversation_creation_and_participant_adds_share_a_bucket(): void
    {
        config()->set('rate_limits.conversations', 1);
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/conversations', []);
        $this->actingAs($user)->postJson('/api/conversations', [])->assertStatus(429);
    }
}
