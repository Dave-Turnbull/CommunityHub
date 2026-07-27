<?php

namespace Tests\Feature\Rooms;

use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Only a global Administrator can act on a room's Owner (nothing room-scoped
 * ever outranks Owner — see Role::effectiveModerationRank). Removing the
 * Owner necessarily leaves the room without one, so the acting admin becomes
 * the new Owner — see RoomMembershipService::removeMembership.
 */
class OwnerTransferOnKickTest extends TestCase
{
    use RefreshDatabase;

    private function globalAdmin(): User
    {
        $user = User::factory()->create();
        $role = Role::factory()->global()->create();
        $role->grant(Permission::Administrator);
        RoleAssignment::factory()->for($role)->for($user)->create();

        return $user;
    }

    private function roomWithOwner(): array
    {
        $room = Room::factory()->create();
        $owner = User::factory()->create();
        RoomMember::factory()->for($room)->for($owner)->create();
        $ownerRole = $room->roles()->where('is_system', true)->where('is_default', false)->first();
        RoleAssignment::factory()->for($ownerRole)->for($owner)->create();
        $room->update(['owner_id' => $owner->id]);

        return [$room, $owner, $ownerRole];
    }

    public function test_kicking_the_owner_without_confirmation_requires_owner_transfer(): void
    {
        $admin = $this->globalAdmin();
        [$room, $owner] = $this->roomWithOwner();

        $response = $this->actingAs($admin)->deleteJson("/api/rooms/{$room->id}/members/{$owner->id}");

        $response->assertStatus(409);
        $this->assertTrue($response->json('requires_owner_transfer'));
        $this->assertTrue($room->fresh()->hasMember($owner->id));
    }

    public function test_confirming_the_transfer_makes_the_admin_the_new_owner(): void
    {
        $admin = $this->globalAdmin();
        [$room, $owner, $ownerRole] = $this->roomWithOwner();

        $response = $this->actingAs($admin)->deleteJson("/api/rooms/{$room->id}/members/{$owner->id}", [
            'confirm_owner_transfer' => true,
        ]);

        $response->assertOk();

        $room->refresh();
        $this->assertSame($admin->id, $room->owner_id);
        $this->assertFalse($room->hasMember($owner->id));
        $this->assertTrue(
            RoleAssignment::where('role_id', $ownerRole->id)->where('user_id', $admin->id)->exists()
        );
        $this->assertFalse(
            RoleAssignment::where('role_id', $ownerRole->id)->where('user_id', $owner->id)->exists()
        );
    }

    public function test_a_room_scoped_role_can_never_act_on_the_owner_regardless_of_permission(): void
    {
        $room = Room::factory()->create();
        $mod = User::factory()->create();
        RoomMember::factory()->for($room)->for($mod)->create();
        $modRole = Role::factory()->for($room)->create(['position' => 90]);
        $modRole->grant(Permission::ManageMembers);
        RoleAssignment::factory()->for($modRole)->for($mod)->create();

        $owner = User::factory()->create();
        RoomMember::factory()->for($room)->for($owner)->create();
        $ownerRole = $room->roles()->where('is_system', true)->where('is_default', false)->first();
        RoleAssignment::factory()->for($ownerRole)->for($owner)->create();

        $response = $this->actingAs($mod)->deleteJson("/api/rooms/{$room->id}/members/{$owner->id}");

        $response->assertForbidden();
    }
}
