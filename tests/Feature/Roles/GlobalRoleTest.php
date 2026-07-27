<?php

namespace Tests\Feature\Roles;

use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\User;
use App\Support\Permission;
use App\Support\PermissionChecker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GlobalRoleTest extends TestCase
{
    use RefreshDatabase;

    private function globalAdmin(): User
    {
        $user = User::factory()->create();

        $role = Role::factory()->global()->create(['name' => 'Administrator']);
        $role->grant(Permission::Administrator);
        RoleAssignment::factory()->for($role)->for($user)->create();

        return $user;
    }

    public function test_a_global_administrator_can_create_a_global_role(): void
    {
        $admin = $this->globalAdmin();

        $response = $this->actingAs($admin)->postJson('/api/settings/roles', ['name' => 'Moderator']);

        $response->assertCreated();
        $this->assertDatabaseHas('roles', ['room_id' => null, 'name' => 'Moderator']);
    }

    public function test_a_plain_user_cannot_create_a_global_role(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/settings/roles', ['name' => 'Moderator']);

        $response->assertForbidden();
    }

    public function test_a_guest_cannot_create_a_global_role(): void
    {
        $response = $this->postJson('/api/settings/roles', ['name' => 'Moderator']);

        $response->assertUnauthorized();
    }

    public function test_a_global_administrator_can_grant_a_global_role_to_a_user(): void
    {
        $admin = $this->globalAdmin();
        $target = User::factory()->create();

        $role = Role::factory()->global()->create();

        $response = $this->actingAs($admin)->postJson("/api/roles/{$role->id}/members", ['user_id' => $target->id]);

        $response->assertCreated();
        $this->assertDatabaseHas('role_assignments', ['role_id' => $role->id, 'user_id' => $target->id]);
    }

    public function test_granting_a_global_role_with_a_permission_makes_it_effective_everywhere(): void
    {
        $admin = $this->globalAdmin();
        $target = User::factory()->create();
        $room = Room::factory()->create();

        $role = Role::factory()->global()->create();
        $role->grant(Permission::ManageChannels);
        RoleAssignment::factory()->for($role)->for($target)->create();

        $this->assertTrue(PermissionChecker::can($target, Permission::ManageChannels, $room));
    }

    public function test_the_global_roles_api_endpoint_is_gated_by_manage_roles(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->getJson('/api/settings/roles');

        $response->assertForbidden();
    }

    public function test_a_global_administrator_can_fetch_global_roles_and_users(): void
    {
        $admin = $this->globalAdmin();
        Role::factory()->global()->create(['name' => 'Support']);

        $response = $this->actingAs($admin)->getJson('/api/settings/roles');

        $response->assertOk();
        $response->assertJsonFragment(['name' => 'Support']);
        $response->assertJsonFragment(['id' => $admin->id]);
    }

    public function test_the_settings_page_exposes_can_manage_global_roles(): void
    {
        $admin = $this->globalAdmin();
        $plain = User::factory()->create();

        $adminResponse = $this->actingAs($admin)->get('/settings');
        $adminResponse->assertInertia(fn ($page) => $page->where('can_manage_global_roles', true));

        $plainResponse = $this->actingAs($plain)->get('/settings');
        $plainResponse->assertInertia(fn ($page) => $page->where('can_manage_global_roles', false));
    }

    // ── Authorization gating for every global-role endpoint ────────────────
    // test_a_plain_user_cannot_create_a_global_role and
    // test_the_global_roles_api_endpoint_is_gated_by_manage_roles above cover
    // storeGlobal/indexGlobal; these cover the rest, mirroring
    // RoleManagementTest's room-scoped coverage.

    public function test_a_plain_user_cannot_update_a_global_role(): void
    {
        $user = User::factory()->create();
        $role = Role::factory()->global()->create();

        $response = $this->actingAs($user)->patchJson("/api/roles/{$role->id}", ['name' => 'Renamed']);

        $response->assertForbidden();
        $this->assertDatabaseMissing('roles', ['id' => $role->id, 'name' => 'Renamed']);
    }

    public function test_a_plain_user_cannot_delete_a_global_role(): void
    {
        $user = User::factory()->create();
        $role = Role::factory()->global()->create();

        $response = $this->actingAs($user)->deleteJson("/api/roles/{$role->id}");

        $response->assertForbidden();
        $this->assertDatabaseHas('roles', ['id' => $role->id]);
    }

    public function test_a_plain_user_cannot_add_a_member_to_a_global_role(): void
    {
        $user = User::factory()->create();
        $target = User::factory()->create();
        $role = Role::factory()->global()->create();

        $response = $this->actingAs($user)->postJson("/api/roles/{$role->id}/members", ['user_id' => $target->id]);

        $response->assertForbidden();
        $this->assertDatabaseMissing('role_assignments', ['role_id' => $role->id, 'user_id' => $target->id]);
    }

    public function test_a_plain_user_cannot_remove_a_member_from_a_global_role(): void
    {
        $user = User::factory()->create();
        $target = User::factory()->create();
        $role = Role::factory()->global()->create();
        RoleAssignment::factory()->for($role)->for($target)->create();

        $response = $this->actingAs($user)->deleteJson("/api/roles/{$role->id}/members/{$target->id}");

        $response->assertForbidden();
        $this->assertDatabaseHas('role_assignments', ['role_id' => $role->id, 'user_id' => $target->id]);
    }

    public function test_a_plain_user_cannot_reorder_global_roles(): void
    {
        $user = User::factory()->create();
        $one = Role::factory()->global()->create(['position' => 1]);
        $two = Role::factory()->global()->create(['position' => 2]);

        $response = $this->actingAs($user)->patchJson('/api/settings/roles/reorder', [
            'role_ids' => [$two->id, $one->id],
        ]);

        $response->assertForbidden();
    }

    public function test_the_administrator_permission_cannot_be_granted_to_a_global_role(): void
    {
        // Unlike room roles (where Administrator is reserved for the pinned
        // Owner tier), a global role has no such tier to reserve it for —
        // Api\RoleController::update's guard against granting it is
        // unconditional (predates global roles having any UI at all) and
        // blocks this for global roles too. The only way to grant
        // Administrator globally today is `php artisan app:bootstrap-admin`,
        // which writes it directly via Role::grant(), bypassing this
        // endpoint entirely — see docs/roles-and-permissions.md.
        $admin = $this->globalAdmin();
        $role = Role::factory()->global()->create();

        $response = $this->actingAs($admin)->patchJson("/api/roles/{$role->id}", [
            'permissions' => ['administrator'],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseMissing('role_permissions', ['role_id' => $role->id, 'permission' => 'administrator']);
    }

    // ── "Every user needs at least one (global) role" ──────────────────────
    // Regression coverage for a real bug: RoleController::removeMember/
    // destroy's fallback-to-default logic used to be gated on `$role->room`,
    // which is always null for a global role — so the guard silently did
    // nothing for global roles, allowing a user to be left holding zero
    // global roles. Fixed by comparing on room_id directly (see
    // hasOtherRoleInScope()/defaultRoleFor()).

    public function test_removing_a_users_only_global_role_the_default_member_role_is_blocked(): void
    {
        $admin = $this->globalAdmin();
        $target = User::factory()->create();
        $globalMember = Role::whereNull('room_id')->where('is_default', true)->firstOrFail();

        $response = $this->actingAs($admin)->deleteJson("/api/roles/{$globalMember->id}/members/{$target->id}");

        $response->assertStatus(422);
        $this->assertDatabaseHas('role_assignments', ['role_id' => $globalMember->id, 'user_id' => $target->id]);
    }

    public function test_removing_a_users_only_custom_global_role_falls_back_to_global_member(): void
    {
        $admin = $this->globalAdmin();
        $target = User::factory()->create();
        $globalMember = Role::whereNull('room_id')->where('is_default', true)->firstOrFail();
        // Strip the factory-assigned global Member so the custom role below
        // really is their only global role — matching the room-scoped
        // equivalent test's setup.
        RoleAssignment::where('role_id', $globalMember->id)->where('user_id', $target->id)->delete();

        $custom = Role::factory()->global()->create();
        RoleAssignment::factory()->for($custom)->for($target)->create();

        $response = $this->actingAs($admin)->deleteJson("/api/roles/{$custom->id}/members/{$target->id}");

        $response->assertOk();
        $this->assertDatabaseMissing('role_assignments', ['role_id' => $custom->id, 'user_id' => $target->id]);
        $this->assertDatabaseHas('role_assignments', ['role_id' => $globalMember->id, 'user_id' => $target->id]);
    }

    public function test_deleting_a_custom_global_role_falls_back_orphaned_users_to_global_member(): void
    {
        $admin = $this->globalAdmin();
        $target = User::factory()->create();
        $globalMember = Role::whereNull('room_id')->where('is_default', true)->firstOrFail();
        RoleAssignment::where('role_id', $globalMember->id)->where('user_id', $target->id)->delete();

        $custom = Role::factory()->global()->create();
        RoleAssignment::factory()->for($custom)->for($target)->create();

        $response = $this->actingAs($admin)->deleteJson("/api/roles/{$custom->id}");

        $response->assertOk();
        $this->assertDatabaseMissing('roles', ['id' => $custom->id]);
        $this->assertDatabaseHas('role_assignments', ['role_id' => $globalMember->id, 'user_id' => $target->id]);
    }
}
