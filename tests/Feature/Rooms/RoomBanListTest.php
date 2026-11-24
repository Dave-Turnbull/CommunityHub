<?php

namespace Tests\Feature\Rooms;

use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\RoomBan;
use App\Models\RoomMember;
use App\Models\User;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoomBanListTest extends TestCase
{
    use RefreshDatabase;

    private function memberWithCustomRole(Room $room, int $position, ?Permission $permission = null): User
    {
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();

        $role = Role::factory()->for($room)->create(['position' => $position]);
        if ($permission) {
            $role->grant($permission);
        }
        RoleAssignment::factory()->for($role)->for($user)->create();

        return $user;
    }

    public function test_a_user_with_ban_members_gets_the_list_of_bans(): void
    {
        $room = Room::factory()->create();
        $mod = $this->memberWithCustomRole($room, 90, Permission::BanMembers);
        $first = $this->memberWithCustomRole($room, 10);
        $second = $this->memberWithCustomRole($room, 10);
        $this->actingAs($mod)->postJson("/api/rooms/{$room->id}/bans/{$first->id}")->assertOk();
        $this->actingAs($mod)->postJson("/api/rooms/{$room->id}/bans/{$second->id}")->assertOk();

        $response = $this->actingAs($mod)->getJson("/api/rooms/{$room->id}/bans");

        $response->assertOk()->assertJsonCount(2);
        $this->assertEqualsCanonicalizing(
            [$first->id, $second->id],
            collect($response->json())->pluck('user.id')->all(),
        );

        $row = collect($response->json())->firstWhere('user.id', $first->id);
        $this->assertSame($first->username, $row['user']['username']);
        $this->assertSame($first->display_name, $row['user']['display_name']);
        $this->assertArrayHasKey('avatar_url', $row['user']);
        $this->assertSame($mod->id, $row['banned_by']['id']);
        $this->assertSame($mod->display_name, $row['banned_by']['display_name']);
        $this->assertNotEmpty($row['banned_at']);
        $this->assertSame(RoomBan::where('user_id', $first->id)->value('id'), $row['id']);
    }

    public function test_the_list_is_empty_when_nobody_is_banned(): void
    {
        $room = Room::factory()->create();
        $mod = $this->memberWithCustomRole($room, 90, Permission::BanMembers);

        $this->actingAs($mod)->getJson("/api/rooms/{$room->id}/bans")->assertOk()->assertExactJson([]);
    }

    public function test_the_list_only_contains_this_rooms_bans(): void
    {
        $room = Room::factory()->create();
        $mod = $this->memberWithCustomRole($room, 90, Permission::BanMembers);
        $otherRoom = Room::factory()->create();
        $otherMod = $this->memberWithCustomRole($otherRoom, 90, Permission::BanMembers);
        $elsewhere = $this->memberWithCustomRole($otherRoom, 10);
        $this->actingAs($otherMod)->postJson("/api/rooms/{$otherRoom->id}/bans/{$elsewhere->id}")->assertOk();

        $this->actingAs($mod)->getJson("/api/rooms/{$room->id}/bans")->assertOk()->assertExactJson([]);
    }

    public function test_an_unbanned_user_disappears_from_the_list(): void
    {
        $room = Room::factory()->create();
        $mod = $this->memberWithCustomRole($room, 90, Permission::BanMembers);
        $kept = $this->memberWithCustomRole($room, 10);
        $removed = $this->memberWithCustomRole($room, 10);
        $this->actingAs($mod)->postJson("/api/rooms/{$room->id}/bans/{$kept->id}")->assertOk();
        $this->actingAs($mod)->postJson("/api/rooms/{$room->id}/bans/{$removed->id}")->assertOk();

        $this->actingAs($mod)->deleteJson("/api/rooms/{$room->id}/bans/{$removed->id}")->assertOk();

        $response = $this->actingAs($mod)->getJson("/api/rooms/{$room->id}/bans");
        $response->assertOk()->assertJsonCount(1);
        $this->assertSame([$kept->id], collect($response->json())->pluck('user.id')->all());
    }

    public function test_a_plain_member_cannot_list_bans(): void
    {
        $room = Room::factory()->create();
        $member = $this->memberWithCustomRole($room, 10);

        $this->actingAs($member)->getJson("/api/rooms/{$room->id}/bans")->assertForbidden();
    }

    public function test_manage_members_alone_cannot_list_bans(): void
    {
        $room = Room::factory()->create();
        $mod = $this->memberWithCustomRole($room, 90, Permission::ManageMembers);

        $this->actingAs($mod)->getJson("/api/rooms/{$room->id}/bans")->assertForbidden();
    }

    public function test_a_non_member_cannot_list_bans(): void
    {
        $room = Room::factory()->create();

        $this->actingAs(User::factory()->create())->getJson("/api/rooms/{$room->id}/bans")->assertForbidden();
    }

    public function test_a_guest_cannot_list_bans(): void
    {
        $room = Room::factory()->create();

        $this->getJson("/api/rooms/{$room->id}/bans")->assertUnauthorized();
    }
}
