<?php

namespace Tests\Feature\Invites;

use App\Mail\RoomInviteMail;
use App\Models\Notification;
use App\Models\NotificationPreference;
use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\RoomInvite;
use App\Models\RoomMember;
use App\Models\User;
use App\Support\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class RoomInviteControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_room_member_can_invite_by_email(): void
    {
        Mail::fake();

        $room = Room::factory()->create();
        $member = User::factory()->create();
        RoomMember::factory()->for($room)->for($member)->create();

        $response = $this->actingAs($member)
            ->postJson("/api/rooms/{$room->id}/invites", ['email' => 'newperson@example.com']);

        $response->assertCreated();
        $this->assertDatabaseHas('room_invites', [
            'room_id'       => $room->id,
            'email'         => 'newperson@example.com',
            'invited_by_id' => $member->id,
        ]);
        Mail::assertQueued(RoomInviteMail::class, fn ($mail) => $mail->hasTo('newperson@example.com'));
    }

    public function test_a_non_member_cannot_invite(): void
    {
        Mail::fake();

        $room = Room::factory()->create();
        $outsider = User::factory()->create();

        $response = $this->actingAs($outsider)
            ->postJson("/api/rooms/{$room->id}/invites", ['email' => 'newperson@example.com']);

        $response->assertForbidden();
        Mail::assertNothingOutgoing();
    }

    public function test_a_non_member_holding_global_invite_members_can_invite(): void
    {
        Mail::fake();

        $room = Room::factory()->create();
        $staff = User::factory()->create();

        $globalRole = Role::factory()->global()->create();
        $globalRole->grant(Permission::InviteMembers);
        RoleAssignment::factory()->for($globalRole)->for($staff)->create();

        $response = $this->actingAs($staff)
            ->postJson("/api/rooms/{$room->id}/invites", ['email' => 'newperson@example.com']);

        $response->assertCreated();
        Mail::assertQueued(RoomInviteMail::class);
    }

    public function test_cannot_invite_an_email_that_is_already_a_member(): void
    {
        Mail::fake();

        $room = Room::factory()->create();
        $member = User::factory()->create();
        $alreadyMember = User::factory()->create(['email' => 'existing@example.com']);
        RoomMember::factory()->for($room)->for($member)->create();
        RoomMember::factory()->for($room)->for($alreadyMember)->create();

        $response = $this->actingAs($member)
            ->postJson("/api/rooms/{$room->id}/invites", ['email' => 'existing@example.com']);

        $response->assertUnprocessable();
        Mail::assertNothingOutgoing();
    }

    public function test_inviting_the_same_email_twice_reuses_the_pending_invite(): void
    {
        Mail::fake();

        $room = Room::factory()->create();
        $member = User::factory()->create();
        RoomMember::factory()->for($room)->for($member)->create();

        $this->actingAs($member)->postJson("/api/rooms/{$room->id}/invites", ['email' => 'newperson@example.com']);
        $this->actingAs($member)->postJson("/api/rooms/{$room->id}/invites", ['email' => 'newperson@example.com']);

        $this->assertSame(1, RoomInvite::where('room_id', $room->id)->where('email', 'newperson@example.com')->count());
        Mail::assertQueuedCount(2);
    }

    public function test_a_member_can_list_pending_invites(): void
    {
        $room = Room::factory()->create();
        $member = User::factory()->create();
        RoomMember::factory()->for($room)->for($member)->create();
        $invite = RoomInvite::factory()->for($room)->create();

        $response = $this->actingAs($member)->getJson("/api/rooms/{$room->id}/invites");

        $response->assertOk();
        $response->assertJsonFragment(['id' => $invite->id]);
    }

    public function test_inviting_an_existing_user_creates_an_in_app_notification(): void
    {
        Mail::fake();

        $room = Room::factory()->create();
        $member = User::factory()->create();
        RoomMember::factory()->for($room)->for($member)->create();
        $invitee = User::factory()->create(['email' => 'invitee@example.com']);

        $this->actingAs($member)
            ->postJson("/api/rooms/{$room->id}/invites", ['email' => 'invitee@example.com'])
            ->assertCreated();

        $this->assertDatabaseHas('user_notifications', [
            'user_id' => $invitee->id,
            'type'    => 'room_invite',
        ]);

        $invite = RoomInvite::where('room_id', $room->id)->where('email', 'invitee@example.com')->firstOrFail();
        $notification = Notification::where('user_id', $invitee->id)->firstOrFail();
        $this->assertSame($invite->token, $notification->data['invite_token']);
    }

    public function test_inviting_an_existing_user_who_turned_off_room_invite_emails_sends_no_email(): void
    {
        Mail::fake();

        $room = Room::factory()->create();
        $member = User::factory()->create();
        RoomMember::factory()->for($room)->for($member)->create();
        $invitee = User::factory()->create(['email' => 'invitee@example.com']);
        NotificationPreference::factory()->for($invitee)->create([
            'category' => 'room_invite', 'email' => false, 'in_app' => true,
        ]);

        $this->actingAs($member)
            ->postJson("/api/rooms/{$room->id}/invites", ['email' => 'invitee@example.com'])
            ->assertCreated();

        Mail::assertNothingOutgoing();
    }

    public function test_inviting_an_email_with_no_account_always_sends_an_email(): void
    {
        Mail::fake();

        $room = Room::factory()->create();
        $member = User::factory()->create();
        RoomMember::factory()->for($room)->for($member)->create();

        $this->actingAs($member)
            ->postJson("/api/rooms/{$room->id}/invites", ['email' => 'newperson@example.com'])
            ->assertCreated();

        Mail::assertQueued(RoomInviteMail::class);
    }

    public function test_a_member_can_revoke_an_invite(): void
    {
        $room = Room::factory()->create();
        $member = User::factory()->create();
        RoomMember::factory()->for($room)->for($member)->create();
        $invite = RoomInvite::factory()->for($room)->create();

        $response = $this->actingAs($member)->deleteJson("/api/invites/{$invite->id}");

        $response->assertOk();
        $this->assertDatabaseMissing('room_invites', ['id' => $invite->id]);
    }
}
