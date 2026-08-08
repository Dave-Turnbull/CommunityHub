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
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * Posting into an 'announcement'-type channel is gated by
 * Permission::PostAnnouncements — see TextMessageService::authorizeSend and
 * ChannelPolicy::post. Reading an announcement channel is unrestricted (same
 * as any other text-capable type); only sending is gated.
 */
class AnnouncementPermissionTest extends TestCase
{
    use RefreshDatabase;

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

    public function test_a_plain_member_cannot_post_an_announcement(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'announcement']);
        [$user] = $this->memberWithRole($room);

        $response = $this->actingAs($user)
            ->postJson("/api/channels/{$channel->id}/messages", ['content' => 'Big news!']);

        $response->assertStatus(403);
        $this->assertDatabaseCount('messages', 0);
    }

    public function test_a_role_granted_post_announcements_can_post_an_announcement(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'announcement']);
        [$user] = $this->memberWithRole($room, Permission::PostAnnouncements);

        $response = $this->actingAs($user)
            ->postJson("/api/channels/{$channel->id}/messages", ['content' => 'Big news!']);

        $response->assertCreated();
        $this->assertDatabaseHas('messages', ['channel_id' => $channel->id, 'content' => 'Big news!']);
    }

    public function test_the_seeded_owner_role_can_post_an_announcement(): void
    {
        $owner = User::factory()->create();
        $room = Room::factory()->create(['owner_id' => $owner->id]);
        Role::seedDefaultsForRoom($room);
        $room->addMember($owner, asOwner: true);
        $channel = Channel::factory()->for($room)->create(['type' => 'announcement']);

        $response = $this->actingAs($owner)
            ->postJson("/api/channels/{$channel->id}/messages", ['content' => 'From the top']);

        $response->assertCreated();
    }

    public function test_the_seeded_moderator_role_can_post_an_announcement(): void
    {
        $room = Room::factory()->create();
        Role::seedDefaultsForRoom($room);
        $channel = Channel::factory()->for($room)->create(['type' => 'announcement']);

        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();
        $moderator = $room->roles()->where('name', 'Moderator')->firstOrFail();
        RoleAssignment::factory()->for($moderator)->for($user)->create();

        $response = $this->actingAs($user)
            ->postJson("/api/channels/{$channel->id}/messages", ['content' => 'Mod update']);

        $response->assertCreated();
    }

    public function test_the_seeded_member_role_cannot_post_an_announcement(): void
    {
        $room = Room::factory()->create();
        Role::seedDefaultsForRoom($room);
        $channel = Channel::factory()->for($room)->create(['type' => 'announcement']);

        $user = User::factory()->create();
        $room->addMember($user);

        $response = $this->actingAs($user)
            ->postJson("/api/channels/{$channel->id}/messages", ['content' => 'Sneaking one in']);

        $response->assertStatus(403);
    }

    public function test_a_plain_member_can_still_read_an_announcement_channel(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'announcement']);
        [$user] = $this->memberWithRole($room);
        \App\Models\Message::factory()->for($channel)->create(['content' => 'Welcome!']);

        $response = $this->actingAs($user)->getJson("/api/channels/{$channel->id}/messages");

        $response->assertOk();
        $response->assertJsonPath('data.0.content', 'Welcome!');
    }

    public function test_posting_a_normal_text_channel_is_unaffected(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'text']);
        [$user] = $this->memberWithRole($room);

        $response = $this->actingAs($user)
            ->postJson("/api/channels/{$channel->id}/messages", ['content' => 'Hello!']);

        $response->assertCreated();
    }

    public function test_channel_show_reports_can_post_false_for_a_plain_member_on_an_announcement_channel(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'announcement']);
        [$user] = $this->memberWithRole($room);

        $response = $this->actingAs($user)->get("/channels/{$channel->id}");

        $response->assertInertia(fn (Assert $page) => $page->where('channel.can_post', false));
    }

    public function test_channel_show_reports_can_post_true_for_a_role_granted_post_announcements(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'announcement']);
        [$user] = $this->memberWithRole($room, Permission::PostAnnouncements);

        $response = $this->actingAs($user)->get("/channels/{$channel->id}");

        $response->assertInertia(fn (Assert $page) => $page->where('channel.can_post', true));
    }

    public function test_channel_show_reports_can_post_true_for_a_normal_text_channel_regardless_of_role(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'text']);
        [$user] = $this->memberWithRole($room);

        $response = $this->actingAs($user)->get("/channels/{$channel->id}");

        $response->assertInertia(fn (Assert $page) => $page->where('channel.can_post', true));
    }
}
