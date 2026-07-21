<?php

namespace Tests\Feature\Conversations;

use App\Events\MessageSent;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class ConversationCreateTest extends TestCase
{
    use RefreshDatabase;

    private function shareARoom(User ...$users): void
    {
        $room = Room::factory()->create();
        foreach ($users as $user) {
            RoomMember::factory()->for($room)->for($user)->create();
        }
    }

    public function test_it_creates_a_new_dm_and_sends_the_first_message(): void
    {
        Event::fake([MessageSent::class]);

        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $this->shareARoom($alice, $bob);

        $response = $this->actingAs($alice)->postJson('/api/conversations', [
            'user_ids' => [$bob->id],
            'content'  => 'Hey Bob',
        ]);

        $response->assertCreated();
        $this->assertSame('dm', $response->json('conversation.type'));
        $this->assertSame('Hey Bob', $response->json('message.content'));

        $conversation = Conversation::find($response->json('conversation.id'));
        $this->assertNotNull($conversation);
        $this->assertTrue($conversation->hasParticipant($alice->id));
        $this->assertTrue($conversation->hasParticipant($bob->id));
        $this->assertCount(2, $conversation->participants);

        Event::assertDispatched(MessageSent::class);
    }

    public function test_it_reuses_an_existing_dm_silently(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $this->shareARoom($alice, $bob);

        $existing = Conversation::factory()->create(['type' => 'dm']);
        ConversationParticipant::factory()->for($existing)->for($alice)->create();
        ConversationParticipant::factory()->for($existing)->for($bob)->create();

        $response = $this->actingAs($alice)->postJson('/api/conversations', [
            'user_ids' => [$bob->id],
            'content'  => 'Second message',
        ]);

        $response->assertCreated();
        $this->assertSame($existing->id, $response->json('conversation.id'));
        $this->assertSame(1, Conversation::count());
    }

    public function test_it_creates_a_named_group(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $carol = User::factory()->create();
        $this->shareARoom($alice, $bob, $carol);

        $response = $this->actingAs($alice)->postJson('/api/conversations', [
            'user_ids' => [$bob->id, $carol->id],
            'name'     => 'Trio Chat',
            'content'  => 'Hello all',
        ]);

        $response->assertCreated();
        $this->assertSame('group', $response->json('conversation.type'));
        $this->assertSame('Trio Chat', $response->json('conversation.name'));

        $conversation = Conversation::find($response->json('conversation.id'));
        $this->assertCount(3, $conversation->participants);
    }

    public function test_a_duplicate_group_is_rejected_without_confirmation(): void
    {
        Event::fake([MessageSent::class]);

        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $carol = User::factory()->create();
        $this->shareARoom($alice, $bob, $carol);

        $existing = Conversation::factory()->create(['type' => 'group', 'name' => 'Trio']);
        ConversationParticipant::factory()->for($existing)->for($alice)->create();
        ConversationParticipant::factory()->for($existing)->for($bob)->create();
        ConversationParticipant::factory()->for($existing)->for($carol)->create();

        $response = $this->actingAs($alice)->postJson('/api/conversations', [
            'user_ids' => [$bob->id, $carol->id],
            'content'  => 'Hello again',
        ]);

        $response->assertStatus(409);
        $this->assertSame($existing->id, $response->json('existing.id'));
        $this->assertSame(1, Conversation::count());
        Event::assertNotDispatched(MessageSent::class);
    }

    public function test_confirm_duplicate_creates_a_new_group_anyway(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $carol = User::factory()->create();
        $this->shareARoom($alice, $bob, $carol);

        $existing = Conversation::factory()->create(['type' => 'group', 'name' => 'Trio']);
        ConversationParticipant::factory()->for($existing)->for($alice)->create();
        ConversationParticipant::factory()->for($existing)->for($bob)->create();
        ConversationParticipant::factory()->for($existing)->for($carol)->create();

        $response = $this->actingAs($alice)->postJson('/api/conversations', [
            'user_ids'           => [$bob->id, $carol->id],
            'content'            => 'A fresh start',
            'confirm_duplicate'  => true,
        ]);

        $response->assertCreated();
        $this->assertNotSame($existing->id, $response->json('conversation.id'));
        $this->assertSame(2, Conversation::count());
    }

    public function test_it_rejects_messaging_a_user_without_a_shared_room(): void
    {
        $alice = User::factory()->create();
        $stranger = User::factory()->create();

        $response = $this->actingAs($alice)->postJson('/api/conversations', [
            'user_ids' => [$stranger->id],
            'content'  => 'Hi',
        ]);

        $response->assertForbidden();
        $this->assertSame(0, Conversation::count());
    }

    public function test_it_requires_content_or_an_attachment(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $this->shareARoom($alice, $bob);

        $response = $this->actingAs($alice)->postJson('/api/conversations', [
            'user_ids' => [$bob->id],
        ]);

        $response->assertStatus(422);
        $this->assertSame(0, Conversation::count());
    }

    public function test_it_notifies_other_participants(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $carol = User::factory()->create();
        $this->shareARoom($alice, $bob, $carol);

        $this->actingAs($alice)->postJson('/api/conversations', [
            'user_ids' => [$bob->id, $carol->id],
            'content'  => 'Hello team',
        ])->assertCreated();

        $this->assertSame(1, $bob->appNotifications()->where('type', 'direct_message')->count());
        $this->assertSame(1, $carol->appNotifications()->where('type', 'direct_message')->count());
        $this->assertSame(0, $alice->appNotifications()->where('type', 'direct_message')->count());
    }
}
