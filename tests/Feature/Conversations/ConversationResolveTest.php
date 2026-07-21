<?php

namespace Tests\Feature\Conversations;

use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ConversationResolveTest extends TestCase
{
    use RefreshDatabase;

    private function shareARoom(User ...$users): void
    {
        $room = Room::factory()->create();
        foreach ($users as $user) {
            RoomMember::factory()->for($room)->for($user)->create();
        }
    }

    public function test_no_match_resolves_to_a_new_dm(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $this->shareARoom($alice, $bob);

        $response = $this->actingAs($alice)
            ->getJson('/api/conversations/resolve?'.http_build_query(['user_ids' => [$bob->id]]));

        $response->assertOk();
        $response->assertJson(['type' => 'dm', 'existing' => null]);
    }

    public function test_it_finds_an_exact_dm_match(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $this->shareARoom($alice, $bob);

        $conversation = Conversation::factory()->create(['type' => 'dm']);
        ConversationParticipant::factory()->for($conversation)->for($alice)->create();
        ConversationParticipant::factory()->for($conversation)->for($bob)->create();

        $response = $this->actingAs($alice)
            ->getJson('/api/conversations/resolve?'.http_build_query(['user_ids' => [$bob->id]]));

        $response->assertOk();
        $this->assertSame('dm', $response->json('type'));
        $this->assertSame($conversation->id, $response->json('existing.id'));
    }

    public function test_it_finds_an_exact_group_match(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $carol = User::factory()->create();
        $this->shareARoom($alice, $bob, $carol);

        $conversation = Conversation::factory()->create(['type' => 'group', 'name' => 'Trio']);
        ConversationParticipant::factory()->for($conversation)->for($alice)->create();
        ConversationParticipant::factory()->for($conversation)->for($bob)->create();
        ConversationParticipant::factory()->for($conversation)->for($carol)->create();

        $response = $this->actingAs($alice)
            ->getJson('/api/conversations/resolve?'.http_build_query(['user_ids' => [$bob->id, $carol->id]]));

        $response->assertOk();
        $this->assertSame('group', $response->json('type'));
        $this->assertSame($conversation->id, $response->json('existing.id'));
    }

    public function test_a_different_membership_size_is_not_a_match(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $carol = User::factory()->create();
        $dave = User::factory()->create();
        $this->shareARoom($alice, $bob, $carol, $dave);

        $conversation = Conversation::factory()->create(['type' => 'group']);
        ConversationParticipant::factory()->for($conversation)->for($alice)->create();
        ConversationParticipant::factory()->for($conversation)->for($bob)->create();
        ConversationParticipant::factory()->for($conversation)->for($carol)->create();

        $response = $this->actingAs($alice)
            ->getJson('/api/conversations/resolve?'.http_build_query(['user_ids' => [$bob->id, $carol->id, $dave->id]]));

        $response->assertOk();
        $this->assertNull($response->json('existing'));
    }

    public function test_it_rejects_a_user_without_a_shared_room(): void
    {
        $alice = User::factory()->create();
        $stranger = User::factory()->create();

        $response = $this->actingAs($alice)
            ->getJson('/api/conversations/resolve?'.http_build_query(['user_ids' => [$stranger->id]]));

        $response->assertForbidden();
    }
}
