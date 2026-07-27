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
}
