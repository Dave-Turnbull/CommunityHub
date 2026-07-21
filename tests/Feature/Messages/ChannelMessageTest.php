<?php

namespace Tests\Feature\Messages;

use App\Events\MessageSent;
use App\Models\Channel;
use App\Models\Message;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class ChannelMessageTest extends TestCase
{
    use RefreshDatabase;

    private function member(Room $room): User
    {
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();

        return $user;
    }

    public function test_a_member_can_send_a_channel_message(): void
    {
        Event::fake([MessageSent::class]);

        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = $this->member($room);

        $response = $this->actingAs($user)
            ->postJson("/api/channels/{$channel->id}/messages", ['content' => 'Hello!']);

        $response->assertCreated();
        $response->assertJsonPath('content', 'Hello!');
        $response->assertJsonPath('author.id', $user->id);

        $this->assertDatabaseHas('messages', [
            'channel_id' => $channel->id,
            'author_id'  => $user->id,
            'content'    => 'Hello!',
        ]);

        $this->assertSame(
            Message::first()->id,
            $channel->fresh()->last_message_id
        );

        Event::assertDispatched(MessageSent::class, fn ($e) => $e->scopeType === 'channel' && $e->scopeId === $channel->id);
    }

    public function test_a_non_member_cannot_send_a_channel_message(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = User::factory()->create();

        $response = $this->actingAs($user)
            ->postJson("/api/channels/{$channel->id}/messages", ['content' => 'Hello!']);

        $response->assertForbidden();
    }

    public function test_a_message_needs_content_or_an_attachment(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = $this->member($room);

        $response = $this->actingAs($user)
            ->postJson("/api/channels/{$channel->id}/messages", []);

        $response->assertStatus(422);
        $this->assertDatabaseCount('messages', 0);
    }

    public function test_a_member_can_list_channel_messages(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = $this->member($room);
        $message = Message::factory()->for($channel)->create();

        $response = $this->actingAs($user)->getJson("/api/channels/{$channel->id}/messages");

        $response->assertOk();
        $response->assertJsonPath('data.0.id', $message->id);
    }

    public function test_a_non_member_cannot_list_channel_messages(): void
    {
        $channel = Channel::factory()->create();
        $user = User::factory()->create();

        $response = $this->actingAs($user)->getJson("/api/channels/{$channel->id}/messages");

        $response->assertForbidden();
    }

    public function test_channel_messages_are_cursor_paginated(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = $this->member($room);

        // MessageController::PAGE_SIZE is 50; create 55 so a second page is needed.
        $messages = Message::factory()
            ->for($channel)
            ->count(55)
            ->sequence(fn ($seq) => ['created_at' => now()->addSeconds($seq->index)])
            ->create();

        $firstPage = $this->actingAs($user)
            ->getJson("/api/channels/{$channel->id}/messages")
            ->json();

        $this->assertCount(50, $firstPage['data']);
        $this->assertTrue($firstPage['has_more']);

        $secondPage = $this->actingAs($user)
            ->getJson("/api/channels/{$channel->id}/messages?before={$firstPage['next_cursor']}")
            ->json();

        $this->assertCount(5, $secondPage['data']);
        $this->assertFalse($secondPage['has_more']);
    }
}
