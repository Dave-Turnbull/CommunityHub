<?php

namespace Tests\Feature\Settings;

use App\Models\InstanceSetting;
use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\User;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InstanceSettingsTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $user = User::factory()->create();
        $role = Role::factory()->global()->create();
        $role->grant(Permission::ManageRoles);
        RoleAssignment::factory()->for($role)->for($user)->create();

        return $user;
    }

    public function test_current_lazily_seeds_from_config_defaults(): void
    {
        config([
            'registration.manual_enabled'       => false,
            'registration.email_invite_enabled' => true,
            'registration.oauth_enabled'        => false,
        ]);

        $settings = InstanceSetting::current();

        $this->assertFalse($settings->signup_manual_enabled);
        $this->assertTrue($settings->signup_email_invite_enabled);
        $this->assertFalse($settings->signup_oauth_enabled);
        $this->assertDatabaseCount('instance_settings', 1);
    }

    public function test_a_server_admin_can_view_and_update_settings(): void
    {
        $admin = $this->admin();

        $response = $this->actingAs($admin)->getJson('/api/settings/instance');
        $response->assertOk();
        $response->assertJsonPath('signup_manual_enabled', true);

        $response = $this->actingAs($admin)->patchJson('/api/settings/instance', [
            'signup_manual_enabled'       => false,
            'signup_email_invite_enabled' => true,
            'signup_oauth_enabled'        => false,
        ]);

        $response->assertOk();
        $response->assertJsonPath('signup_manual_enabled', false);
        $this->assertFalse(InstanceSetting::current()->signup_manual_enabled);
    }

    public function test_a_non_admin_cannot_view_or_update_settings(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->getJson('/api/settings/instance')->assertForbidden();
        $this->actingAs($user)->patchJson('/api/settings/instance', [
            'signup_manual_enabled'       => false,
            'signup_email_invite_enabled' => false,
            'signup_oauth_enabled'        => false,
        ])->assertForbidden();
    }

    public function test_a_guest_cannot_view_or_update_settings(): void
    {
        $this->getJson('/api/settings/instance')->assertUnauthorized();
    }
}
