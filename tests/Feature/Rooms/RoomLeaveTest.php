<?php

namespace Tests\Feature\Rooms;

use App\Models\RoleAssignment;
use App\Models\User;

class RoomLeaveTest extends RoomSettingsTestCase
{
    public function test_a_member_can_leave_and_loses_membership_and_room_roles(): void
    {
        [$room] = $this->roomWithOwner();
        $member = $this->manageRoomMember($room);
        $roleIds = $room->roles()->pluck('id');
        $this->assertTrue(RoleAssignment::whereIn('role_id', $roleIds)->where('user_id', $member->id)->exists());

        $this->actingAs($member)->postJson("/api/rooms/{$room->id}/leave")
            ->assertOk()->assertJson(['left' => true]);

        $this->assertFalse($room->fresh()->hasMember($member->id));
        $this->assertFalse(RoleAssignment::whereIn('role_id', $roleIds)->where('user_id', $member->id)->exists());
    }

    public function test_leaving_keeps_global_role_assignments(): void
    {
        [$room] = $this->roomWithOwner();
        $member = $this->plainMember($room);
        $globalAssignments = RoleAssignment::where('user_id', $member->id)
            ->whereNotIn('role_id', $room->roles()->pluck('id'))->count();
        $this->assertGreaterThan(0, $globalAssignments);

        $this->actingAs($member)->postJson("/api/rooms/{$room->id}/leave")->assertOk();

        $this->assertSame(
            $globalAssignments,
            RoleAssignment::where('user_id', $member->id)->whereNotIn('role_id', $room->roles()->pluck('id'))->count(),
        );
    }

    public function test_leaving_does_not_ban_and_the_user_can_rejoin_via_the_invite_code(): void
    {
        [$room] = $this->roomWithOwner();
        $member = $this->plainMember($room);

        $this->actingAs($member)->postJson("/api/rooms/{$room->id}/leave")->assertOk();

        $this->assertDatabaseMissing('room_bans', ['room_id' => $room->id, 'user_id' => $member->id]);

        $this->actingAs($member)->get("/join/{$room->invite_code}");

        $this->assertTrue($room->fresh()->hasMember($member->id));
    }

    public function test_the_owner_cannot_leave(): void
    {
        [$room, $owner] = $this->roomWithOwner();

        $this->actingAs($owner)->postJson("/api/rooms/{$room->id}/leave")
            ->assertStatus(422)
            ->assertJson(['message' => 'Transfer ownership or delete the room first.']);

        $this->assertTrue($room->fresh()->hasMember($owner->id));
    }

    public function test_a_non_member_cannot_leave(): void
    {
        [$room] = $this->roomWithOwner();
        $stranger = User::factory()->create();

        $this->actingAs($stranger)->postJson("/api/rooms/{$room->id}/leave")->assertForbidden();
    }
}
