<?php

namespace Tests\Unit\Support;

use App\Models\Channel;
use App\Models\ChannelPermissionOverride;
use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\User;
use App\Support\Permission;
use App\Support\PermissionChecker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PermissionCheckerCanInChannelTest extends TestCase
{
    use RefreshDatabase;

    private function roleHolding(Room $room, User $user, ?Permission $permission = null): Role
    {
        $role = Role::factory()->for($room)->create();
        if ($permission) {
            $role->grant($permission);
        }
        RoleAssignment::factory()->for($role)->for($user)->create();

        return $role;
    }

    public function test_with_no_override_rows_it_behaves_exactly_like_can(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = User::factory()->create();
        $this->roleHolding($room, $user, Permission::SendMessages);

        $this->assertTrue(PermissionChecker::canInChannel($user, Permission::SendMessages, $channel));
        $this->assertFalse(PermissionChecker::canInChannel($user, Permission::Vote, $channel));
    }

    public function test_an_override_row_can_force_a_holding_roles_contribution_off(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = User::factory()->create();
        $role = $this->roleHolding($room, $user, Permission::SendMessages);

        ChannelPermissionOverride::create([
            'channel_id' => $channel->id,
            'role_id'    => $role->id,
            'permission' => Permission::SendMessages->value,
            'allowed'    => false,
        ]);

        $this->assertFalse(PermissionChecker::canInChannel($user, Permission::SendMessages, $channel));
    }

    public function test_an_override_row_can_force_a_non_holding_roles_contribution_on(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = User::factory()->create();
        $role = $this->roleHolding($room, $user);

        ChannelPermissionOverride::create([
            'channel_id' => $channel->id,
            'role_id'    => $role->id,
            'permission' => Permission::SendMessages->value,
            'allowed'    => true,
        ]);

        $this->assertTrue(PermissionChecker::canInChannel($user, Permission::SendMessages, $channel));
    }

    public function test_a_denied_override_on_one_role_does_not_block_a_second_non_overridden_role(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = User::factory()->create();
        $deniedRole = $this->roleHolding($room, $user, Permission::SendMessages);
        $this->roleHolding($room, $user, Permission::SendMessages); // second role, not overridden

        ChannelPermissionOverride::create([
            'channel_id' => $channel->id,
            'role_id'    => $deniedRole->id,
            'permission' => Permission::SendMessages->value,
            'allowed'    => false,
        ]);

        $this->assertTrue(PermissionChecker::canInChannel($user, Permission::SendMessages, $channel));
    }

    public function test_administrator_bypasses_overrides_entirely(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = User::factory()->create();
        $role = $this->roleHolding($room, $user, Permission::Administrator);

        ChannelPermissionOverride::create([
            'channel_id' => $channel->id,
            'role_id'    => $role->id,
            'permission' => Permission::SendMessages->value,
            'allowed'    => false,
        ]);

        $this->assertTrue(PermissionChecker::canInChannel($user, Permission::SendMessages, $channel));
    }

    public function test_an_override_for_a_different_channel_does_not_apply(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $otherChannel = Channel::factory()->for($room)->create();
        $user = User::factory()->create();
        $role = $this->roleHolding($room, $user, Permission::SendMessages);

        ChannelPermissionOverride::create([
            'channel_id' => $otherChannel->id,
            'role_id'    => $role->id,
            'permission' => Permission::SendMessages->value,
            'allowed'    => false,
        ]);

        $this->assertTrue(PermissionChecker::canInChannel($user, Permission::SendMessages, $channel));
    }
}
