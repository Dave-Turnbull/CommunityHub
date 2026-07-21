<?php

namespace Tests\Feature\Conversations;

use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ConversationCandidatesTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_returns_only_shared_room_users(): void
    {
        $room = Room::factory()->create();
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $stranger = User::factory()->create();
        RoomMember::factory()->for($room)->for($alice)->create();
        RoomMember::factory()->for($room)->for($bob)->create();

        $response = $this->actingAs($alice)->getJson('/api/conversations/candidates');

        $response->assertOk();
        $ids = collect($response->json())->pluck('id');
        $this->assertTrue($ids->contains($bob->id));
        $this->assertFalse($ids->contains($stranger->id));
        $this->assertFalse($ids->contains($alice->id));
    }

    public function test_it_filters_candidates_by_search_query(): void
    {
        $room = Room::factory()->create();
        $alice = User::factory()->create();
        $bob = User::factory()->create(['display_name' => 'Bob Builder']);
        $carol = User::factory()->create(['display_name' => 'Carol Danvers']);
        RoomMember::factory()->for($room)->for($alice)->create();
        RoomMember::factory()->for($room)->for($bob)->create();
        RoomMember::factory()->for($room)->for($carol)->create();

        $response = $this->actingAs($alice)->getJson('/api/conversations/candidates?q=bob');

        $ids = collect($response->json())->pluck('id');
        $this->assertTrue($ids->contains($bob->id));
        $this->assertFalse($ids->contains($carol->id));
    }
}
