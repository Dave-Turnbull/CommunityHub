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

class RoomBanTest extends TestCase
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

    public function test_a_user_with_ban_members_can_ban_a_lower_ranked_member(): void
    {
        $room = Room::factory()->create();
        [$mod] = $this->memberWithCustomRole($room, 90, Permission::BanMembers);
        [$target] = $this->memberWithCustomRole($room, 10);

        $response = $this->actingAs($mod)->postJson("/api/rooms/{$room->id}/bans/{$target->id}");

        $response->assertOk();
        $this->assertDatabaseHas('room_bans', ['room_id' => $room->id, 'user_id' => $target->id, 'banned_by_id' => $mod->id]);
        $this->assertFalse($room->fresh()->hasMember($target->id));
    }

    public function test_manage_members_alone_does_not_permit_banning(): void
    {
        $room = Room::factory()->create();
        [$mod] = $this->memberWithCustomRole($room, 90, Permission::ManageMembers);
        [$target] = $this->memberWithCustomRole($room, 10);

        $response = $this->actingAs($mod)->postJson("/api/rooms/{$room->id}/bans/{$target->id}");

        $response->assertForbidden();
    }

    public function test_a_banned_user_cannot_rejoin_via_invite_code(): void
    {
        $room = Room::factory()->create();
        [$mod] = $this->memberWithCustomRole($room, 90, Permission::BanMembers);
        [$target] = $this->memberWithCustomRole($room, 10);

        $this->actingAs($mod)->postJson("/api/rooms/{$room->id}/bans/{$target->id}")->assertOk();

        $response = $this->actingAs($target)->get("/join/{$room->invite_code}");

        $response->assertForbidden();
        $this->assertFalse($room->fresh()->hasMember($target->id));
    }

    public function test_unbanning_allows_rejoining(): void
    {
        $room = Room::factory()->create();
        [$mod] = $this->memberWithCustomRole($room, 90, Permission::BanMembers);
        [$target] = $this->memberWithCustomRole($room, 10);

        $this->actingAs($mod)->postJson("/api/rooms/{$room->id}/bans/{$target->id}")->assertOk();
        $this->actingAs($mod)->deleteJson("/api/rooms/{$room->id}/bans/{$target->id}")->assertOk();

        $response = $this->actingAs($target)->get("/join/{$room->invite_code}");

        $response->assertRedirect();
        $this->assertTrue($room->fresh()->hasMember($target->id));
    }

    public function test_a_user_with_manage_members_but_not_ban_members_cannot_unban(): void
    {
        $room = Room::factory()->create();
        [$banner] = $this->memberWithCustomRole($room, 90, Permission::BanMembers);
        [$target] = $this->memberWithCustomRole($room, 10);
        $this->actingAs($banner)->postJson("/api/rooms/{$room->id}/bans/{$target->id}")->assertOk();

        [$mod] = $this->memberWithCustomRole($room, 80, Permission::ManageMembers);

        $response = $this->actingAs($mod)->deleteJson("/api/rooms/{$room->id}/bans/{$target->id}");

        $response->assertForbidden();
        $this->assertDatabaseHas('room_bans', ['room_id' => $room->id, 'user_id' => $target->id]);
    }

    public function test_banning_an_already_banned_user_is_idempotent(): void
    {
        $room = Room::factory()->create();
        [$mod] = $this->memberWithCustomRole($room, 90, Permission::BanMembers);
        [$target] = $this->memberWithCustomRole($room, 10);

        $this->actingAs($mod)->postJson("/api/rooms/{$room->id}/bans/{$target->id}")->assertOk();
        $response = $this->actingAs($mod)->postJson("/api/rooms/{$room->id}/bans/{$target->id}");

        $response->assertOk();
        $this->assertDatabaseCount('room_bans', 1);
    }

    public function test_a_guest_cannot_ban(): void
    {
        $room = Room::factory()->create();
        [$target] = $this->memberWithCustomRole($room, 10);

        $response = $this->postJson("/api/rooms/{$room->id}/bans/{$target->id}");

        $response->assertUnauthorized();
    }
}
