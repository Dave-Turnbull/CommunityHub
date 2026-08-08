<?php

namespace Tests\Feature\Messages;

use App\Models\Channel;
use App\Models\ChannelRoleVisibility;
use App\Models\Message;
use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Channel visibility (see docs/roles-and-permissions.md) is enforced at the
 * page load, the presence-auth callback, and — as of TextMessageService::
 * assertMember — the message API too: a room member restricted from seeing a
 * channel could previously still read or post its messages via
 * /api/channels/{channel}/messages directly, bypassing the restriction the
 * same way ChannelController::show/routes/channels.php already close off.
 */
class MessageVisibilityTest extends TestCase
{
    use RefreshDatabase;

    private function restrictTo(Channel $channel, Role $role): void
    {
        ChannelRoleVisibility::create(['channel_id' => $channel->id, 'role_id' => $role->id]);
    }

    private function memberWithRole(Room $room, ?Permission $permission = null): array
    {
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();

        // SendMessages is the baseline posting ability every ordinary member
        // has (granted to the seeded Member role by default) — this helper
        // represents that same baseline, optionally topped up with $permission.
        $role = Role::factory()->for($room)->create();
        $role->grant(Permission::SendMessages);
        if ($permission) {
            $role->grant($permission);
        }
        RoleAssignment::factory()->for($role)->for($user)->create();

        return [$user, $role];
    }

    public function test_a_member_denied_by_channel_visibility_cannot_list_messages_via_the_api(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        [, $allowedRole] = $this->memberWithRole($room);
        [$deniedUser] = $this->memberWithRole($room);
        $this->restrictTo($channel, $allowedRole);

        $this->actingAs($deniedUser)
            ->getJson("/api/channels/{$channel->id}/messages")
            ->assertForbidden();
    }

    public function test_a_member_denied_by_channel_visibility_cannot_use_the_around_cursor(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $message = Message::factory()->for($channel)->create();
        [, $allowedRole] = $this->memberWithRole($room);
        [$deniedUser] = $this->memberWithRole($room);
        $this->restrictTo($channel, $allowedRole);

        $this->actingAs($deniedUser)
            ->getJson("/api/channels/{$channel->id}/messages?around={$message->id}")
            ->assertForbidden();
    }

    public function test_a_member_denied_by_channel_visibility_cannot_send_a_message(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        [, $allowedRole] = $this->memberWithRole($room);
        [$deniedUser] = $this->memberWithRole($room);
        $this->restrictTo($channel, $allowedRole);

        $this->actingAs($deniedUser)
            ->postJson("/api/channels/{$channel->id}/messages", ['content' => 'sneaking in'])
            ->assertForbidden();

        $this->assertDatabaseCount('messages', 0);
    }

    public function test_a_member_holding_the_required_role_can_list_and_send(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        [$allowedUser, $allowedRole] = $this->memberWithRole($room);
        $this->restrictTo($channel, $allowedRole);

        $this->actingAs($allowedUser)
            ->getJson("/api/channels/{$channel->id}/messages")
            ->assertOk();

        $this->actingAs($allowedUser)
            ->postJson("/api/channels/{$channel->id}/messages", ['content' => 'hi'])
            ->assertCreated();
    }

    public function test_see_all_channels_permission_bypasses_the_restriction_for_the_message_api(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        [, $allowedRole] = $this->memberWithRole($room);
        [$staff] = $this->memberWithRole($room, Permission::SeeAllChannels);
        $this->restrictTo($channel, $allowedRole);

        $this->actingAs($staff)
            ->getJson("/api/channels/{$channel->id}/messages")
            ->assertOk();
    }
}
