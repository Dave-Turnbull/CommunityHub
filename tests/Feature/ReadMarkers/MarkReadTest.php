<?php

namespace Tests\Feature\ReadMarkers;

use App\Models\Channel;
use App\Models\Conversation;
use App\Models\ReadMarker;
use App\Models\Room;
use App\Models\User;
use Illuminate\Support\Carbon;

class MarkReadTest extends ReadMarkerTestCase
{
    public function test_a_room_member_can_mark_a_channel_read(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = $this->memberOf($room);

        $this->actingAs($user)->postJson("/api/channels/{$channel->id}/read")->assertNoContent();

        $marker = ReadMarker::where('user_id', $user->id)->where('channel_id', $channel->id)->sole();
        $this->assertNull($marker->conversation_id);
        $this->assertTrue($marker->last_read_at->equalTo($this->now));
    }

    public function test_marking_a_channel_read_twice_leaves_one_row_with_the_newer_time(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $user = $this->memberOf($room);

        $this->actingAs($user)->postJson("/api/channels/{$channel->id}/read")->assertNoContent();
        Carbon::setTestNow($this->now->copy()->addMinutes(5));
        $this->actingAs($user)->postJson("/api/channels/{$channel->id}/read")->assertNoContent();

        $markers = ReadMarker::where('user_id', $user->id)->get();
        $this->assertCount(1, $markers);
        $this->assertTrue($markers->first()->last_read_at->equalTo($this->now->copy()->addMinutes(5)));
    }

    public function test_a_non_member_cannot_mark_a_channel_read(): void
    {
        $channel = Channel::factory()->create();
        $outsider = User::factory()->create();

        $this->actingAs($outsider)->postJson("/api/channels/{$channel->id}/read")->assertForbidden();

        $this->assertDatabaseCount('read_markers', 0);
    }

    public function test_a_member_cannot_mark_a_channel_read_that_is_hidden_from_them(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $allowed = $this->memberOf($room);
        $denied = $this->memberOf($room);
        $this->restrictToNewRole($channel, $allowed);

        $this->actingAs($denied)->postJson("/api/channels/{$channel->id}/read")->assertForbidden();
        $this->actingAs($allowed)->postJson("/api/channels/{$channel->id}/read")->assertNoContent();

        $this->assertDatabaseCount('read_markers', 1);
    }

    public function test_a_participant_can_mark_a_conversation_read_and_twice_leaves_one_row(): void
    {
        $conversation = Conversation::factory()->create();
        $user = $this->participantIn($conversation);

        $this->actingAs($user)->postJson("/api/conversations/{$conversation->id}/read")->assertNoContent();
        $this->actingAs($user)->postJson("/api/conversations/{$conversation->id}/read")->assertNoContent();

        $marker = ReadMarker::where('user_id', $user->id)->sole();
        $this->assertSame($conversation->id, $marker->conversation_id);
        $this->assertNull($marker->channel_id);
    }

    public function test_a_non_participant_cannot_mark_a_conversation_read(): void
    {
        $conversation = Conversation::factory()->create();
        $outsider = User::factory()->create();

        $this->actingAs($outsider)->postJson("/api/conversations/{$conversation->id}/read")->assertForbidden();

        $this->assertDatabaseCount('read_markers', 0);
    }

    public function test_marking_read_requires_authentication(): void
    {
        $channel = Channel::factory()->create();

        $this->postJson("/api/channels/{$channel->id}/read")->assertUnauthorized();
    }

    public function test_the_marker_is_per_user(): void
    {
        $room = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create();
        $reader = $this->memberOf($room);
        $other = $this->memberOf($room);
        $this->channelMessage($channel, $this->now->copy()->subHour(), ['author_id' => User::factory()->create()->id]);

        $this->actingAs($reader)->postJson("/api/channels/{$channel->id}/read")->assertNoContent();

        $this->assertDatabaseMissing('read_markers', ['user_id' => $other->id]);
    }
}
