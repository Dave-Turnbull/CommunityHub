<?php

namespace Tests\Feature\Uploads;

use App\Models\Attachment;
use App\Models\Channel;
use App\Models\ChannelRoleVisibility;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Message;
use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Web\AttachmentController::show — an attachment is gated exactly like the
 * message it's on (AttachmentPolicy/MessagePolicy), never independently
 * reachable by its URL. Mirrors MessageLinkTest's coverage of the same
 * underlying visibility rules, from the attachment side.
 */
class AttachmentVisibilityTest extends TestCase
{
    use RefreshDatabase;

    private function attachedTo(Message $message): Attachment
    {
        Storage::fake('local');
        $path = UploadedFile::fake()->image('photo.jpg')->store('uploads', 'local');

        return Attachment::factory()->for($message)->create(['path' => $path]);
    }

    public function test_a_room_member_can_view_an_attachment_on_a_channel_message(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();
        $message = Message::factory()->for($channel)->create();
        $attachment = $this->attachedTo($message);

        $this->actingAs($user)
            ->get("/attachments/{$attachment->id}")
            ->assertOk();
    }

    public function test_a_non_member_cannot_view_a_channel_message_attachment(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $message = Message::factory()->for($channel)->create();
        $attachment = $this->attachedTo($message);

        $this->actingAs(User::factory()->create())
            ->get("/attachments/{$attachment->id}")
            ->assertForbidden();
    }

    public function test_a_member_denied_by_channel_visibility_cannot_view_the_attachment(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $restrictedRole = Role::factory()->for($room)->create();
        ChannelRoleVisibility::create(['channel_id' => $channel->id, 'role_id' => $restrictedRole->id]);

        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();
        $message = Message::factory()->for($channel)->create();
        $attachment = $this->attachedTo($message);

        $this->actingAs($user)
            ->get("/attachments/{$attachment->id}")
            ->assertForbidden();
    }

    public function test_see_all_channels_permission_bypasses_the_visibility_restriction(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $restrictedRole = Role::factory()->for($room)->create();
        ChannelRoleVisibility::create(['channel_id' => $channel->id, 'role_id' => $restrictedRole->id]);

        $staff = User::factory()->create();
        RoomMember::factory()->for($room)->for($staff)->create();
        $staffRole = Role::factory()->for($room)->create();
        $staffRole->grant(Permission::SeeAllChannels);
        RoleAssignment::factory()->for($staffRole)->for($staff)->create();

        $message = Message::factory()->for($channel)->create();
        $attachment = $this->attachedTo($message);

        $this->actingAs($staff)
            ->get("/attachments/{$attachment->id}")
            ->assertOk();
    }

    public function test_a_conversation_participant_can_view_the_attachment(): void
    {
        $conversation = Conversation::create(['type' => 'dm']);
        $user = User::factory()->create();
        ConversationParticipant::create(['conversation_id' => $conversation->id, 'user_id' => $user->id]);
        $message = Message::factory()->inConversation()->create(['conversation_id' => $conversation->id]);
        $attachment = $this->attachedTo($message);

        $this->actingAs($user)
            ->get("/attachments/{$attachment->id}")
            ->assertOk();
    }

    public function test_a_non_participant_cannot_view_a_conversation_attachment(): void
    {
        $conversation = Conversation::create(['type' => 'dm']);
        $message = Message::factory()->inConversation()->create(['conversation_id' => $conversation->id]);
        $attachment = $this->attachedTo($message);

        $this->actingAs(User::factory()->create())
            ->get("/attachments/{$attachment->id}")
            ->assertForbidden();
    }

    public function test_the_uploader_can_view_their_own_not_yet_attached_upload(): void
    {
        Storage::fake('local');
        $path = UploadedFile::fake()->image('photo.jpg')->store('uploads', 'local');
        $uploader = User::factory()->create();
        $attachment = Attachment::factory()->create(['message_id' => null, 'path' => $path, 'uploader_id' => $uploader->id]);

        $this->actingAs($uploader)
            ->get("/attachments/{$attachment->id}")
            ->assertOk();
    }

    public function test_a_different_user_cannot_view_someone_elses_not_yet_attached_upload(): void
    {
        Storage::fake('local');
        $path = UploadedFile::fake()->image('photo.jpg')->store('uploads', 'local');
        $uploader = User::factory()->create();
        $attachment = Attachment::factory()->create(['message_id' => null, 'path' => $path, 'uploader_id' => $uploader->id]);

        $this->actingAs(User::factory()->create())
            ->get("/attachments/{$attachment->id}")
            ->assertForbidden();
    }

    public function test_a_guest_is_redirected_to_login(): void
    {
        $message = Message::factory()->create();
        $attachment = $this->attachedTo($message);

        $this->get("/attachments/{$attachment->id}")
            ->assertRedirect('/login');
    }

    public function test_the_upload_response_url_points_at_the_gated_route_not_a_raw_storage_path(): void
    {
        Storage::fake('local');
        $user = User::factory()->create();
        $file = UploadedFile::fake()->image('photo.jpg');

        $response = $this->actingAs($user)->postJson('/api/upload', ['file' => $file]);

        $attachmentId = $response->json('id');
        $response->assertJsonPath('url', route('attachments.show', ['attachment' => $attachmentId]));
        $response->assertJsonMissingPath('path');
    }

    public function test_a_legacy_row_with_no_path_404s_instead_of_erroring(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();
        $message = Message::factory()->for($channel)->create();
        $attachment = Attachment::factory()->for($message)->create(['path' => null]);

        $this->actingAs($user)
            ->get("/attachments/{$attachment->id}")
            ->assertNotFound();
    }
}
