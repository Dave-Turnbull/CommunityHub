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

class RoomKickTest extends TestCase
{
    use RefreshDatabase;

    private function memberWithCustomRole(Room $room, int $position, ?Permission $permission = null): array
    {
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();

        $role = Role::factory()->for($room)->create(['position' => $position]);
        if ($permission) {
            $role->grant($permission);
        }
        RoleAssignment::factory()->for($role)->for($user)->create();

        return [$user, $role];
    }

    public function test_a_user_with_manage_members_can_kick_a_lower_ranked_member(): void
    {
        $room = Room::factory()->create();
        [$mod] = $this->memberWithCustomRole($room, 90, Permission::ManageMembers);
        [$target] = $this->memberWithCustomRole($room, 10);

        $response = $this->actingAs($mod)->deleteJson("/api/rooms/{$room->id}/members/{$target->id}");

        $response->assertOk();
        $this->assertFalse($room->fresh()->hasMember($target->id));
        // The global Member role assignment (see UserFactory::configure())
        // is untouched — only this room's role assignments are cleared.
        $this->assertFalse(
            \App\Models\RoleAssignment::whereIn('role_id', $room->roles()->pluck('id'))
                ->where('user_id', $target->id)
                ->exists()
        );
    }

    public function test_a_user_without_manage_members_cannot_kick(): void
    {
        $room = Room::factory()->create();
        [$plain] = $this->memberWithCustomRole($room, 10);
        [$target] = $this->memberWithCustomRole($room, 5);

        $response = $this->actingAs($plain)->deleteJson("/api/rooms/{$room->id}/members/{$target->id}");

        $response->assertForbidden();
        $this->assertTrue($room->fresh()->hasMember($target->id));
    }

    public function test_a_member_cannot_kick_a_higher_ranked_member_even_with_manage_members(): void
    {
        $room = Room::factory()->create();
        [$mod] = $this->memberWithCustomRole($room, 10, Permission::ManageMembers);
        [$target] = $this->memberWithCustomRole($room, 90);

        $response = $this->actingAs($mod)->deleteJson("/api/rooms/{$room->id}/members/{$target->id}");

        $response->assertForbidden();
    }

    public function test_same_rank_peers_may_kick_one_another(): void
    {
        $room = Room::factory()->create();
        [$mod] = $this->memberWithCustomRole($room, 50, Permission::ManageMembers);
        [$target] = $this->memberWithCustomRole($room, 50);

        $response = $this->actingAs($mod)->deleteJson("/api/rooms/{$room->id}/members/{$target->id}");

        $response->assertOk();
    }

    public function test_a_user_cannot_kick_themselves(): void
    {
        $room = Room::factory()->create();
        [$mod] = $this->memberWithCustomRole($room, 90, Permission::ManageMembers);

        $response = $this->actingAs($mod)->deleteJson("/api/rooms/{$room->id}/members/{$mod->id}");

        $response->assertForbidden();
    }

    public function test_ban_members_alone_does_not_permit_kicking(): void
    {
        // Symmetric to RoomBanTest's "manage_members alone does not permit
        // banning" — the two permissions are deliberately not
        // interchangeable, see RoomMemberPolicy::kick/ban.
        $room = Room::factory()->create();
        [$mod] = $this->memberWithCustomRole($room, 90, Permission::BanMembers);
        [$target] = $this->memberWithCustomRole($room, 10);

        $response = $this->actingAs($mod)->deleteJson("/api/rooms/{$room->id}/members/{$target->id}");

        $response->assertForbidden();
        $this->assertTrue($room->fresh()->hasMember($target->id));
    }

    public function test_a_guest_cannot_kick(): void
    {
        $room = Room::factory()->create();
        [$target] = $this->memberWithCustomRole($room, 10);

        $response = $this->deleteJson("/api/rooms/{$room->id}/members/{$target->id}");

        $response->assertUnauthorized();
    }

    public function test_kicking_a_non_member_is_a_harmless_no_op(): void
    {
        $room = Room::factory()->create();
        [$mod] = $this->memberWithCustomRole($room, 90, Permission::ManageMembers);
        $stranger = User::factory()->create();

        $response = $this->actingAs($mod)->deleteJson("/api/rooms/{$room->id}/members/{$stranger->id}");

        $response->assertOk();
        $this->assertFalse($room->fresh()->hasMember($stranger->id));
    }
}
