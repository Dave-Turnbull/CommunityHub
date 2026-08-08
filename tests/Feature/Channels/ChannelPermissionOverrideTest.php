<?php

namespace Tests\Feature\Channels;

use App\Models\Channel;
use App\Models\ChannelPermissionOverride;
use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ChannelPermissionOverrideTest extends TestCase
{
    use RefreshDatabase;

    private function memberWithRole(Room $room, Permission ...$permissions): array
    {
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();

        $role = Role::factory()->for($room)->create();
        foreach ($permissions as $permission) {
            $role->grant($permission);
        }
        RoleAssignment::factory()->for($role)->for($user)->create();

        return [$user, $role];
    }

    public function test_a_holder_of_manage_channel_visibility_can_set_overrides(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        [$user] = $this->memberWithRole($room, Permission::ManageChannelVisibility, Permission::SendMessages);
        $target = Role::factory()->for($room)->create();

        $response = $this->actingAs($user)->patchJson("/api/channels/{$channel->id}", [
            'permission_overrides' => [
                ['role_id' => $target->id, 'permission' => 'send_messages', 'allowed' => true],
            ],
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('channel_permission_overrides', [
            'channel_id' => $channel->id,
            'role_id'    => $target->id,
            'permission' => 'send_messages',
            'allowed'    => true,
        ]);
    }

    public function test_without_manage_channel_visibility_it_is_forbidden(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        [$user] = $this->memberWithRole($room);
        $target = Role::factory()->for($room)->create();

        $response = $this->actingAs($user)->patchJson("/api/channels/{$channel->id}", [
            'permission_overrides' => [
                ['role_id' => $target->id, 'permission' => 'send_messages', 'allowed' => true],
            ],
        ]);

        $response->assertForbidden();
    }

    public function test_force_granting_a_permission_the_actor_does_not_hold_is_rejected(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        [$user] = $this->memberWithRole($room, Permission::ManageChannelVisibility);
        $target = Role::factory()->for($room)->create();

        $response = $this->actingAs($user)->patchJson("/api/channels/{$channel->id}", [
            'permission_overrides' => [
                ['role_id' => $target->id, 'permission' => 'send_messages', 'allowed' => true],
            ],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('channel_permission_overrides', 0);
    }

    public function test_force_denying_a_permission_the_actor_does_not_hold_is_still_allowed(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        [$user] = $this->memberWithRole($room, Permission::ManageChannelVisibility);
        $target = Role::factory()->for($room)->create();
        $target->grant(Permission::SendMessages);

        $response = $this->actingAs($user)->patchJson("/api/channels/{$channel->id}", [
            'permission_overrides' => [
                ['role_id' => $target->id, 'permission' => 'send_messages', 'allowed' => false],
            ],
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('channel_permission_overrides', [
            'channel_id' => $channel->id, 'role_id' => $target->id, 'permission' => 'send_messages', 'allowed' => false,
        ]);
    }

    public function test_a_non_overridable_permission_is_rejected(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        [$user] = $this->memberWithRole($room, Permission::ManageChannelVisibility, Permission::BanMembers);
        $target = Role::factory()->for($room)->create();

        $response = $this->actingAs($user)->patchJson("/api/channels/{$channel->id}", [
            'permission_overrides' => [
                ['role_id' => $target->id, 'permission' => 'ban_members', 'allowed' => true],
            ],
        ]);

        $response->assertStatus(422);
    }

    public function test_a_second_update_fully_replaces_the_overrides(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        [$user] = $this->memberWithRole($room, Permission::ManageChannelVisibility, Permission::SendMessages, Permission::React);
        $target = Role::factory()->for($room)->create();

        $this->actingAs($user)->patchJson("/api/channels/{$channel->id}", [
            'permission_overrides' => [
                ['role_id' => $target->id, 'permission' => 'send_messages', 'allowed' => true],
            ],
        ])->assertOk();

        $this->actingAs($user)->patchJson("/api/channels/{$channel->id}", [
            'permission_overrides' => [
                ['role_id' => $target->id, 'permission' => 'react', 'allowed' => true],
            ],
        ])->assertOk();

        $this->assertDatabaseCount('channel_permission_overrides', 1);
        $this->assertDatabaseHas('channel_permission_overrides', [
            'channel_id' => $channel->id, 'role_id' => $target->id, 'permission' => 'react',
        ]);
    }

    public function test_a_role_from_another_room_is_rejected(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        [$user] = $this->memberWithRole($room, Permission::ManageChannelVisibility, Permission::SendMessages);
        $otherRoom = Room::factory()->create();
        $foreignRole = Role::factory()->for($otherRoom)->create();

        $response = $this->actingAs($user)->patchJson("/api/channels/{$channel->id}", [
            'permission_overrides' => [
                ['role_id' => $foreignRole->id, 'permission' => 'send_messages', 'allowed' => true],
            ],
        ]);

        $response->assertStatus(422);
    }
}
