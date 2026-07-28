<?php

namespace Tests\Feature\Roles;

use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RoleManagementTest extends TestCase
{
    use RefreshDatabase;

    /** A room member holding a custom role with ManageRoles, ranked at $position (default: comfortably above a freshly-factory-created role's default 0). */
    private function memberWithManageRoles(Room $room, int $position = 50): User
    {
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();

        $role = Role::factory()->for($room)->create(['position' => $position]);
        $role->grant(Permission::ManageRoles);
        RoleAssignment::factory()->for($role)->for($user)->create();

        return $user;
    }

    /** A room member holding just the room's default (Member) role — mirrors what Room::addMember() actually does on join. */
    private function plainMember(Room $room): User
    {
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();

        $default = $room->roles()->where('is_default', true)->first();
        if ($default) {
            RoleAssignment::factory()->for($default)->for($user)->create();
        }

        return $user;
    }

    public function test_a_user_with_manage_roles_can_create_a_role(): void
    {
        $room = Room::factory()->create();
        $user = $this->memberWithManageRoles($room);

        $response = $this->actingAs($user)->postJson("/api/rooms/{$room->id}/roles", ['name' => 'Moderator']);

        $response->assertCreated();
        $this->assertDatabaseHas('roles', ['room_id' => $room->id, 'name' => 'Moderator']);
    }

    public function test_creating_a_role_returns_can_manage_true_for_the_creator(): void
    {
        // Regression: store() used to omit can_manage entirely, so a freshly
        // created role rendered as unmanageable (no add-member UI, etc.) in
        // the browser until a full page refresh re-fetched it correctly.
        $room  = Room::factory()->create();
        $owner = User::factory()->create();
        $room->addMember($owner, asOwner: true);

        $response = $this->actingAs($owner)->postJson("/api/rooms/{$room->id}/roles", ['name' => 'Moderator']);

        $response->assertCreated();
        $response->assertJson(['can_manage' => true]);
    }

    public function test_a_low_ranked_creator_may_not_be_able_to_manage_the_role_they_just_created(): void
    {
        // Known limitation, not something this change fixes: store()'s new
        // role always lands at "current max custom position + 1," with no
        // regard for the creator's own rank — see CLAUDE.md. A custom-role
        // holder ranked below some other existing custom role can end up
        // creating a role that outranks themselves, which they then can't
        // manage. can_manage correctly reports that (false), rather than
        // lying about it the way the pre-fix missing field effectively did.
        $room = Room::factory()->create();
        $user = $this->memberWithManageRoles($room, position: 5);
        Role::factory()->for($room)->create(['position' => 50]);

        $response = $this->actingAs($user)->postJson("/api/rooms/{$room->id}/roles", ['name' => 'Moderator']);

        $response->assertCreated();
        $response->assertJson(['can_manage' => false]);
    }

    public function test_a_plain_member_cannot_create_a_role(): void
    {
        $room = Room::factory()->create();
        $user = $this->plainMember($room);

        $response = $this->actingAs($user)->postJson("/api/rooms/{$room->id}/roles", ['name' => 'Moderator']);

        $response->assertForbidden();
    }

    public function test_a_role_can_be_renamed_and_granted_permissions(): void
    {
        $room = Room::factory()->create();
        $user = $this->memberWithManageRoles($room);
        $role = Role::factory()->for($room)->create(['name' => 'Mods', 'position' => 10]);

        $response = $this->actingAs($user)->patchJson("/api/roles/{$role->id}", [
            'name'        => 'Moderators',
            'permissions' => ['manage_channels', 'manage_messages'],
        ]);

        $response->assertOk();
        $this->assertSame('Moderators', $role->fresh()->name);
        $this->assertEqualsCanonicalizing(
            ['manage_channels', 'manage_messages'],
            $role->fresh()->rolePermissions->pluck('permission')->map(fn ($p) => $p->value)->all()
        );
    }

    public function test_a_roles_channel_categories_can_be_granted_and_replaced(): void
    {
        $room = Room::factory()->create();
        $user = $this->memberWithManageRoles($room);
        $role = Role::factory()->for($room)->create(['position' => 10]);

        $this->actingAs($user)->patchJson("/api/roles/{$role->id}", [
            'channel_categories' => ['mod', 'standard'],
        ])->assertOk();

        $this->assertEqualsCanonicalizing(
            ['mod', 'standard'],
            $role->fresh()->channelCategories->pluck('category')->all()
        );

        // A second update fully replaces the set, same as permissions.
        $this->actingAs($user)->patchJson("/api/roles/{$role->id}", [
            'channel_categories' => ['standard'],
        ])->assertOk();

        $this->assertSame(['standard'], $role->fresh()->channelCategories->pluck('category')->all());
    }

    public function test_an_unknown_channel_category_is_rejected(): void
    {
        $room = Room::factory()->create();
        $user = $this->memberWithManageRoles($room);
        $role = Role::factory()->for($room)->create(['position' => 10]);

        $response = $this->actingAs($user)->patchJson("/api/roles/{$role->id}", [
            'channel_categories' => ['not-a-real-category'],
        ]);

        $response->assertStatus(422);
        $this->assertEmpty($role->fresh()->channelCategories);
    }

    public function test_the_administrator_permission_cannot_be_granted_to_a_custom_role(): void
    {
        $room = Room::factory()->create();
        $user = $this->memberWithManageRoles($room);
        $role = Role::factory()->for($room)->create(['position' => 10]);

        $response = $this->actingAs($user)->patchJson("/api/roles/{$role->id}", [
            'permissions' => ['administrator'],
        ]);

        $response->assertStatus(422);
        $this->assertEmpty($role->fresh()->rolePermissions);
    }

    public function test_a_system_role_cannot_be_updated(): void
    {
        $room  = Room::factory()->create();
        $user  = $this->memberWithManageRoles($room);
        $owner = $room->roles()->where('is_system', true)->where('is_default', false)->firstOrFail();

        $response = $this->actingAs($user)->patchJson("/api/roles/{$owner->id}", ['name' => 'Renamed']);

        // Nothing outranks Owner (its rank is pinned to the hierarchy's top,
        // see Role::rank()), so RolePolicy::manage rejects before the
        // is_system business rule is even reached — a 403, not a 422.
        $response->assertForbidden();
    }

    public function test_the_default_role_permissions_can_be_edited(): void
    {
        $room    = Room::factory()->create();
        $user    = $this->memberWithManageRoles($room);
        $default = $room->roles()->where('is_default', true)->firstOrFail();

        $response = $this->actingAs($user)->patchJson("/api/roles/{$default->id}", [
            'permissions' => ['manage_messages'],
        ]);

        $response->assertOk();
        $this->assertEqualsCanonicalizing(
            ['manage_messages'],
            $default->fresh()->rolePermissions->pluck('permission')->map(fn ($p) => $p->value)->all()
        );
    }

    public function test_the_administrator_permission_cannot_be_granted_to_the_default_role(): void
    {
        $room    = Room::factory()->create();
        $user    = $this->memberWithManageRoles($room);
        $default = $room->roles()->where('is_default', true)->firstOrFail();
        $permissionsBefore = $default->rolePermissions->pluck('permission')->map(fn ($p) => $p->value)->all();

        $response = $this->actingAs($user)->patchJson("/api/roles/{$default->id}", [
            'permissions' => ['administrator'],
        ]);

        $response->assertStatus(422);
        $this->assertEqualsCanonicalizing(
            $permissionsBefore,
            $default->fresh()->rolePermissions->pluck('permission')->map(fn ($p) => $p->value)->all()
        );
    }

    public function test_the_default_roles_name_and_position_cannot_be_changed(): void
    {
        $room    = Room::factory()->create();
        $user    = $this->memberWithManageRoles($room);
        $default = $room->roles()->where('is_default', true)->firstOrFail();

        $response = $this->actingAs($user)->patchJson("/api/roles/{$default->id}", ['name' => 'Renamed']);

        $response->assertStatus(422);
        $this->assertSame('Member', $default->fresh()->name);
    }

    public function test_a_system_role_cannot_be_deleted(): void
    {
        $room    = Room::factory()->create();
        $user    = $this->memberWithManageRoles($room);
        $default = $room->roles()->where('is_default', true)->firstOrFail();

        $response = $this->actingAs($user)->deleteJson("/api/roles/{$default->id}");

        $response->assertStatus(422);
        $this->assertDatabaseHas('roles', ['id' => $default->id]);
    }

    public function test_a_custom_role_can_be_deleted(): void
    {
        $room = Room::factory()->create();
        $user = $this->memberWithManageRoles($room);
        $role = Role::factory()->for($room)->create(['position' => 10]);

        $response = $this->actingAs($user)->deleteJson("/api/roles/{$role->id}");

        $response->assertOk();
        $this->assertDatabaseMissing('roles', ['id' => $role->id]);
    }

    public function test_a_room_member_can_be_assigned_and_removed_from_a_custom_role(): void
    {
        $room   = Room::factory()->create();
        $user   = $this->memberWithManageRoles($room);
        $target = $this->plainMember($room);
        $role   = Role::factory()->for($room)->create(['position' => 10]);

        $assignResponse = $this->actingAs($user)->postJson("/api/roles/{$role->id}/members", [
            'user_id' => $target->id,
        ]);
        $assignResponse->assertCreated();
        $this->assertDatabaseHas('role_assignments', ['role_id' => $role->id, 'user_id' => $target->id]);

        $removeResponse = $this->actingAs($user)->deleteJson("/api/roles/{$role->id}/members/{$target->id}");
        $removeResponse->assertOk();
        $this->assertDatabaseMissing('role_assignments', ['role_id' => $role->id, 'user_id' => $target->id]);
    }

    public function test_a_user_not_in_the_room_cannot_be_assigned_a_role(): void
    {
        $room     = Room::factory()->create();
        $user     = $this->memberWithManageRoles($room);
        $outsider = User::factory()->create();
        $role     = Role::factory()->for($room)->create(['position' => 10]);

        $response = $this->actingAs($user)->postJson("/api/roles/{$role->id}/members", [
            'user_id' => $outsider->id,
        ]);

        $response->assertStatus(422);
    }

    // ── Hierarchy ────────────────────────────────────────────────────────

    public function test_a_role_can_manage_a_lower_ranked_role(): void
    {
        $room = Room::factory()->create();
        $user = $this->memberWithManageRoles($room, position: 50);
        $lower = Role::factory()->for($room)->create(['position' => 10]);

        $response = $this->actingAs($user)->patchJson("/api/roles/{$lower->id}", ['name' => 'Renamed']);

        $response->assertOk();
    }

    public function test_a_role_cannot_manage_a_higher_ranked_role(): void
    {
        $room  = Room::factory()->create();
        $user  = $this->memberWithManageRoles($room, position: 10);
        $higher = Role::factory()->for($room)->create(['position' => 50]);
        $higher->grant(Permission::ManageRoles);

        $response = $this->actingAs($user)->patchJson("/api/roles/{$higher->id}", ['name' => 'Renamed']);

        $response->assertForbidden();
    }

    public function test_a_role_cannot_manage_a_role_of_equal_rank_including_its_own(): void
    {
        $room = Room::factory()->create();
        $user = $this->memberWithManageRoles($room, position: 20);
        $ownRole = Role::where('room_id', $room->id)
            ->whereHas('assignments', fn ($q) => $q->where('user_id', $user->id))
            ->firstOrFail();
        $sibling = Role::factory()->for($room)->create(['position' => 20]);

        $this->actingAs($user)->patchJson("/api/roles/{$ownRole->id}", ['name' => 'Renamed'])->assertForbidden();
        $this->actingAs($user)->patchJson("/api/roles/{$sibling->id}", ['name' => 'Renamed'])->assertForbidden();
    }

    public function test_a_role_can_always_manage_the_default_role_regardless_of_position(): void
    {
        $room    = Room::factory()->create();
        $user    = $this->memberWithManageRoles($room, position: 1);
        $default = $room->roles()->where('is_default', true)->firstOrFail();

        $response = $this->actingAs($user)->patchJson("/api/roles/{$default->id}", ['permissions' => []]);

        $response->assertOk();
    }

    public function test_reordering_custom_roles_requires_managing_every_one_of_them(): void
    {
        $room = Room::factory()->create();
        $user = $this->memberWithManageRoles($room, position: 5);
        $actorRole = Role::where('room_id', $room->id)
            ->whereHas('assignments', fn ($q) => $q->where('user_id', $user->id))
            ->firstOrFail();
        $unmanageable = Role::factory()->for($room)->create(['position' => 50]);
        $unmanageable->grant(Permission::ManageRoles);
        // Every room seeds a Moderator role (is_system: false), which counts as a
        // custom role reorder must include — see Role::seedDefaultsForRoom().
        $moderator = $room->roles()->where('name', 'Moderator')->firstOrFail();

        $response = $this->actingAs($user)->patchJson("/api/rooms/{$room->id}/roles/reorder", [
            'role_ids' => [$unmanageable->id, $actorRole->id, $moderator->id],
        ]);

        $response->assertForbidden();
    }

    public function test_reordering_custom_roles_updates_their_positions(): void
    {
        $room = Room::factory()->create();
        $user = $this->memberWithManageRoles($room, position: 50);
        $actorRole = Role::where('room_id', $room->id)
            ->whereHas('assignments', fn ($q) => $q->where('user_id', $user->id))
            ->firstOrFail();
        $low = Role::factory()->for($room)->create(['position' => 10]);
        $mid = Role::factory()->for($room)->create(['position' => 20]);
        // Every room seeds a Moderator role (is_system: false), which counts as a
        // custom role reorder must include — see Role::seedDefaultsForRoom(). The
        // actor's own role (position 50) outranks-or-equals Moderator's seeded
        // position (50), so including it here doesn't change the 200 expectation.
        $moderator = $room->roles()->where('name', 'Moderator')->firstOrFail();

        $response = $this->actingAs($user)->patchJson("/api/rooms/{$room->id}/roles/reorder", [
            'role_ids' => [$low->id, $mid->id, $actorRole->id, $moderator->id],
        ]);

        $response->assertOk();
        $this->assertSame(4, $low->fresh()->position);
        $this->assertSame(3, $mid->fresh()->position);
        $this->assertSame(2, $actorRole->fresh()->position);
        $this->assertSame(1, $moderator->fresh()->position);
    }

    public function test_reordering_rejects_a_role_from_another_room(): void
    {
        $room      = Room::factory()->create();
        $otherRoom = Room::factory()->create();
        $user      = $this->memberWithManageRoles($room);
        $foreign   = Role::factory()->for($otherRoom)->create();

        $response = $this->actingAs($user)->patchJson("/api/rooms/{$room->id}/roles/reorder", [
            'role_ids' => [$foreign->id],
        ]);

        $response->assertStatus(422);
    }

    // ── Role membership: at least one role, and target-user hierarchy ──────

    public function test_a_member_can_be_removed_from_the_default_role_if_they_hold_another(): void
    {
        $room   = Room::factory()->create();
        $user   = $this->memberWithManageRoles($room);
        $target = $this->plainMember($room);
        $custom = Role::factory()->for($room)->create(['position' => 10]);
        RoleAssignment::factory()->for($custom)->for($target)->create();
        $default = $room->roles()->where('is_default', true)->firstOrFail();

        $response = $this->actingAs($user)->deleteJson("/api/roles/{$default->id}/members/{$target->id}");

        $response->assertOk();
        $this->assertDatabaseMissing('role_assignments', ['role_id' => $default->id, 'user_id' => $target->id]);
    }

    public function test_a_member_cannot_be_removed_from_the_default_role_if_it_is_their_only_role(): void
    {
        $room    = Room::factory()->create();
        $user    = $this->memberWithManageRoles($room);
        $target  = $this->plainMember($room);
        $default = $room->roles()->where('is_default', true)->firstOrFail();

        $response = $this->actingAs($user)->deleteJson("/api/roles/{$default->id}/members/{$target->id}");

        $response->assertStatus(422);
        $this->assertDatabaseHas('role_assignments', ['role_id' => $default->id, 'user_id' => $target->id]);
    }

    public function test_removing_a_users_only_custom_role_falls_back_to_member_instead_of_blocking(): void
    {
        $room   = Room::factory()->create();
        $user   = $this->memberWithManageRoles($room);
        $target = User::factory()->create();
        RoomMember::factory()->for($room)->for($target)->create();
        $custom  = Role::factory()->for($room)->create(['position' => 10]);
        $default = $room->roles()->where('is_default', true)->firstOrFail();
        RoleAssignment::factory()->for($custom)->for($target)->create();

        $response = $this->actingAs($user)->deleteJson("/api/roles/{$custom->id}/members/{$target->id}");

        $response->assertOk();
        $this->assertDatabaseMissing('role_assignments', ['role_id' => $custom->id, 'user_id' => $target->id]);
        $this->assertDatabaseHas('role_assignments', ['role_id' => $default->id, 'user_id' => $target->id]);
    }

    public function test_removing_a_users_only_custom_role_does_not_duplicate_an_existing_member_assignment(): void
    {
        $room   = Room::factory()->create();
        $user   = $this->memberWithManageRoles($room);
        $target = $this->plainMember($room);
        $custom = Role::factory()->for($room)->create(['position' => 10]);
        RoleAssignment::factory()->for($custom)->for($target)->create();

        $response = $this->actingAs($user)->deleteJson("/api/roles/{$custom->id}/members/{$target->id}");

        $response->assertOk();
        $default = $room->roles()->where('is_default', true)->firstOrFail();
        $this->assertSame(1, RoleAssignment::where('role_id', $default->id)->where('user_id', $target->id)->count());
    }

    public function test_deleting_a_role_falls_back_orphaned_users_to_member(): void
    {
        $room   = Room::factory()->create();
        $user   = $this->memberWithManageRoles($room);
        $target = User::factory()->create();
        RoomMember::factory()->for($room)->for($target)->create();
        $custom  = Role::factory()->for($room)->create(['position' => 10]);
        $default = $room->roles()->where('is_default', true)->firstOrFail();
        RoleAssignment::factory()->for($custom)->for($target)->create();

        $response = $this->actingAs($user)->deleteJson("/api/roles/{$custom->id}");

        $response->assertOk();
        $this->assertDatabaseMissing('roles', ['id' => $custom->id]);
        $this->assertDatabaseHas('role_assignments', ['role_id' => $default->id, 'user_id' => $target->id]);
    }

    public function test_deleting_a_role_does_not_reassign_a_user_who_holds_another_role(): void
    {
        $room   = Room::factory()->create();
        $user   = $this->memberWithManageRoles($room);
        $target = $this->plainMember($room);
        $custom = Role::factory()->for($room)->create(['position' => 10]);
        RoleAssignment::factory()->for($custom)->for($target)->create();
        $default = $room->roles()->where('is_default', true)->firstOrFail();

        $response = $this->actingAs($user)->deleteJson("/api/roles/{$custom->id}");

        $response->assertOk();
        // Already held Member before the deletion — still exactly one row, not duplicated.
        $this->assertSame(1, RoleAssignment::where('role_id', $default->id)->where('user_id', $target->id)->count());
    }

    public function test_a_role_cannot_add_a_higher_ranked_user_to_a_role_it_manages(): void
    {
        $room   = Room::factory()->create();
        $user   = $this->memberWithManageRoles($room, position: 50);
        $target = $this->memberWithManageRoles($room, position: 90);
        $lower  = Role::factory()->for($room)->create(['position' => 10]);

        $response = $this->actingAs($user)->postJson("/api/roles/{$lower->id}/members", ['user_id' => $target->id]);

        $response->assertForbidden();
    }

    public function test_a_role_cannot_add_an_equal_ranked_user_to_a_role_it_manages(): void
    {
        $room = Room::factory()->create();
        $user = $this->memberWithManageRoles($room, position: 50);
        $target = $this->memberWithManageRoles($room, position: 50);
        $lower  = Role::factory()->for($room)->create(['position' => 10]);

        $response = $this->actingAs($user)->postJson("/api/roles/{$lower->id}/members", ['user_id' => $target->id]);

        $response->assertForbidden();
    }

    public function test_a_role_can_add_or_remove_a_lower_ranked_user(): void
    {
        $room   = Room::factory()->create();
        $user   = $this->memberWithManageRoles($room, position: 50);
        $target = $this->plainMember($room);
        $lower  = Role::factory()->for($room)->create(['position' => 10]);

        $addResponse = $this->actingAs($user)->postJson("/api/roles/{$lower->id}/members", ['user_id' => $target->id]);
        $addResponse->assertCreated();

        $removeResponse = $this->actingAs($user)->deleteJson("/api/roles/{$lower->id}/members/{$target->id}");
        $removeResponse->assertOk();
    }

    public function test_a_role_cannot_remove_a_higher_ranked_user_from_a_role_it_manages(): void
    {
        $room  = Room::factory()->create();
        $user  = $this->memberWithManageRoles($room, position: 50);
        $target = $this->memberWithManageRoles($room, position: 90);
        $lower = Role::factory()->for($room)->create(['position' => 10]);
        RoleAssignment::factory()->for($lower)->for($target)->create();

        $response = $this->actingAs($user)->deleteJson("/api/roles/{$lower->id}/members/{$target->id}");

        $response->assertForbidden();
        $this->assertDatabaseHas('role_assignments', ['role_id' => $lower->id, 'user_id' => $target->id]);
    }

    public function test_a_user_can_remove_themselves_from_a_lower_role_they_also_hold(): void
    {
        $room = Room::factory()->create();
        // memberWithManageRoles' role (rank 50) is this user's highest —
        // without the self-exemption in RolePolicy::manage, comparing their
        // own highest role against itself would read as "equal rank" and
        // block this, even though $fallback (rank 10) isn't their highest.
        $user = $this->memberWithManageRoles($room, position: 50);
        $fallback = Role::factory()->for($room)->create(['position' => 10]);
        RoleAssignment::factory()->for($fallback)->for($user)->create();

        $response = $this->actingAs($user)->deleteJson("/api/roles/{$fallback->id}/members/{$user->id}");

        $response->assertOk();
        $this->assertDatabaseMissing('role_assignments', ['role_id' => $fallback->id, 'user_id' => $user->id]);
    }

    public function test_a_user_cannot_remove_themselves_from_their_own_highest_role(): void
    {
        $room = Room::factory()->create();
        $user = $this->memberWithManageRoles($room, position: 50);
        $ownRole = Role::where('room_id', $room->id)
            ->whereHas('assignments', fn ($q) => $q->where('user_id', $user->id))
            ->firstOrFail();

        $response = $this->actingAs($user)->deleteJson("/api/roles/{$ownRole->id}/members/{$user->id}");

        // Blocked by the same role-vs-actor rank check RolePolicy::manage
        // already applies to every role action — a role can never manage a
        // role at its own rank, including its own; the self-exemption only
        // covers the separate target-user comparison.
        $response->assertForbidden();
    }

    // ── GET /api/rooms/{room}/roles — backs RoomRolesPanel.tsx's self-fetch ──

    public function test_the_room_roles_endpoint_is_gated_by_manage_roles(): void
    {
        $room = Room::factory()->create();
        $user = $this->plainMember($room);

        $response = $this->actingAs($user)->getJson("/api/rooms/{$room->id}/roles");

        $response->assertForbidden();
    }

    public function test_the_room_roles_endpoint_requires_room_membership(): void
    {
        $room = Room::factory()->create();
        $outsider = User::factory()->create();

        $response = $this->actingAs($outsider)->getJson("/api/rooms/{$room->id}/roles");

        $response->assertForbidden();
    }

    public function test_a_user_with_manage_roles_can_fetch_room_roles_and_members(): void
    {
        $room = Room::factory()->create();
        $user = $this->memberWithManageRoles($room);
        Role::factory()->for($room)->create(['name' => 'Moderator']);

        $response = $this->actingAs($user)->getJson("/api/rooms/{$room->id}/roles");

        $response->assertOk();
        $response->assertJsonFragment(['name' => 'Moderator']);
        $response->assertJsonFragment(['id' => $user->id]);
    }
}
