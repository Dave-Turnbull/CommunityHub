<?php

namespace Tests\Feature\Roles;

use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\RoleRoomPermissionCeiling;
use App\Models\User;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoleRoomCeilingControllerTest extends TestCase
{
    use RefreshDatabase;

    private function globalAdmin(): User
    {
        $user = User::factory()->create();

        $role = Role::factory()->global()->create(['name' => 'Administrator', 'position' => 100, 'is_system' => true]);
        $role->grant(Permission::Administrator);
        RoleAssignment::factory()->for($role)->for($user)->create();

        return $user;
    }

    public function test_an_administrator_can_set_a_ceiling_on_a_custom_global_role(): void
    {
        $admin = $this->globalAdmin();
        $target = Role::factory()->global()->create();

        $response = $this->actingAs($admin)->patchJson("/api/settings/roles/{$target->id}/room-ceiling", [
            'has_ceiling' => true,
            'permissions' => ['manage_channels', 'ban_members'],
        ]);

        $response->assertOk();
        $this->assertTrue($target->fresh()->has_room_permission_ceiling);
        $this->assertEqualsCanonicalizing(
            ['manage_channels', 'ban_members'],
            $target->fresh()->roomPermissionCeilings->pluck('permission')->map(fn ($p) => $p->value)->all()
        );
    }

    public function test_a_plain_user_cannot_set_a_ceiling(): void
    {
        $user = User::factory()->create();
        $target = Role::factory()->global()->create();

        $response = $this->actingAs($user)->patchJson("/api/settings/roles/{$target->id}/room-ceiling", [
            'has_ceiling' => true,
            'permissions' => ['manage_channels'],
        ]);

        $response->assertForbidden();
    }

    public function test_setting_a_ceiling_on_a_room_scoped_role_is_rejected(): void
    {
        $admin = $this->globalAdmin();
        $room = \App\Models\Room::factory()->create();
        $target = Role::factory()->for($room)->create();

        $response = $this->actingAs($admin)->patchJson("/api/settings/roles/{$target->id}/room-ceiling", [
            'has_ceiling' => true,
            'permissions' => ['manage_channels'],
        ]);

        $response->assertStatus(422);
    }

    public function test_a_server_only_permission_is_rejected_from_a_room_ceiling(): void
    {
        $admin = $this->globalAdmin();
        $target = Role::factory()->global()->create();

        $response = $this->actingAs($admin)->patchJson("/api/settings/roles/{$target->id}/room-ceiling", [
            'has_ceiling' => true,
            'permissions' => ['create_room'],
        ]);

        $response->assertStatus(422);
    }

    public function test_an_actor_cannot_include_a_permission_outside_their_own_ceiling_capacity(): void
    {
        $actor = User::factory()->create();
        RoleAssignment::where('user_id', $actor->id)->delete();

        $actorRole = Role::factory()->global()->create(['position' => 100, 'has_room_permission_ceiling' => true]);
        $actorRole->grant(Permission::ManageRoles);
        RoleAssignment::factory()->for($actorRole)->for($actor)->create();
        RoleRoomPermissionCeiling::create(['role_id' => $actorRole->id, 'permission' => Permission::ManageChannels->value]);

        $target = Role::factory()->global()->create(['position' => 10]);

        $response = $this->actingAs($actor)->patchJson("/api/settings/roles/{$target->id}/room-ceiling", [
            'has_ceiling' => true,
            'permissions' => ['manage_channels', 'ban_members'],
        ]);

        $response->assertStatus(422);
        $this->assertCount(0, $target->fresh()->roomPermissionCeilings);
    }

    public function test_an_actor_can_include_a_permission_within_their_own_ceiling_capacity(): void
    {
        $actor = User::factory()->create();
        RoleAssignment::where('user_id', $actor->id)->delete();

        $actorRole = Role::factory()->global()->create(['position' => 100, 'has_room_permission_ceiling' => true]);
        $actorRole->grant(Permission::ManageRoles);
        RoleAssignment::factory()->for($actorRole)->for($actor)->create();
        RoleRoomPermissionCeiling::create(['role_id' => $actorRole->id, 'permission' => Permission::ManageChannels->value]);

        $target = Role::factory()->global()->create(['position' => 10]);

        $response = $this->actingAs($actor)->patchJson("/api/settings/roles/{$target->id}/room-ceiling", [
            'has_ceiling' => true,
            'permissions' => ['manage_channels'],
        ]);

        $response->assertOk();
        $this->assertSame(
            ['manage_channels'],
            $target->fresh()->roomPermissionCeilings->pluck('permission')->map(fn ($p) => $p->value)->all()
        );
    }

    public function test_removing_permissions_from_a_ceiling_is_always_allowed(): void
    {
        $actor = User::factory()->create();
        RoleAssignment::where('user_id', $actor->id)->delete();

        $actorRole = Role::factory()->global()->create(['position' => 100, 'has_room_permission_ceiling' => true]);
        $actorRole->grant(Permission::ManageRoles);
        RoleAssignment::factory()->for($actorRole)->for($actor)->create();
        RoleRoomPermissionCeiling::create(['role_id' => $actorRole->id, 'permission' => Permission::ManageChannels->value]);

        $target = Role::factory()->global()->create(['position' => 10, 'has_room_permission_ceiling' => true]);
        RoleRoomPermissionCeiling::create(['role_id' => $target->id, 'permission' => Permission::BanMembers->value]);

        $response = $this->actingAs($actor)->patchJson("/api/settings/roles/{$target->id}/room-ceiling", [
            'has_ceiling' => true,
            'permissions' => [],
        ]);

        $response->assertOk();
        $this->assertCount(0, $target->fresh()->roomPermissionCeilings);
    }

    public function test_a_second_update_fully_replaces_the_ceiling(): void
    {
        $admin = $this->globalAdmin();
        $target = Role::factory()->global()->create();

        $this->actingAs($admin)->patchJson("/api/settings/roles/{$target->id}/room-ceiling", [
            'has_ceiling' => true,
            'permissions' => ['manage_channels', 'ban_members'],
        ])->assertOk();

        $this->actingAs($admin)->patchJson("/api/settings/roles/{$target->id}/room-ceiling", [
            'has_ceiling' => true,
            'permissions' => ['manage_members'],
        ])->assertOk();

        $this->assertSame(
            ['manage_members'],
            $target->fresh()->roomPermissionCeilings->pluck('permission')->map(fn ($p) => $p->value)->all()
        );
    }

    public function test_a_lower_ranked_custom_global_role_cannot_set_a_ceiling_on_a_higher_ranked_one(): void
    {
        $actor = User::factory()->create();
        $actorRole = Role::factory()->global()->create(['position' => 10]);
        $actorRole->grant(Permission::ManageRoles);
        RoleAssignment::factory()->for($actorRole)->for($actor)->create();

        $target = Role::factory()->global()->create(['position' => 50]);

        $response = $this->actingAs($actor)->patchJson("/api/settings/roles/{$target->id}/room-ceiling", [
            'has_ceiling' => true,
            'permissions' => ['manage_channels'],
        ]);

        $response->assertForbidden();
    }

    public function test_turning_off_the_ceiling_flag_does_not_delete_stored_rows(): void
    {
        $admin = $this->globalAdmin();
        $target = Role::factory()->global()->create(['has_room_permission_ceiling' => true]);
        RoleRoomPermissionCeiling::create(['role_id' => $target->id, 'permission' => Permission::ManageChannels->value]);

        $response = $this->actingAs($admin)->patchJson("/api/settings/roles/{$target->id}/room-ceiling", [
            'has_ceiling' => false,
        ]);

        $response->assertOk();
        $this->assertFalse($target->fresh()->has_room_permission_ceiling);
        // Rows are left alone when `permissions` isn't part of the payload —
        // only has_ceiling changes; toggling back on later restores them.
        $this->assertCount(1, $target->fresh()->roomPermissionCeilings);
    }
}
