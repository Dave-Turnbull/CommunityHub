<?php

namespace Tests\Unit\Models;

use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\User;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Role::effectiveModerationRank is the kick/ban-specific hierarchy
 * comparison (see RoomMemberPolicy) — deliberately different from
 * highestRoleFor()/rank() alone, since a global Administrator has no
 * room-scoped role at all but must still tie (not lose to) the room's Owner.
 */
class RoleEffectiveModerationRankTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_with_no_roles_in_the_room_ranks_at_negative_infinity(): void
    {
        $room = Room::factory()->create();
        $user = User::factory()->create();

        $this->assertSame(-INF, Role::effectiveModerationRank($user, $room));
    }

    public function test_a_room_scoped_role_ranks_by_its_position(): void
    {
        $room = Room::factory()->create();
        $user = User::factory()->create();
        $role = Role::factory()->for($room)->create(['position' => 42]);
        RoleAssignment::factory()->for($role)->for($user)->create();

        $this->assertSame(42.0, Role::effectiveModerationRank($user, $room));
    }

    public function test_the_owner_role_ranks_at_infinity(): void
    {
        $room = Room::factory()->create();
        $owner = User::factory()->create();
        $ownerRole = $room->roles()->where('is_system', true)->where('is_default', false)->first();
        RoleAssignment::factory()->for($ownerRole)->for($owner)->create();

        $this->assertSame(INF, Role::effectiveModerationRank($owner, $room));
    }

    public function test_a_global_administrator_ranks_at_infinity_even_with_no_room_role(): void
    {
        $room = Room::factory()->create();
        $admin = User::factory()->create();
        $globalRole = Role::factory()->global()->create();
        $globalRole->grant(Permission::Administrator);
        RoleAssignment::factory()->for($globalRole)->for($admin)->create();

        $this->assertSame(INF, Role::effectiveModerationRank($admin, $room));
    }

    public function test_a_global_role_without_administrator_does_not_rank_at_infinity(): void
    {
        $room = Room::factory()->create();
        $staff = User::factory()->create();
        $globalRole = Role::factory()->global()->create();
        $globalRole->grant(Permission::ManageMembers);
        RoleAssignment::factory()->for($globalRole)->for($staff)->create();

        $this->assertSame(-INF, Role::effectiveModerationRank($staff, $room));
    }
}
