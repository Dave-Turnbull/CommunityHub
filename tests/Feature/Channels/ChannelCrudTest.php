<?php

namespace Tests\Feature\Channels;

use App\Events\ChannelCreated;
use App\Events\ChannelDeleted;
use App\Events\ChannelUpdated;
use App\Models\Channel;
use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class ChannelCrudTest extends TestCase
{
    use RefreshDatabase;

    /** A plain member with only the room's default (no manage_channels) role. */
    private function plainMember(Room $room): User
    {
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();

        $default = $room->roles()->where('is_default', true)->first();
        if ($default) {
            RoleAssignment::factory()->for($default)->for($user)->create();
        }

        return $user;
    }

    private function memberWithManageChannels(Room $room): User
    {
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();

        $role = Role::factory()->for($room)->create();
        $role->grant(Permission::ManageChannels);
        RoleAssignment::factory()->for($role)->for($user)->create();

        return $user;
    }

    private function memberWithManageModChannels(Room $room): User
    {
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();

        $role = Role::factory()->for($room)->create();
        $role->grant(Permission::ManageModChannels);
        RoleAssignment::factory()->for($role)->for($user)->create();

        return $user;
    }

    /** A member holding only an explicit per-category grant — neither ManageChannels nor ManageModChannels. */
    private function memberWithCategoryGrant(Room $room, string $category): User
    {
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();

        $role = Role::factory()->for($room)->create();
        $role->channelCategories()->create(['category' => $category]);
        RoleAssignment::factory()->for($role)->for($user)->create();

        return $user;
    }

    public function test_a_user_with_manage_channels_can_create_a_channel(): void
    {
        Event::fake([ChannelCreated::class]);

        $room = Room::factory()->create();
        $user = $this->memberWithManageChannels($room);

        $response = $this->actingAs($user)->postJson("/api/rooms/{$room->id}/channels", [
            'name' => 'new-channel',
            'type' => 'text',
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('channels', ['room_id' => $room->id, 'name' => 'new-channel', 'type' => 'text']);
        Event::assertDispatched(ChannelCreated::class, fn ($e) => $e->channel->room_id === $room->id);
    }

    public function test_a_plain_member_cannot_create_a_channel(): void
    {
        $room = Room::factory()->create();
        $user = $this->plainMember($room);

        $response = $this->actingAs($user)->postJson("/api/rooms/{$room->id}/channels", [
            'name' => 'new-channel',
            'type' => 'text',
        ]);

        $response->assertForbidden();
        $this->assertDatabaseCount('channels', 0);
    }

    public function test_channel_creation_validates_type_against_the_registry(): void
    {
        $room = Room::factory()->create();
        $user = $this->memberWithManageChannels($room);

        $response = $this->actingAs($user)->postJson("/api/rooms/{$room->id}/channels", [
            'name' => 'new-channel',
            'type' => 'not-a-real-type',
        ]);

        $response->assertStatus(422);
    }

    public function test_channel_creation_requires_a_name(): void
    {
        $room = Room::factory()->create();
        $user = $this->memberWithManageChannels($room);

        $response = $this->actingAs($user)->postJson("/api/rooms/{$room->id}/channels", [
            'type' => 'text',
        ]);

        $response->assertStatus(422);
    }

    public function test_a_user_with_only_manage_channels_cannot_create_a_mod_category_channel(): void
    {
        $room = Room::factory()->create();
        $user = $this->memberWithManageChannels($room);

        $response = $this->actingAs($user)->postJson("/api/rooms/{$room->id}/channels", [
            'name' => 'announcements',
            'type' => 'announcement',
        ]);

        $response->assertForbidden();
        $this->assertDatabaseCount('channels', 0);
    }

    public function test_a_user_with_only_manage_channels_can_still_create_standard_types(): void
    {
        Event::fake([ChannelCreated::class]);

        $room = Room::factory()->create();
        $user = $this->memberWithManageChannels($room);

        $this->actingAs($user)->postJson("/api/rooms/{$room->id}/channels", [
            'name' => 'general',
            'type' => 'text',
        ])->assertCreated();

        $this->actingAs($user)->postJson("/api/rooms/{$room->id}/channels", [
            'name' => 'lounge',
            'type' => 'voice',
        ])->assertCreated();
    }

    public function test_a_user_with_manage_mod_channels_can_create_every_type_including_standard(): void
    {
        Event::fake([ChannelCreated::class]);

        $room = Room::factory()->create();
        $user = $this->memberWithManageModChannels($room);

        $this->actingAs($user)->postJson("/api/rooms/{$room->id}/channels", [
            'name' => 'announcements',
            'type' => 'announcement',
        ])->assertCreated();

        $this->actingAs($user)->postJson("/api/rooms/{$room->id}/channels", [
            'name' => 'general',
            'type' => 'text',
        ])->assertCreated();

        $this->actingAs($user)->postJson("/api/rooms/{$room->id}/channels", [
            'name' => 'lounge',
            'type' => 'voice',
        ])->assertCreated();
    }

    public function test_a_plain_member_cannot_create_a_mod_category_channel(): void
    {
        $room = Room::factory()->create();
        $user = $this->plainMember($room);

        $response = $this->actingAs($user)->postJson("/api/rooms/{$room->id}/channels", [
            'name' => 'announcements',
            'type' => 'announcement',
        ]);

        $response->assertForbidden();
    }

    public function test_a_user_with_manage_mod_channels_can_also_manage_an_existing_channel(): void
    {
        Event::fake([ChannelUpdated::class]);

        $room    = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['name' => 'old-name']);
        $user    = $this->memberWithManageModChannels($room);

        $response = $this->actingAs($user)->patchJson("/api/channels/{$channel->id}", [
            'name' => 'new-name',
        ]);

        $response->assertOk();
        $this->assertSame('new-name', $channel->fresh()->name);
    }

    public function test_a_role_with_only_a_mod_category_grant_can_create_announcement_but_not_text(): void
    {
        Event::fake([ChannelCreated::class]);

        $room = Room::factory()->create();
        $user = $this->memberWithCategoryGrant($room, 'mod');

        $this->actingAs($user)->postJson("/api/rooms/{$room->id}/channels", [
            'name' => 'announcements',
            'type' => 'announcement',
        ])->assertCreated();

        $this->actingAs($user)->postJson("/api/rooms/{$room->id}/channels", [
            'name' => 'general',
            'type' => 'text',
        ])->assertForbidden();
    }

    public function test_a_role_with_only_a_standard_category_grant_can_create_text_but_not_announcement(): void
    {
        Event::fake([ChannelCreated::class]);

        $room = Room::factory()->create();
        $user = $this->memberWithCategoryGrant($room, 'standard');

        $this->actingAs($user)->postJson("/api/rooms/{$room->id}/channels", [
            'name' => 'general',
            'type' => 'text',
        ])->assertCreated();

        $this->actingAs($user)->postJson("/api/rooms/{$room->id}/channels", [
            'name' => 'announcements',
            'type' => 'announcement',
        ])->assertForbidden();
    }

    public function test_a_category_grant_does_not_extend_to_managing_an_existing_channel(): void
    {
        $room    = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['name' => 'old-name', 'type' => 'announcement']);
        $user    = $this->memberWithCategoryGrant($room, 'mod');

        $response = $this->actingAs($user)->patchJson("/api/channels/{$channel->id}", [
            'name' => 'new-name',
        ]);

        $response->assertForbidden();
    }

    public function test_channel_creation_returns_a_validation_error_before_an_authorization_error(): void
    {
        $room = Room::factory()->create();
        $user = $this->plainMember($room);

        $response = $this->actingAs($user)->postJson("/api/rooms/{$room->id}/channels", [
            'name' => '',
            'type' => 'announcement',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('name');
    }

    public function test_a_user_with_manage_channels_can_update_a_channel(): void
    {
        Event::fake([ChannelUpdated::class]);

        $room    = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['name' => 'old-name']);
        $user    = $this->memberWithManageChannels($room);

        $response = $this->actingAs($user)->patchJson("/api/channels/{$channel->id}", [
            'name' => 'new-name',
        ]);

        $response->assertOk();
        $this->assertSame('new-name', $channel->fresh()->name);
        Event::assertDispatched(ChannelUpdated::class, fn ($e) => $e->channel->id === $channel->id);
    }

    public function test_a_plain_member_cannot_update_a_channel(): void
    {
        $room    = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['name' => 'old-name']);
        $user    = $this->plainMember($room);

        $response = $this->actingAs($user)->patchJson("/api/channels/{$channel->id}", [
            'name' => 'new-name',
        ]);

        $response->assertForbidden();
        $this->assertSame('old-name', $channel->fresh()->name);
    }

    public function test_a_user_with_manage_channels_can_delete_a_channel(): void
    {
        Event::fake([ChannelDeleted::class]);

        $room    = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user    = $this->memberWithManageChannels($room);

        $response = $this->actingAs($user)->deleteJson("/api/channels/{$channel->id}");

        $response->assertOk();
        $this->assertDatabaseMissing('channels', ['id' => $channel->id]);
        Event::assertDispatched(ChannelDeleted::class,
            fn ($e) => $e->channelId === $channel->id && $e->roomId === $room->id);
    }

    public function test_a_plain_member_cannot_delete_a_channel(): void
    {
        $room    = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user    = $this->plainMember($room);

        $response = $this->actingAs($user)->deleteJson("/api/channels/{$channel->id}");

        $response->assertForbidden();
        $this->assertDatabaseHas('channels', ['id' => $channel->id]);
    }

    public function test_a_user_with_manage_channels_can_reorder_channels(): void
    {
        $room = Room::factory()->create();
        $c1   = Channel::factory()->for($room)->create(['position' => 0]);
        $c2   = Channel::factory()->for($room)->create(['position' => 1]);
        $user = $this->memberWithManageChannels($room);

        $response = $this->actingAs($user)->patchJson("/api/rooms/{$room->id}/channels/reorder", [
            'channel_ids' => [$c2->id, $c1->id],
        ]);

        $response->assertOk();
        $this->assertSame(0, $c2->fresh()->position);
        $this->assertSame(1, $c1->fresh()->position);
    }

    public function test_reorder_rejects_a_channel_id_from_another_room(): void
    {
        $room       = Room::factory()->create();
        $otherRoom  = Room::factory()->create();
        $foreign    = Channel::factory()->for($otherRoom)->create();
        $user       = $this->memberWithManageChannels($room);

        $response = $this->actingAs($user)->patchJson("/api/rooms/{$room->id}/channels/reorder", [
            'channel_ids' => [$foreign->id],
        ]);

        $response->assertStatus(422);
    }
}
