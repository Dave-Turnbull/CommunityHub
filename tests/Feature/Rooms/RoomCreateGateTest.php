<?php

namespace Tests\Feature\Rooms;

use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Room creation now requires Permission::CreateRoom (previously ungated —
 * any authenticated user could create a room). Granted to the seeded
 * global Member role by default, so this is zero-behavior-change for
 * ordinary users — see Role::seedGlobalDefaults().
 */
class RoomCreateGateTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_with_the_default_global_member_role_can_create_a_room(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->post('/rooms', ['name' => 'My Cool Room']);

        $response->assertRedirect();
        $this->assertDatabaseHas('rooms', ['name' => 'My Cool Room']);
    }

    public function test_a_user_without_create_room_cannot_create_a_room(): void
    {
        $user = User::factory()->create();
        // Strip the factory-assigned global Member (which holds CreateRoom
        // by default) so the user holds no global role at all.
        RoleAssignment::where('user_id', $user->id)->delete();

        $response = $this->actingAs($user)->post('/rooms', ['name' => 'Nope']);

        $response->assertForbidden();
        $this->assertDatabaseCount('rooms', 0);
    }

    public function test_the_create_room_page_is_gated_the_same_way(): void
    {
        $user = User::factory()->create();
        RoleAssignment::where('user_id', $user->id)->delete();

        $response = $this->actingAs($user)->get('/rooms/create');

        $response->assertForbidden();
    }

    public function test_a_global_role_granting_create_room_permits_creation(): void
    {
        $user = User::factory()->create();
        RoleAssignment::where('user_id', $user->id)->delete();

        $role = Role::factory()->global()->create();
        $role->grant(\App\Support\Permission::CreateRoom);
        RoleAssignment::factory()->for($role)->for($user)->create();

        $response = $this->actingAs($user)->post('/rooms', ['name' => 'Granted Room']);

        $response->assertRedirect();
        $this->assertDatabaseHas('rooms', ['name' => 'Granted Room']);
    }
}
