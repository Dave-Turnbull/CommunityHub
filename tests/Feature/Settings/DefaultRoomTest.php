<?php

namespace Tests\Feature\Settings;

use App\Jobs\EnrollExistingUsersInDefaultRoom;
use App\Models\InstanceSetting;
use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\RoomBan;
use App\Models\User;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class DefaultRoomTest extends TestCase
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

    public function test_a_server_admin_can_list_every_room_as_a_candidate(): void
    {
        $admin = $this->admin();
        Room::factory()->create(['name' => 'Zebra']);
        Room::factory()->create(['name' => 'Alpha']);

        $response = $this->actingAs($admin)->getJson('/api/settings/instance/rooms');

        $response->assertOk();
        $this->assertSame(['Alpha', 'Zebra'], array_column($response->json(), 'name'));
        $this->assertSame(['id', 'name'], array_keys($response->json()[0]));
    }

    public function test_a_server_admin_can_set_change_and_clear_the_default_room(): void
    {
        Queue::fake();
        $admin  = $this->admin();
        $first  = Room::factory()->create();
        $second = Room::factory()->create();

        $this->actingAs($admin)->putJson('/api/settings/instance/default-room', ['room_id' => $first->id])
            ->assertOk()
            ->assertJsonPath('default_room_id', $first->id);
        $this->assertSame($first->id, InstanceSetting::current()->default_room_id);

        $this->actingAs($admin)->putJson('/api/settings/instance/default-room', ['room_id' => $second->id])
            ->assertOk();
        $this->assertSame($second->id, InstanceSetting::current()->default_room_id);

        $this->actingAs($admin)->putJson('/api/settings/instance/default-room', ['room_id' => null])
            ->assertOk()
            ->assertJsonPath('default_room_id', null);
        $this->assertNull(InstanceSetting::current()->default_room_id);

        Queue::assertNothingPushed();
    }

    public function test_the_default_room_must_be_an_existing_room(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->putJson('/api/settings/instance/default-room', [
            'room_id' => '00000000-0000-4000-8000-000000000000',
        ])->assertJsonValidationErrors('room_id');

        $this->actingAs($admin)->putJson('/api/settings/instance/default-room', [])
            ->assertJsonValidationErrors('room_id');
    }

    public function test_changing_a_signup_toggle_leaves_the_default_room_alone(): void
    {
        $admin = $this->admin();
        $room  = Room::factory()->create();
        InstanceSetting::factory()->create(['default_room_id' => $room->id]);

        $this->actingAs($admin)->patchJson('/api/settings/instance', [
            'signup_manual_enabled'       => false,
            'signup_email_invite_enabled' => true,
            'signup_oauth_enabled'        => true,
            'default_room_id'             => null,
        ])->assertOk();

        $this->assertSame($room->id, InstanceSetting::current()->default_room_id);
    }

    public function test_a_non_admin_cannot_list_candidates_or_set_the_default_room(): void
    {
        $user = User::factory()->create();
        $room = Room::factory()->create();

        $this->actingAs($user)->getJson('/api/settings/instance/rooms')->assertForbidden();
        $this->actingAs($user)->putJson('/api/settings/instance/default-room', ['room_id' => $room->id])
            ->assertForbidden();
        $this->assertNull(InstanceSetting::current()->default_room_id);
    }

    public function test_a_guest_cannot_reach_the_default_room_endpoints(): void
    {
        $this->getJson('/api/settings/instance/rooms')->assertUnauthorized();
        $this->putJson('/api/settings/instance/default-room', ['room_id' => null])->assertUnauthorized();
    }

    public function test_setting_the_default_room_does_not_add_existing_users_unless_asked(): void
    {
        $admin    = $this->admin();
        $existing = User::factory()->create();
        $room     = Room::factory()->create();

        $this->actingAs($admin)->putJson('/api/settings/instance/default-room', ['room_id' => $room->id])
            ->assertOk();

        $this->assertFalse($room->hasMember($existing->id));
    }

    public function test_asking_to_add_existing_users_enrols_everyone_as_an_ordinary_member(): void
    {
        $admin    = $this->admin();
        $existing = User::factory()->create();
        $room     = Room::factory()->create();

        $this->actingAs($admin)->putJson('/api/settings/instance/default-room', [
            'room_id'         => $room->id,
            'enroll_existing' => true,
        ])->assertOk();

        $this->assertTrue($room->hasMember($existing->id));
        $this->assertTrue($room->hasMember($admin->id));
        $this->assertDatabaseHas('role_assignments', [
            'user_id' => $existing->id,
            'role_id' => $room->roles()->where('is_default', true)->firstOrFail()->id,
        ]);
    }

    public function test_adding_existing_users_skips_banned_users_and_does_not_duplicate_members(): void
    {
        $admin  = $this->admin();
        $banned = User::factory()->create();
        $member = User::factory()->create();
        $room   = Room::factory()->create();
        $room->addMember($member);
        RoomBan::create(['room_id' => $room->id, 'user_id' => $banned->id, 'banned_by_id' => $admin->id]);

        $this->actingAs($admin)->putJson('/api/settings/instance/default-room', [
            'room_id'         => $room->id,
            'enroll_existing' => true,
        ])->assertOk();

        $this->assertFalse($room->hasMember($banned->id));
        $this->assertSame(1, $room->members()->where('user_id', $member->id)->count());
    }

    public function test_adding_existing_users_skips_unverified_accounts_while_verification_is_enforced(): void
    {
        config(['verification.enabled' => true]);
        $admin      = $this->admin();
        $unverified = User::factory()->create(['email_verified_at' => null]);
        $verified   = User::factory()->create(['email_verified_at' => now()]);
        $room       = Room::factory()->create();

        $this->actingAs($admin)->putJson('/api/settings/instance/default-room', [
            'room_id'         => $room->id,
            'enroll_existing' => true,
        ])->assertOk();

        $this->assertTrue($room->hasMember($verified->id));
        $this->assertFalse($room->hasMember($unverified->id));
    }

    public function test_a_queued_bulk_run_does_nothing_once_the_default_room_has_changed(): void
    {
        $user  = User::factory()->create();
        $stale = Room::factory()->create();
        $other = Room::factory()->create();
        InstanceSetting::factory()->create(['default_room_id' => $other->id]);

        EnrollExistingUsersInDefaultRoom::dispatchSync($stale->id);

        $this->assertFalse($stale->hasMember($user->id));
        $this->assertFalse($other->hasMember($user->id));
    }
}
