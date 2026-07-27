<?php

namespace Tests\Feature\Channels;

use App\Models\Channel;
use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A lower-ranked role must never be able to lock a higher-ranked role out of
 * a channel — see Api\ChannelController::updateVisibility and
 * Permission::ManageChannelVisibility's docblock.
 */
class ChannelVisibilityHierarchyTest extends TestCase
{
    use RefreshDatabase;

    private function memberWithCustomRole(Room $room, int $position, ?Permission $permission = null): array
    {
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();

        $role = Role::factory()->for($room)->create(['position' => $position]);
        if ($permission) {
            $role->grant($permission);
        }
        RoleAssignment::factory()->for($role)->for($user)->create();

        return [$user, $role];
    }

    public function test_a_lower_ranked_role_cannot_exclude_a_higher_ranked_role_from_visibility(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();

        [$actor, $lowRole] = $this->memberWithCustomRole($room, 10, Permission::ManageChannelVisibility);
        [, $highRole] = $this->memberWithCustomRole($room, 90);

        $response = $this->actingAs($actor)->patchJson("/api/channels/{$channel->id}", [
            // Deliberately omits $highRole, which outranks the actor's own role.
            'visibility_role_ids' => [$lowRole->id],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('channel_role_visibility', 0);
    }

    public function test_a_higher_ranked_role_can_restrict_below_it(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();

        [$actor, $highRole] = $this->memberWithCustomRole($room, 90, Permission::ManageChannelVisibility);
        [, $lowRole] = $this->memberWithCustomRole($room, 10);
        // Owner (rank INF) always outranks a room-scoped actor and must be
        // included too — see the "cannot exclude a higher-ranked role" guard.
        $ownerRoleId = $room->roles()->where('is_system', true)->where('is_default', false)->first()->id;

        $response = $this->actingAs($actor)->patchJson("/api/channels/{$channel->id}", [
            'visibility_role_ids' => [$highRole->id, $ownerRoleId],
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('channel_role_visibility', ['channel_id' => $channel->id, 'role_id' => $highRole->id]);
        $this->assertDatabaseMissing('channel_role_visibility', ['channel_id' => $channel->id, 'role_id' => $lowRole->id]);
    }

    public function test_a_global_permission_holder_can_restrict_regardless_of_room_rank(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();

        $staff = User::factory()->create();
        RoomMember::factory()->for($room)->for($staff)->create();
        $globalRole = Role::factory()->global()->create();
        $globalRole->grant(Permission::ManageChannelVisibility);
        RoleAssignment::factory()->for($globalRole)->for($staff)->create();

        [$other, $lowRole] = $this->memberWithCustomRole($room, 10);

        $response = $this->actingAs($staff)->patchJson("/api/channels/{$channel->id}", [
            // Omits Owner entirely (rank INF, higher than anything the actor
            // holds in-room — they hold no room role at all) — still allowed
            // because the actor's ManageChannelVisibility grant is global.
            'visibility_role_ids' => [$lowRole->id],
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('channel_role_visibility', ['channel_id' => $channel->id, 'role_id' => $lowRole->id]);
    }
}
