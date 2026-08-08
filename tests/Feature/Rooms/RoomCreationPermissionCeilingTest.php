<?php

namespace Tests\Feature\Rooms;

use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\RoleRoomPermissionCeiling;
use App\Models\Room;
use App\Models\User;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Room::snapshotPermissionCeiling() — called once, at creation, from every
 * room-creation site. See docs/roles-and-permissions.md.
 */
class RoomCreationPermissionCeilingTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_room_created_by_a_user_with_only_the_default_global_role_is_unrestricted(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->post('/rooms', ['name' => 'Open Room']);

        $room = Room::where('name', 'Open Room')->firstOrFail();

        $this->assertTrue($room->permission_ceiling_unrestricted);
        $this->assertCount(0, $room->permissionCeilings);
    }

    public function test_a_room_created_by_a_user_whose_only_global_role_is_restricted_snapshots_its_ceiling(): void
    {
        $user = User::factory()->create();
        // Strip the factory-assigned unrestricted global Member so the
        // restricted role below really is the creator's only global role.
        RoleAssignment::where('user_id', $user->id)->delete();

        $restricted = Role::factory()->global()->create(['has_room_permission_ceiling' => true]);
        $restricted->grant(Permission::CreateRoom);
        RoleAssignment::factory()->for($restricted)->for($user)->create();
        RoleRoomPermissionCeiling::create(['role_id' => $restricted->id, 'permission' => Permission::ManageChannels->value]);
        RoleRoomPermissionCeiling::create(['role_id' => $restricted->id, 'permission' => Permission::ManageMembers->value]);

        $this->actingAs($user)->post('/rooms', ['name' => 'Restricted Room']);

        $room = Room::where('name', 'Restricted Room')->firstOrFail();

        $this->assertFalse($room->permission_ceiling_unrestricted);
        $this->assertEqualsCanonicalizing(
            [Permission::ManageChannels->value, Permission::ManageMembers->value],
            $room->permissionCeilings->pluck('permission')->map(fn ($p) => $p->value)->all()
        );
    }

    public function test_holding_any_unrestricted_global_role_alongside_a_restricted_one_leaves_the_room_unrestricted(): void
    {
        $user = User::factory()->create();
        // Factory-assigned global Member is unrestricted by default and
        // stays assigned here — the wildcard case.

        $restricted = Role::factory()->global()->create(['has_room_permission_ceiling' => true]);
        RoleAssignment::factory()->for($restricted)->for($user)->create();
        RoleRoomPermissionCeiling::create(['role_id' => $restricted->id, 'permission' => Permission::ManageChannels->value]);

        $this->actingAs($user)->post('/rooms', ['name' => 'Still Open Room']);

        $room = Room::where('name', 'Still Open Room')->firstOrFail();

        $this->assertTrue($room->permission_ceiling_unrestricted);
        $this->assertCount(0, $room->permissionCeilings);
    }

    public function test_the_ceiling_is_the_union_of_every_restricted_global_role_the_creator_holds(): void
    {
        $user = User::factory()->create();
        RoleAssignment::where('user_id', $user->id)->delete();

        $roleA = Role::factory()->global()->create(['has_room_permission_ceiling' => true]);
        $roleA->grant(Permission::CreateRoom);
        RoleAssignment::factory()->for($roleA)->for($user)->create();
        RoleRoomPermissionCeiling::create(['role_id' => $roleA->id, 'permission' => Permission::ManageChannels->value]);

        $roleB = Role::factory()->global()->create(['has_room_permission_ceiling' => true]);
        RoleAssignment::factory()->for($roleB)->for($user)->create();
        RoleRoomPermissionCeiling::create(['role_id' => $roleB->id, 'permission' => Permission::BanMembers->value]);

        $this->actingAs($user)->post('/rooms', ['name' => 'Union Room']);

        $room = Room::where('name', 'Union Room')->firstOrFail();

        $this->assertFalse($room->permission_ceiling_unrestricted);
        $this->assertEqualsCanonicalizing(
            [Permission::ManageChannels->value, Permission::BanMembers->value],
            $room->permissionCeilings->pluck('permission')->map(fn ($p) => $p->value)->all()
        );
    }

    public function test_a_restricted_rooms_owner_does_not_get_the_administrator_wildcard(): void
    {
        $user = User::factory()->create();
        RoleAssignment::where('user_id', $user->id)->delete();

        $restricted = Role::factory()->global()->create(['has_room_permission_ceiling' => true]);
        $restricted->grant(Permission::CreateRoom);
        RoleAssignment::factory()->for($restricted)->for($user)->create();
        RoleRoomPermissionCeiling::create(['role_id' => $restricted->id, 'permission' => Permission::ManageChannels->value]);
        RoleRoomPermissionCeiling::create(['role_id' => $restricted->id, 'permission' => Permission::ManageMembers->value]);

        $this->actingAs($user)->post('/rooms', ['name' => 'Capped Room']);
        $room = Room::where('name', 'Capped Room')->firstOrFail();
        $owner = $room->roles()->where('is_system', true)->where('is_default', false)->firstOrFail();

        // A restricted Owner is granted exactly the ceiling's permissions,
        // never the Administrator wildcard — that would defeat the ceiling
        // entirely. See Role::seedDefaultsForRoom's ceiling-aware seeding.
        $this->assertFalse($owner->hasPermission(Permission::Administrator));
        $this->assertEqualsCanonicalizing(
            [Permission::ManageChannels->value, Permission::ManageMembers->value],
            $owner->rolePermissions->pluck('permission')->map(fn ($p) => $p->value)->all()
        );
    }

    public function test_a_restricted_rooms_moderator_and_member_defaults_are_bounded_by_the_ceiling(): void
    {
        $user = User::factory()->create();
        RoleAssignment::where('user_id', $user->id)->delete();

        $restricted = Role::factory()->global()->create(['has_room_permission_ceiling' => true]);
        $restricted->grant(Permission::CreateRoom);
        RoleAssignment::factory()->for($restricted)->for($user)->create();
        // Only ManageChannels and Comment make it into the ceiling — none of
        // Moderator's other normal defaults (BanMembers, InviteMembers,
        // ManageMembers, PostAnnouncements, ManageChannelVisibility) or
        // Member's other normal defaults (Vote, SendMessages, React).
        RoleRoomPermissionCeiling::create(['role_id' => $restricted->id, 'permission' => Permission::ManageChannels->value]);
        RoleRoomPermissionCeiling::create(['role_id' => $restricted->id, 'permission' => Permission::Comment->value]);

        $this->actingAs($user)->post('/rooms', ['name' => 'Capped Room 2']);
        $room = Room::where('name', 'Capped Room 2')->firstOrFail();
        $moderator = $room->roles()->where('name', 'Moderator')->firstOrFail();
        $member = $room->roles()->where('is_default', true)->firstOrFail();

        $this->assertSame(
            [Permission::ManageChannels->value],
            $moderator->rolePermissions->pluck('permission')->map(fn ($p) => $p->value)->all()
        );
        $this->assertSame(
            [Permission::Comment->value],
            $member->rolePermissions->pluck('permission')->map(fn ($p) => $p->value)->all()
        );
    }
}
