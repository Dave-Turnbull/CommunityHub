<?php

namespace Tests\Unit\Models;

use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoomTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_invite_code_is_generated_automatically(): void
    {
        $room = Room::factory()->create(['invite_code' => null]);

        $this->assertNotEmpty($room->invite_code);
        $this->assertSame(8, strlen($room->invite_code));
    }

    public function test_an_explicit_invite_code_is_not_overwritten(): void
    {
        $room = Room::factory()->create(['invite_code' => 'custom01']);

        $this->assertSame('custom01', $room->invite_code);
    }

    public function test_has_member_reflects_membership(): void
    {
        $room = Room::factory()->create();
        $member = User::factory()->create();
        $stranger = User::factory()->create();
        RoomMember::factory()->for($room)->for($member)->create();

        $this->assertTrue($room->hasMember($member->id));
        $this->assertFalse($room->hasMember($stranger->id));
    }
}
