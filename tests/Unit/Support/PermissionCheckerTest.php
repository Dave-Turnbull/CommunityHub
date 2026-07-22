<?php

namespace Tests\Unit\Support;

use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\User;
use App\Support\Permission;
use App\Support\PermissionChecker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PermissionCheckerTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_with_no_roles_has_no_permission(): void
    {
        $room = Room::factory()->create();
        $user = User::factory()->create();

        $this->assertFalse(PermissionChecker::can($user, Permission::ManageChannels, $room));
    }

    public function test_a_room_scoped_role_grants_the_permission_in_that_room(): void
    {
        $room = Room::factory()->create();
        $user = User::factory()->create();
        $role = Role::factory()->for($room)->create();
        $role->grant(Permission::ManageChannels);
        RoleAssignment::factory()->for($role)->for($user)->create();

        $this->assertTrue(PermissionChecker::can($user, Permission::ManageChannels, $room));
    }

    public function test_a_room_scoped_role_does_not_leak_into_another_room(): void
    {
        $room       = Room::factory()->create();
        $otherRoom  = Room::factory()->create();
        $user       = User::factory()->create();
        $role       = Role::factory()->for($room)->create();
        $role->grant(Permission::ManageChannels);
        RoleAssignment::factory()->for($role)->for($user)->create();

        $this->assertFalse(PermissionChecker::can($user, Permission::ManageChannels, $otherRoom));
    }

    public function test_a_global_role_grants_the_permission_in_every_room(): void
    {
        $room = Room::factory()->create();
        $user = User::factory()->create();
        $role = Role::factory()->global()->create();
        $role->grant(Permission::ManageChannels);
        RoleAssignment::factory()->for($role)->for($user)->create();

        $this->assertTrue(PermissionChecker::can($user, Permission::ManageChannels, $room));
    }

    public function test_a_global_check_with_no_room_excludes_room_scoped_roles(): void
    {
        $room = Room::factory()->create();
        $user = User::factory()->create();
        $role = Role::factory()->for($room)->create();
        $role->grant(Permission::ManageChannels);
        RoleAssignment::factory()->for($role)->for($user)->create();

        $this->assertFalse(PermissionChecker::can($user, Permission::ManageChannels));
    }

    public function test_administrator_implies_every_other_permission(): void
    {
        $room = Room::factory()->create();
        $user = User::factory()->create();
        $role = Role::factory()->for($room)->create();
        $role->grant(Permission::Administrator);
        RoleAssignment::factory()->for($role)->for($user)->create();

        $this->assertTrue(PermissionChecker::can($user, Permission::ManageChannels, $room));
        $this->assertTrue(PermissionChecker::can($user, Permission::ManageRoles, $room));
    }
}
