<?php

namespace Tests\Feature\Notifications;

use App\Events\NotificationCreated;
use App\Models\Channel;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Notification;
use App\Models\NotificationPreference;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use App\Support\ChannelFocus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class NotificationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    private function participant(Conversation $conversation): User
    {
        $user = User::factory()->create();
        ConversationParticipant::factory()->for($conversation)->for($user)->create();

        return $user;
    }

    private function member(Room $room): User
    {
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();

        return $user;
    }

    public function test_sending_a_conversation_message_notifies_the_other_participant(): void
    {
        Event::fake([NotificationCreated::class]);

        $conversation = Conversation::factory()->create();
        $sender = $this->participant($conversation);
        $recipient = $this->participant($conversation);

        $this->actingAs($sender)
            ->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'Hey!'])
            ->assertCreated();

        $this->assertDatabaseHas('user_notifications', [
            'user_id' => $recipient->id,
            'type'    => 'direct_message',
        ]);

        Event::assertDispatched(
            NotificationCreated::class,
            fn ($e) => $e->notification->user_id === $recipient->id
                && $e->notification->data['sender_id'] === $sender->id
        );
    }

    public function test_sending_a_conversation_message_still_notifies_a_participant_with_a_stray_disabled_override(): void
    {
        // direct_message can't be disabled (NotificationPreference::IN_APP_LOCKED) —
        // this proves the floor in NotificationPreference::for() holds even if a
        // disabled row exists (e.g. from before the lock was introduced).
        $conversation = Conversation::factory()->create();
        $sender = $this->participant($conversation);
        $recipient = $this->participant($conversation);
        NotificationPreference::factory()->for($recipient)->forCategory('direct_message')
            ->create(['in_app' => false]);

        $this->actingAs($sender)
            ->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'Hey!'])
            ->assertCreated();

        $this->assertDatabaseHas('user_notifications', [
            'user_id' => $recipient->id,
            'type'    => 'direct_message',
        ]);
    }

    public function test_sending_a_conversation_message_does_not_notify_the_sender(): void
    {
        $conversation = Conversation::factory()->create();
        $sender = $this->participant($conversation);
        $this->participant($conversation);

        $this->actingAs($sender)
            ->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'Hey!'])
            ->assertCreated();

        $this->assertDatabaseMissing('user_notifications', ['user_id' => $sender->id]);
    }

    public function test_sending_a_channel_message_does_not_notify_room_members_by_default(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $sender = $this->member($room);
        $this->member($room);

        $this->actingAs($sender)
            ->postJson("/api/channels/{$channel->id}/messages", ['content' => 'Hey!'])
            ->assertCreated();

        $this->assertDatabaseMissing('user_notifications', ['type' => 'room_message']);
    }

    public function test_sending_a_channel_message_notifies_a_room_member_who_opted_in(): void
    {
        Event::fake([NotificationCreated::class]);

        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $sender = $this->member($room);
        $recipient = $this->member($room);
        NotificationPreference::factory()->for($recipient)->create([
            'category' => 'room_message', 'email' => false, 'in_app' => true,
        ]);

        $this->actingAs($sender)
            ->postJson("/api/channels/{$channel->id}/messages", ['content' => 'Hey!'])
            ->assertCreated();

        $this->assertDatabaseHas('user_notifications', [
            'user_id' => $recipient->id,
            'type'    => 'room_message',
        ]);

        Event::assertDispatched(
            NotificationCreated::class,
            fn ($e) => $e->notification->user_id === $recipient->id
                && $e->notification->data['channel_id'] === $channel->id
                && $e->notification->data['sender_id'] === $sender->id
        );
    }

    public function test_sending_a_channel_message_does_not_notify_the_sender_even_if_opted_in(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $sender = $this->member($room);
        NotificationPreference::factory()->for($sender)->create([
            'category' => 'room_message', 'email' => false, 'in_app' => true,
        ]);

        $this->actingAs($sender)
            ->postJson("/api/channels/{$channel->id}/messages", ['content' => 'Hey!'])
            ->assertCreated();

        $this->assertDatabaseMissing('user_notifications', ['user_id' => $sender->id]);
    }

    public function test_sending_a_channel_message_does_not_notify_a_focused_recipient(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $sender = $this->member($room);
        $recipient = $this->member($room);
        NotificationPreference::factory()->for($recipient)->create([
            'category' => 'room_message', 'email' => false, 'in_app' => true,
        ]);
        ChannelFocus::focus($recipient->id, $channel->id);

        $this->actingAs($sender)
            ->postJson("/api/channels/{$channel->id}/messages", ['content' => 'Hey!'])
            ->assertCreated();

        $this->assertDatabaseMissing('user_notifications', ['user_id' => $recipient->id]);
    }

    public function test_sending_a_channel_message_notifies_a_recipient_who_blurred_the_channel(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $sender = $this->member($room);
        $recipient = $this->member($room);
        NotificationPreference::factory()->for($recipient)->create([
            'category' => 'room_message', 'email' => false, 'in_app' => true,
        ]);
        ChannelFocus::focus($recipient->id, $channel->id);
        ChannelFocus::blur($recipient->id, $channel->id);

        $this->actingAs($sender)
            ->postJson("/api/channels/{$channel->id}/messages", ['content' => 'Hey!'])
            ->assertCreated();

        $this->assertDatabaseHas('user_notifications', [
            'user_id' => $recipient->id,
            'type'    => 'room_message',
        ]);
    }

    public function test_a_user_can_list_their_own_notifications(): void
    {
        $user = User::factory()->create();
        Notification::factory()->for($user)->create();
        Notification::factory()->create(); // someone else's

        $response = $this->actingAs($user)->getJson('/api/notifications');

        $response->assertOk();
        $response->assertJsonCount(1);
    }

    public function test_listing_excludes_notifications_for_a_category_the_user_has_since_disabled(): void
    {
        $user = User::factory()->create();
        Notification::factory()->for($user)->create(['type' => 'room_message']);
        Notification::factory()->for($user)->create(['type' => 'direct_message']);
        NotificationPreference::factory()->for($user)->create([
            'category' => 'room_message', 'email' => false, 'in_app' => false,
        ]);

        $response = $this->actingAs($user)->getJson('/api/notifications');

        $response->assertOk();
        $response->assertJsonCount(1);
        $this->assertSame('direct_message', $response->json('0.type'));
    }

    public function test_a_user_can_mark_their_notification_read(): void
    {
        $user = User::factory()->create();
        $notification = Notification::factory()->for($user)->create();

        $response = $this->actingAs($user)->postJson("/api/notifications/{$notification->id}/read");

        $response->assertOk();
        $this->assertNotNull($notification->fresh()->read_at);
    }

    public function test_a_user_cannot_mark_another_users_notification_read(): void
    {
        $owner = User::factory()->create();
        $notification = Notification::factory()->for($owner)->create();
        $intruder = User::factory()->create();

        $response = $this->actingAs($intruder)->postJson("/api/notifications/{$notification->id}/read");

        $response->assertForbidden();
        $this->assertNull($notification->fresh()->read_at);
    }

    public function test_a_user_can_mark_all_notifications_read(): void
    {
        $user = User::factory()->create();
        Notification::factory()->for($user)->count(3)->create();

        $response = $this->actingAs($user)->postJson('/api/notifications/read-all');

        $response->assertOk();
        $this->assertSame(0, $user->appNotifications()->whereNull('read_at')->count());
    }
}
