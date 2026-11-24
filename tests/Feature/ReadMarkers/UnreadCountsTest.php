<?php

namespace Tests\Feature\ReadMarkers;

use App\Models\Channel;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\ReadMarker;
use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\User;
use App\Services\ReadMarkerService;
use App\Support\Permission;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;

class UnreadCountsTest extends ReadMarkerTestCase
{
    private function conversationUnread(User $user, Conversation $conversation): int
    {
        return app(ReadMarkerService::class)->conversationUnreadCounts($user)[$conversation->id] ?? 0;
    }

    private function channelUnread(User $user, Channel $channel): int
    {
        return app(ReadMarkerService::class)->channelUnreadCounts($channel->room_id, $user)[$channel->id] ?? 0;
    }

    private function comment(Message $parent): Message
    {
        return Message::factory()->create([
            'channel_id'        => null,
            'parent_message_id' => $parent->id,
            'root_message_id'   => $parent->id,
            'depth'             => 1,
            'created_at'        => $this->now->copy()->subMinutes(30),
        ]);
    }

    // ── Conversations ────────────────────────────────────────────────────

    public function test_a_conversation_without_a_marker_counts_only_messages_after_the_user_joined(): void
    {
        $conversation = Conversation::factory()->create();
        $user = $this->participantIn($conversation, $this->now->copy()->subHours(2));
        $this->conversationMessage($conversation, $this->now->copy()->subHours(3));
        $this->conversationMessage($conversation, $this->now->copy()->subHour());
        $this->conversationMessage($conversation, $this->now->copy()->subMinutes(5));

        $this->assertSame(2, $this->conversationUnread($user, $conversation));
    }

    public function test_a_conversation_marker_overrides_the_join_baseline(): void
    {
        $conversation = Conversation::factory()->create();
        $user = $this->participantIn($conversation, $this->now->copy()->subHours(5));
        $this->conversationMessage($conversation, $this->now->copy()->subHours(4));
        $this->conversationMessage($conversation, $this->now->copy()->subHour());
        ReadMarker::factory()->inConversation()->create([
            'user_id'         => $user->id,
            'conversation_id' => $conversation->id,
            'last_read_at'    => $this->now->copy()->subHours(2),
        ]);

        $this->assertSame(1, $this->conversationUnread($user, $conversation));
    }

    public function test_a_message_exactly_at_the_marker_is_not_unread(): void
    {
        $conversation = Conversation::factory()->create();
        $user = $this->participantIn($conversation);
        $this->conversationMessage($conversation, $this->now);
        ReadMarker::factory()->inConversation()->create([
            'user_id' => $user->id, 'conversation_id' => $conversation->id, 'last_read_at' => $this->now,
        ]);

        $this->assertSame(0, $this->conversationUnread($user, $conversation));
    }

    public function test_own_messages_comments_and_deleted_messages_are_not_counted_in_a_conversation(): void
    {
        $conversation = Conversation::factory()->create();
        $user = $this->participantIn($conversation);
        $counted = $this->conversationMessage($conversation);
        $this->conversationMessage($conversation, null, ['author_id' => $user->id]);
        $this->comment($counted);
        $this->conversationMessage($conversation)->delete();
        $this->conversationMessage($conversation, null, ['is_tombstoned' => true])->delete();

        $this->assertSame(1, $this->conversationUnread($user, $conversation));
    }

    public function test_conversation_counts_are_per_user(): void
    {
        $conversation = Conversation::factory()->create();
        $reader = $this->participantIn($conversation);
        $sender = $this->participantIn($conversation);
        $this->conversationMessage($conversation, null, ['author_id' => $sender->id]);
        ReadMarker::factory()->inConversation()->create([
            'user_id' => $reader->id, 'conversation_id' => $conversation->id, 'last_read_at' => $this->now,
        ]);

        $this->assertSame(0, $this->conversationUnread($reader, $conversation));
        $this->assertSame(0, $this->conversationUnread($sender, $conversation));
    }

    public function test_the_shared_conversations_prop_carries_real_unread_counts(): void
    {
        $conversation = Conversation::factory()->create();
        $user = $this->participantIn($conversation);
        $this->conversationMessage($conversation);
        $this->conversationMessage($conversation);

        $this->actingAs($user)->get('/')->assertInertia(fn (Assert $page) => $page
            ->where('conversations.0.id', $conversation->id)
            ->where('conversations.0.unread_count', 2)
        );
    }

    public function test_opening_a_conversation_marks_it_read_and_reports_zero(): void
    {
        $conversation = Conversation::factory()->create();
        $user = $this->participantIn($conversation);
        $this->conversationMessage($conversation);

        $this->actingAs($user)->get("/conversations/{$conversation->id}")->assertInertia(fn (Assert $page) => $page
            ->where('conversations.0.unread_count', 0)
        );

        $this->assertDatabaseHas('read_markers', ['user_id' => $user->id, 'conversation_id' => $conversation->id]);
        $this->assertSame(0, $this->conversationUnread($user, $conversation));
    }

    public function test_marking_a_conversation_read_zeroes_its_count(): void
    {
        $conversation = Conversation::factory()->create();
        $user = $this->participantIn($conversation);
        $this->conversationMessage($conversation);
        $this->assertSame(1, $this->conversationUnread($user, $conversation));

        $this->actingAs($user)->postJson("/api/conversations/{$conversation->id}/read")->assertNoContent();

        $this->assertSame(0, $this->conversationUnread($user, $conversation));
    }

    // ── Channels ─────────────────────────────────────────────────────────

    public function test_a_channel_without_a_marker_counts_only_messages_after_the_user_joined_the_room(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = $this->memberOf($room, $this->now->copy()->subHours(2));
        $this->channelMessage($channel, $this->now->copy()->subHours(3));
        $this->channelMessage($channel, $this->now->copy()->subHour());

        $this->assertSame(1, $this->channelUnread($user, $channel));
    }

    public function test_a_channel_marker_overrides_the_join_baseline(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = $this->memberOf($room, $this->now->copy()->subHours(5));
        $this->channelMessage($channel, $this->now->copy()->subHours(4));
        $this->channelMessage($channel, $this->now->copy()->subHour());
        ReadMarker::factory()->create([
            'user_id' => $user->id, 'channel_id' => $channel->id, 'last_read_at' => $this->now->copy()->subHours(2),
        ]);

        $this->assertSame(1, $this->channelUnread($user, $channel));
    }

    public function test_own_messages_comments_and_deleted_messages_are_not_counted_in_a_channel(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = $this->memberOf($room);
        $counted = $this->channelMessage($channel);
        $this->channelMessage($channel, null, ['author_id' => $user->id]);
        $this->comment($counted);
        $this->channelMessage($channel)->delete();
        $this->channelMessage($channel, null, ['is_tombstoned' => true])->delete();

        $this->assertSame(1, $this->channelUnread($user, $channel));
    }

    public function test_marking_a_channel_read_zeroes_its_count(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = $this->memberOf($room);
        $this->channelMessage($channel);
        $this->assertSame(1, $this->channelUnread($user, $channel));

        $this->actingAs($user)->postJson("/api/channels/{$channel->id}/read")->assertNoContent();

        $this->assertSame(0, $this->channelUnread($user, $channel));
    }

    public function test_the_channels_prop_carries_unread_counts_and_the_opened_channel_is_zero(): void
    {
        $room = Room::factory()->create();
        $opened = Channel::factory()->for($room)->create(['name' => 'opened', 'position' => 0]);
        $other = Channel::factory()->for($room)->create(['name' => 'other', 'position' => 1]);
        $user = $this->memberOf($room);
        $this->channelMessage($opened);
        $this->channelMessage($other);
        $this->channelMessage($other);

        $this->actingAs($user)->get("/channels/{$opened->id}")->assertInertia(fn (Assert $page) => $page
            ->where('room.channels.0.id', $opened->id)
            ->where('room.channels.0.unread_count', 0)
            ->where('room.channels.1.id', $other->id)
            ->where('room.channels.1.unread_count', 2)
        );

        $this->assertDatabaseHas('read_markers', ['user_id' => $user->id, 'channel_id' => $opened->id]);
        $this->assertDatabaseMissing('read_markers', ['user_id' => $user->id, 'channel_id' => $other->id]);
    }

    public function test_a_channel_hidden_from_the_user_is_not_counted_and_does_not_set_has_unread(): void
    {
        $room = Room::factory()->create();
        $visible = Channel::factory()->for($room)->create(['position' => 0]);
        $hidden = Channel::factory()->for($room)->create(['position' => 1]);
        $allowed = $this->memberOf($room);
        $denied = $this->memberOf($room);
        $this->restrictToNewRole($hidden, $allowed);
        $this->channelMessage($hidden);

        $this->assertSame(0, $this->channelUnread($denied, $hidden));
        $this->assertSame(1, $this->channelUnread($allowed, $hidden));

        $this->actingAs($denied)->get("/channels/{$visible->id}")->assertInertia(fn (Assert $page) => $page
            ->has('room.channels', 1)
            ->where('rooms.0.has_unread', false)
        );
        $this->actingAs($allowed)->get("/channels/{$visible->id}")->assertInertia(fn (Assert $page) => $page
            ->where('room.channels.1.unread_count', 1)
            ->where('rooms.0.has_unread', true)
        );
    }

    public function test_a_see_all_channels_role_counts_restricted_channels(): void
    {
        $room = Room::factory()->create();
        $hidden = Channel::factory()->for($room)->create();
        $moderator = $this->memberOf($room);
        $this->restrictToNewRole($hidden);
        $role = Role::factory()->for($room)->create();
        $role->grant(Permission::SeeAllChannels);
        RoleAssignment::factory()->for($role)->for($moderator)->create();
        $this->channelMessage($hidden);

        $this->assertTrue($hidden->isVisibleTo($moderator));
        $this->assertSame(1, $this->channelUnread($moderator, $hidden));
        $this->assertSame([$room->id], app(ReadMarkerService::class)->roomIdsWithUnread($moderator));
    }

    public function test_a_global_administrator_counts_restricted_channels_in_every_room(): void
    {
        $room = Room::factory()->create();
        $hidden = Channel::factory()->for($room)->create();
        $admin = $this->memberOf($room);
        $this->restrictToNewRole($hidden);
        $globalRole = Role::factory()->create(['room_id' => null]);
        $globalRole->grant(Permission::Administrator);
        RoleAssignment::factory()->for($globalRole)->for($admin)->create();
        $this->channelMessage($hidden);

        $this->assertTrue($hidden->isVisibleTo($admin));
        $this->assertSame(1, $this->channelUnread($admin, $hidden));
        $this->assertSame([$room->id], app(ReadMarkerService::class)->roomIdsWithUnread($admin));
    }

    public function test_a_channel_in_a_room_the_user_is_not_in_is_not_counted(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $outsider = User::factory()->create();
        $this->channelMessage($channel);

        $this->assertSame([], app(ReadMarkerService::class)->channelUnreadCounts($room->id, $outsider));
        $this->assertSame([], app(ReadMarkerService::class)->roomIdsWithUnread($outsider));
    }

    // ── Rooms ────────────────────────────────────────────────────────────

    public function test_the_shared_rooms_prop_flags_only_rooms_with_unread_visible_messages(): void
    {
        $unreadRoom = Room::factory()->create(['name' => 'Unread']);
        $readRoom = Room::factory()->create(['name' => 'Read']);
        $unreadChannel = Channel::factory()->for($unreadRoom)->create();
        $readChannel = Channel::factory()->for($readRoom)->create();
        $user = $this->memberOf($unreadRoom);
        \App\Models\RoomMember::factory()->for($readRoom)->for($user)->create(['joined_at' => $this->now->copy()->subDay()]);
        $this->channelMessage($unreadChannel);
        $this->channelMessage($readChannel, null, ['author_id' => $user->id]);

        $response = $this->actingAs($user)->get('/');

        $response->assertInertia(fn (Assert $page) => $page
            ->where('rooms', fn ($rooms) => collect($rooms)->pluck('has_unread', 'id')->all() === [
                $unreadRoom->id => true,
                $readRoom->id   => false,
            ])
        );
    }

    public function test_has_unread_clears_for_the_room_after_every_unread_channel_is_marked_read(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = $this->memberOf($room);
        $this->channelMessage($channel);

        $this->actingAs($user)->get('/')->assertInertia(fn (Assert $page) => $page->where('rooms.0.has_unread', true));

        $this->actingAs($user)->postJson("/api/channels/{$channel->id}/read")->assertNoContent();

        $this->actingAs($user)->get('/')->assertInertia(fn (Assert $page) => $page->where('rooms.0.has_unread', false));
    }

    // ── Query counts ─────────────────────────────────────────────────────

    private function countQueries(callable $fn): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $fn();
        $count = count(DB::getQueryLog());
        DB::disableQueryLog();

        return $count;
    }

    public function test_conversation_counts_are_one_query_regardless_of_conversation_count(): void
    {
        $user = User::factory()->create();
        foreach (range(1, 6) as $i) {
            $conversation = Conversation::factory()->create();
            \App\Models\ConversationParticipant::factory()->for($conversation)->for($user)->create(['created_at' => $this->now->copy()->subDay()]);
            $this->conversationMessage($conversation);
        }

        $service = app(ReadMarkerService::class);
        $counts = [];
        $queries = $this->countQueries(function () use ($service, $user, &$counts) {
            $counts = $service->conversationUnreadCounts($user);
        });

        $this->assertCount(6, $counts);
        $this->assertSame(1, $queries);
    }

    public function test_channel_and_room_counts_do_not_scale_with_channel_or_room_count(): void
    {
        $user = User::factory()->create();
        $channels = [];
        foreach (range(1, 3) as $r) {
            $room = Room::factory()->create();
            \App\Models\RoomMember::factory()->for($room)->for($user)->create(['joined_at' => $this->now->copy()->subDay()]);
            foreach (range(1, 4) as $c) {
                $channel = Channel::factory()->for($room)->create();
                $this->channelMessage($channel);
                $channels[$room->id][] = $channel;
            }
            $this->restrictToNewRole($channels[$room->id][0]);
        }

        $service = app(ReadMarkerService::class);
        $roomId = array_key_first($channels);

        $counts = [];
        $perRoom = $this->countQueries(function () use ($service, $roomId, $user, &$counts) {
            $counts = $service->channelUnreadCounts($roomId, $user);
        });
        $this->assertCount(3, $counts);

        $unreadRooms = [];
        $allRooms = $this->countQueries(function () use ($service, $user, &$unreadRooms) {
            $unreadRooms = $service->roomIdsWithUnread($user);
        });
        $this->assertCount(3, $unreadRooms);

        // One query for the user's role assignments (+ their permissions), one for the count itself.
        $this->assertSame(3, $perRoom);
        $this->assertSame(3, $allRooms);
    }

    public function test_the_shared_props_add_a_fixed_number_of_queries_as_data_grows(): void
    {
        $user = User::factory()->create();
        $build = function (int $n) use ($user) {
            foreach (range(1, $n) as $i) {
                $conversation = Conversation::factory()->create();
                \App\Models\ConversationParticipant::factory()->for($conversation)->for($user)->create();
                $this->conversationMessage($conversation);
                $room = Room::factory()->create();
                \App\Models\RoomMember::factory()->for($room)->for($user)->create();
                $this->channelMessage(Channel::factory()->for($room)->create());
            }
        };

        $build(1);
        $this->actingAs($user);
        $this->get('/');
        $small = $this->countQueries(fn () => $this->get('/'));

        $build(5);
        $large = $this->countQueries(fn () => $this->get('/'));

        $this->assertSame($small, $large);
    }
}
