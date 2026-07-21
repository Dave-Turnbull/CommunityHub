<?php

namespace Tests\Unit\Models;

use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserTest extends TestCase
{
    use RefreshDatabase;

    public function test_shares_room_with_is_true_for_a_common_room(): void
    {
        $room = Room::factory()->create();
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        RoomMember::factory()->for($room)->for($alice)->create();
        RoomMember::factory()->for($room)->for($bob)->create();

        $this->assertTrue($alice->sharesRoomWith($bob->id));
        $this->assertTrue($bob->sharesRoomWith($alice->id));
    }

    public function test_shares_room_with_is_false_without_a_common_room(): void
    {
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        RoomMember::factory()->for(Room::factory())->for($alice)->create();
        RoomMember::factory()->for(Room::factory())->for($bob)->create();

        $this->assertFalse($alice->sharesRoomWith($bob->id));
    }

    public function test_messageable_users_excludes_self_and_non_shared_room_users(): void
    {
        $room = Room::factory()->create();
        $alice = User::factory()->create();
        $bob = User::factory()->create();
        $stranger = User::factory()->create();
        RoomMember::factory()->for($room)->for($alice)->create();
        RoomMember::factory()->for($room)->for($bob)->create();

        $ids = $alice->messageableUsers()->pluck('id');

        $this->assertTrue($ids->contains($bob->id));
        $this->assertFalse($ids->contains($alice->id));
        $this->assertFalse($ids->contains($stranger->id));
    }

    public function test_messageable_users_respects_a_search_filter(): void
    {
        $room = Room::factory()->create();
        $alice = User::factory()->create();
        $bob = User::factory()->create(['display_name' => 'Bob Builder']);
        $carol = User::factory()->create(['display_name' => 'Carol Danvers']);
        RoomMember::factory()->for($room)->for($alice)->create();
        RoomMember::factory()->for($room)->for($bob)->create();
        RoomMember::factory()->for($room)->for($carol)->create();

        $ids = $alice->messageableUsers('bob')->pluck('id');

        $this->assertTrue($ids->contains($bob->id));
        $this->assertFalse($ids->contains($carol->id));
    }
}
