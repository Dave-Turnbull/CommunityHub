<?php

namespace Tests\Unit\Support;

use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\RoleRoomChannelCategoryCeiling;
use App\Models\RoleRoomPermissionCeiling;
use App\Models\Room;
use App\Models\User;
use App\Support\Permission;
use App\Support\PermissionCeiling;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PermissionCeilingTest extends TestCase
{
    use RefreshDatabase;

    // ── grantablePermissions() ──────────────────────────────────────────

    public function test_an_administrator_holder_can_grant_any_permission(): void
    {
        $room = Room::factory()->create();
        $actor = User::factory()->create();
        $actorRole = Role::factory()->for($room)->create();
        $actorRole->grant(Permission::Administrator);
        RoleAssignment::factory()->for($actorRole)->for($actor)->create();

        $targetRole = Role::factory()->for($room)->create();

        $grantable = PermissionCeiling::grantablePermissions($actor, $targetRole)->map(fn ($p) => $p->value)->all();

        $this->assertContains(Permission::ManageMembers->value, $grantable);
        $this->assertContains(Permission::BanMembers->value, $grantable);
    }

    public function test_an_actor_can_only_grant_permissions_they_currently_hold(): void
    {
        $room = Room::factory()->create();
        $actor = User::factory()->create();
        $actorRole = Role::factory()->for($room)->create();
        $actorRole->grant(Permission::ManageRoles);
        $actorRole->grant(Permission::ManageChannels);
        RoleAssignment::factory()->for($actorRole)->for($actor)->create();

        $targetRole = Role::factory()->for($room)->create();

        $grantable = PermissionCeiling::grantablePermissions($actor, $targetRole)->map(fn ($p) => $p->value)->all();

        $this->assertContains(Permission::ManageChannels->value, $grantable);
        $this->assertNotContains(Permission::BanMembers->value, $grantable);
    }

    public function test_grantable_permissions_works_for_a_global_role_target(): void
    {
        $actor = User::factory()->create();
        $actorRole = Role::factory()->global()->create();
        $actorRole->grant(Permission::ManageRoles);
        $actorRole->grant(Permission::CreateRoom);
        RoleAssignment::factory()->for($actorRole)->for($actor)->create();

        $targetRole = Role::factory()->global()->create();

        $grantable = PermissionCeiling::grantablePermissions($actor, $targetRole)->map(fn ($p) => $p->value)->all();

        $this->assertContains(Permission::CreateRoom->value, $grantable);
        $this->assertNotContains(Permission::InviteServer->value, $grantable);
    }

    // ── grantableCategories() ───────────────────────────────────────────

    public function test_manage_channels_grants_the_standard_category_but_not_mod(): void
    {
        $room = Room::factory()->create();
        $actor = User::factory()->create();
        $actorRole = Role::factory()->for($room)->create();
        $actorRole->grant(Permission::ManageChannels);
        RoleAssignment::factory()->for($actorRole)->for($actor)->create();

        $targetRole = Role::factory()->for($room)->create();

        $grantable = PermissionCeiling::grantableCategories($actor, $targetRole)->all();

        $this->assertContains('standard', $grantable);
        $this->assertNotContains('mod', $grantable);
    }

    public function test_manage_mod_channels_grants_the_mod_category(): void
    {
        $room = Room::factory()->create();
        $actor = User::factory()->create();
        $actorRole = Role::factory()->for($room)->create();
        $actorRole->grant(Permission::ManageModChannels);
        RoleAssignment::factory()->for($actorRole)->for($actor)->create();

        $targetRole = Role::factory()->for($room)->create();

        $grantable = PermissionCeiling::grantableCategories($actor, $targetRole)->all();

        $this->assertContains('mod', $grantable);
    }

    // ── actorCeilingCapacity() ───────────────────────────────────────────

    public function test_an_actor_with_no_restricted_global_role_is_unrestricted(): void
    {
        // Every factory-created user already holds the seeded global Member
        // role (see UserFactory::configure()), which defaults to
        // has_room_permission_ceiling: false.
        $actor = User::factory()->create();

        $this->assertSame('unrestricted', PermissionCeiling::actorCeilingCapacity($actor));
    }

    public function test_an_actor_whose_only_global_role_is_restricted_is_bounded_by_its_ceiling(): void
    {
        $actor = User::factory()->create();

        // Strip the factory-assigned unrestricted global Member so the
        // restricted role below really is their only global role.
        $globalMember = Role::whereNull('room_id')->where('is_default', true)->firstOrFail();
        RoleAssignment::where('role_id', $globalMember->id)->where('user_id', $actor->id)->delete();

        $restricted = Role::factory()->global()->create(['has_room_permission_ceiling' => true]);
        RoleAssignment::factory()->for($restricted)->for($actor)->create();
        RoleRoomPermissionCeiling::create(['role_id' => $restricted->id, 'permission' => Permission::ManageChannels->value]);

        $capacity = PermissionCeiling::actorCeilingCapacity($actor);

        $this->assertSame([Permission::ManageChannels->value], $capacity);
    }

    public function test_holding_any_unrestricted_global_role_makes_the_actor_unrestricted(): void
    {
        // Even with a restricted role also held, the unrestricted global
        // Member (held by every factory-created user) makes the actor
        // unrestricted overall — same "any role grants it" wildcard shape
        // as PermissionChecker::can()'s Administrator check.
        $actor = User::factory()->create();

        $restricted = Role::factory()->global()->create(['has_room_permission_ceiling' => true]);
        RoleAssignment::factory()->for($restricted)->for($actor)->create();
        RoleRoomPermissionCeiling::create(['role_id' => $restricted->id, 'permission' => Permission::ManageChannels->value]);

        $this->assertSame('unrestricted', PermissionCeiling::actorCeilingCapacity($actor));
    }

    public function test_actor_ceiling_category_capacity_mirrors_permission_capacity(): void
    {
        $actor = User::factory()->create();

        $globalMember = Role::whereNull('room_id')->where('is_default', true)->firstOrFail();
        RoleAssignment::where('role_id', $globalMember->id)->where('user_id', $actor->id)->delete();

        $restricted = Role::factory()->global()->create(['has_room_permission_ceiling' => true]);
        RoleAssignment::factory()->for($restricted)->for($actor)->create();
        RoleRoomChannelCategoryCeiling::create(['role_id' => $restricted->id, 'category' => 'standard']);

        $capacity = PermissionCeiling::actorCeilingCategoryCapacity($actor);

        $this->assertSame(['standard'], $capacity);
    }
}
