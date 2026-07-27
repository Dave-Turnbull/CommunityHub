<?php

namespace Tests\Feature\Channels;

use App\Models\Channel;
use App\Models\ChannelRoleVisibility;
use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ChannelVisibilityTest extends TestCase
{
    use RefreshDatabase;

    /** Restricting a channel to a role — via the model directly, not attach()/sync(), since HasUuids' id generation needs the `creating` event (see Api\ChannelController::updateVisibility). */
    private function restrictTo(Channel $channel, Role $role): void
    {
        ChannelRoleVisibility::create(['channel_id' => $channel->id, 'role_id' => $role->id]);
    }

    private function memberWithRole(Room $room, ?Permission $permission = null): array
    {
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();

        $role = Role::factory()->for($room)->create();
        if ($permission) {
            $role->grant($permission);
        }
        RoleAssignment::factory()->for($role)->for($user)->create();

        return [$user, $role];
    }

    public function test_a_channel_with_no_restriction_is_visible_to_every_room_member(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        [$user] = $this->memberWithRole($room);

        $response = $this->actingAs($user)->get("/channels/{$channel->id}");

        $response->assertOk();
    }

    public function test_a_member_without_the_required_role_cannot_see_a_restricted_channel(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        [$allowedUser, $allowedRole] = $this->memberWithRole($room);
        [$deniedUser] = $this->memberWithRole($room);

        $this->restrictTo($channel, $allowedRole);

        $response = $this->actingAs($deniedUser)->get("/channels/{$channel->id}");

        $response->assertForbidden();
    }

    public function test_a_member_holding_the_required_role_can_see_a_restricted_channel(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        [$allowedUser, $allowedRole] = $this->memberWithRole($room);

        $this->restrictTo($channel, $allowedRole);

        $response = $this->actingAs($allowedUser)->get("/channels/{$channel->id}");

        $response->assertOk();
    }

    public function test_a_restricted_channel_is_excluded_from_the_rooms_channel_list_for_a_denied_user(): void
    {
        $room = Room::factory()->create();
        $visible = Channel::factory()->for($room)->create(['name' => 'general']);
        $restricted = Channel::factory()->for($room)->create(['name' => 'staff-only']);
        [$allowedUser, $allowedRole] = $this->memberWithRole($room);
        [$deniedUser] = $this->memberWithRole($room);

        $this->restrictTo($restricted, $allowedRole);

        $response = $this->actingAs($deniedUser)->get("/channels/{$visible->id}");

        $response->assertOk();
        $channelIds = collect($response->viewData('page')['props']['room']['channels'])->pluck('id');
        $this->assertTrue($channelIds->contains($visible->id));
        $this->assertFalse($channelIds->contains($restricted->id));
    }

    public function test_see_all_channels_permission_bypasses_the_restriction(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        [, $allowedRole] = $this->memberWithRole($room);
        [$staff] = $this->memberWithRole($room, Permission::SeeAllChannels);

        $this->restrictTo($channel, $allowedRole);

        $response = $this->actingAs($staff)->get("/channels/{$channel->id}");

        $response->assertOk();
    }

    public function test_administrator_bypasses_the_restriction(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        [, $allowedRole] = $this->memberWithRole($room);

        $owner = User::factory()->create();
        RoomMember::factory()->for($room)->for($owner)->create();
        $ownerRole = $room->roles()->where('is_system', true)->where('is_default', false)->first();
        RoleAssignment::factory()->for($ownerRole)->for($owner)->create();

        $this->restrictTo($channel, $allowedRole);

        $response = $this->actingAs($owner)->get("/channels/{$channel->id}");

        $response->assertOk();
    }

    public function test_setting_visibility_requires_manage_channel_visibility_not_just_manage_channels(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        [$user, $role] = $this->memberWithRole($room, Permission::ManageChannels);

        $response = $this->actingAs($user)->patchJson("/api/channels/{$channel->id}", [
            'visibility_role_ids' => [$role->id],
        ]);

        $response->assertForbidden();
        $this->assertDatabaseCount('channel_role_visibility', 0);
    }

    public function test_a_user_with_manage_channel_visibility_can_restrict_a_channel(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        [$user, $role] = $this->memberWithRole($room, Permission::ManageChannelVisibility);
        // Owner (rank INF) always outranks a room-scoped actor and must be
        // included too — see ChannelVisibilityHierarchyTest for that guard.
        $ownerRoleId = $room->roles()->where('is_system', true)->where('is_default', false)->first()->id;

        $response = $this->actingAs($user)->patchJson("/api/channels/{$channel->id}", [
            'visibility_role_ids' => [$role->id, $ownerRoleId],
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('channel_role_visibility', ['channel_id' => $channel->id, 'role_id' => $role->id]);
    }
}
