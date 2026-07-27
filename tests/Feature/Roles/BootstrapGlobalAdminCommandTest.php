<?php

namespace Tests\Feature\Roles;

use App\Models\User;
use App\Support\Permission;
use App\Support\PermissionChecker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BootstrapGlobalAdminCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_grants_the_global_administrator_role_to_the_given_user(): void
    {
        $user = User::factory()->create(['email' => 'admin@example.com']);

        $this->artisan('app:bootstrap-admin', ['email' => 'admin@example.com'])
            ->assertSuccessful();

        $user->refresh();
        $this->assertTrue(PermissionChecker::can($user, Permission::Administrator));
    }

    public function test_running_it_twice_does_not_create_a_second_global_administrator_role(): void
    {
        $user = User::factory()->create(['email' => 'admin@example.com']);

        $this->artisan('app:bootstrap-admin', ['email' => 'admin@example.com'])->assertSuccessful();
        $this->artisan('app:bootstrap-admin', ['email' => 'admin@example.com'])->assertSuccessful();

        // Every factory-created user already holds the seeded global Member
        // role (see UserFactory::configure()) — this asserts bootstrap-admin
        // itself only ever creates one Administrator role alongside it, not
        // that "administrator" role count generically.
        $this->assertDatabaseCount('roles', 2);
        $this->assertSame(1, \App\Models\Role::where('name', 'Administrator')->whereNull('room_id')->count());
    }

    public function test_it_fails_for_an_unknown_email(): void
    {
        $this->artisan('app:bootstrap-admin', ['email' => 'nobody@example.com'])
            ->assertFailed();
    }
}
