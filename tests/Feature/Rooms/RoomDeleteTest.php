<?php

namespace Tests\Feature\Rooms;

use App\Models\Attachment;
use App\Models\Channel;
use App\Models\InstanceSetting;
use App\Models\Message;
use App\Models\Notification;
use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\RoomBan;
use App\Models\RoomInvite;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

class RoomDeleteTest extends RoomSettingsTestCase
{
    public function test_the_owner_deletes_the_room_and_everything_under_it(): void
    {
        [$room, $owner] = $this->roomWithOwner();
        $member = $this->plainMember($room);
        $channel = Channel::factory()->for($room)->create();
        $message = Message::factory()->create(['channel_id' => $channel->id, 'author_id' => $member->id]);
        $trashed = Message::factory()->create(['channel_id' => $channel->id, 'author_id' => $member->id]);
        $trashed->delete();
        $roleIds = $room->roles()->pluck('id')->all();
        $this->assertNotEmpty($roleIds);
        RoomBan::create(['room_id' => $room->id, 'user_id' => User::factory()->create()->id, 'banned_by_id' => $owner->id]);
        RoomInvite::factory()->for($room)->create();

        $this->actingAs($owner)->deleteJson("/api/rooms/{$room->id}")
            ->assertOk()->assertJson(['deleted' => true]);

        $this->assertDatabaseMissing('rooms', ['id' => $room->id]);
        $this->assertDatabaseMissing('channels', ['room_id' => $room->id]);
        $this->assertDatabaseMissing('messages', ['id' => $message->id]);
        $this->assertDatabaseMissing('messages', ['id' => $trashed->id]);
        $this->assertDatabaseMissing('room_members', ['room_id' => $room->id]);
        $this->assertDatabaseMissing('roles', ['room_id' => $room->id]);
        $this->assertSame(0, RoleAssignment::whereIn('role_id', $roleIds)->count());
        $this->assertDatabaseMissing('room_bans', ['room_id' => $room->id]);
        $this->assertDatabaseMissing('room_invites', ['room_id' => $room->id]);
        $this->assertDatabaseMissing('room_permission_ceilings', ['room_id' => $room->id]);
        $this->assertDatabaseMissing('room_channel_category_ceilings', ['room_id' => $room->id]);
        $this->assertDatabaseMissing('custom_emojis', ['room_id' => $room->id]);
        $this->assertDatabaseMissing('role_permissions', ['role_id' => $roleIds[0]]);
    }

    public function test_a_restricted_rooms_ceilings_are_removed_too(): void
    {
        [$room, $owner] = $this->roomWithOwner();
        $room->update(['permission_ceiling_unrestricted' => false]);
        $room->permissionCeilings()->create(['permission' => 'send_messages']);
        $room->channelCategoryCeilings()->create(['category' => 'mod']);

        $this->actingAs($owner)->deleteJson("/api/rooms/{$room->id}")->assertOk();

        $this->assertDatabaseCount('room_permission_ceilings', 0);
        $this->assertDatabaseCount('room_channel_category_ceilings', 0);
    }

    public function test_attachment_files_and_rows_in_the_room_are_removed_but_other_rooms_are_untouched(): void
    {
        Storage::fake('local');
        [$room, $owner] = $this->roomWithOwner();
        [$otherRoom] = $this->roomWithOwner();
        $channel = Channel::factory()->for($room)->create();
        $otherChannel = Channel::factory()->for($otherRoom)->create();

        $make = function (Channel $channel) {
            $message = Message::factory()->create(['channel_id' => $channel->id]);
            $path = UploadedFile::fake()->image('p.jpg')->store('uploads', 'local');
            $attachment = Attachment::factory()->create(['message_id' => $message->id, 'path' => $path]);

            return [$attachment, $path];
        };
        [$attachment, $path] = $make($channel);
        [$otherAttachment, $otherPath] = $make($otherChannel);
        Storage::disk('local')->assertExists($path);

        $this->actingAs($owner)->deleteJson("/api/rooms/{$room->id}")->assertOk();

        Storage::disk('local')->assertMissing($path);
        $this->assertDatabaseMissing('attachments', ['id' => $attachment->id]);
        Storage::disk('local')->assertExists($otherPath);
        $this->assertDatabaseHas('attachments', ['id' => $otherAttachment->id]);
    }

    public function test_room_keyed_notifications_are_removed_but_others_are_kept(): void
    {
        [$room, $owner] = $this->roomWithOwner();
        $member = $this->plainMember($room);
        $other = Room::factory()->create();
        $row = fn (string $type, array $data) => Notification::create(['user_id' => $member->id, 'type' => $type, 'data' => $data]);
        $gone = $row('room_message', ['room_id' => $room->id, 'channel_id' => 'c']);
        $goneInvite = $row('room_invite', ['room_id' => $room->id, 'invite_token' => 't']);
        $kept = $row('room_message', ['room_id' => $other->id, 'channel_id' => 'c']);

        $this->actingAs($owner)->deleteJson("/api/rooms/{$room->id}")->assertOk();

        $this->assertDatabaseMissing('user_notifications', ['id' => $gone->id]);
        $this->assertDatabaseMissing('user_notifications', ['id' => $goneInvite->id]);
        $this->assertDatabaseHas('user_notifications', ['id' => $kept->id]);
    }

    public function test_deleting_the_default_room_clears_the_instance_default(): void
    {
        [$room, $owner] = $this->roomWithOwner();
        $setting = InstanceSetting::current();
        $setting->forceFill(['default_room_id' => $room->id])->save();
        $this->assertSame($room->id, InstanceSetting::current()->default_room_id);

        $this->actingAs($owner)->deleteJson("/api/rooms/{$room->id}")->assertOk();

        $this->assertNull(InstanceSetting::current()->default_room_id);
    }

    public function test_a_manage_room_holder_who_is_not_the_owner_cannot_delete(): void
    {
        [$room] = $this->roomWithOwner();
        $mod = $this->manageRoomMember($room);

        $this->actingAs($mod)->deleteJson("/api/rooms/{$room->id}")->assertForbidden();

        $this->assertDatabaseHas('rooms', ['id' => $room->id]);
    }

    public function test_a_plain_member_cannot_delete(): void
    {
        [$room] = $this->roomWithOwner();
        $member = $this->plainMember($room);

        $this->actingAs($member)->deleteJson("/api/rooms/{$room->id}")->assertForbidden();

        $this->assertDatabaseHas('rooms', ['id' => $room->id]);
    }

    public function test_a_global_administrator_who_is_not_the_owner_cannot_delete(): void
    {
        [$room] = $this->roomWithOwner();
        $admin = User::factory()->create();
        $role = Role::factory()->create(['room_id' => null, 'is_system' => true]);
        $role->grant(\App\Support\Permission::Administrator);
        RoleAssignment::factory()->for($role)->for($admin)->create();

        $this->actingAs($admin)->deleteJson("/api/rooms/{$room->id}")->assertForbidden();
    }
}
