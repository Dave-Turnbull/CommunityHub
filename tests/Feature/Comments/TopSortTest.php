<?php

namespace Tests\Feature\Comments;

use App\Models\Channel;
use App\Models\Message;
use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use App\Models\Vote;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * `?sort=top&period=...` is a distinct, offset-paginated contract from the
 * chronological before/after/around cursor — see TextMessageService::
 * listTop and docs/comments-and-voting.md.
 */
class TopSortTest extends TestCase
{
    use RefreshDatabase;

    private function member(Room $room): User
    {
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();

        $memberRole = $room->roles()->where('is_default', true)->first();
        RoleAssignment::factory()->for($memberRole, 'role')->for($user)->create();

        return $user;
    }

    private function forumChannel(): Channel
    {
        $room = Room::factory()->create();
        Role::seedDefaultsForRoom($room);

        return Channel::factory()->for($room)->create(['type' => 'forum']);
    }

    public function test_posts_are_ordered_by_score(): void
    {
        $channel = $this->forumChannel();
        $user = $this->member($channel->room);

        $low = Message::factory()->for($channel)->create();
        $high = Message::factory()->for($channel)->create();

        Vote::factory()->for($high)->for($user)->create(['value' => 1]);

        $response = $this->actingAs($user)
            ->getJson("/api/channels/{$channel->id}/messages?sort=top&period=all");

        $response->assertOk();
        $this->assertSame($high->id, $response->json('data.0.id'));
        $this->assertSame($low->id, $response->json('data.1.id'));
    }

    public function test_period_excludes_posts_outside_the_window(): void
    {
        $channel = $this->forumChannel();
        $user = $this->member($channel->room);

        $old = Message::factory()->for($channel)->create(['created_at' => now()->subWeek()]);
        $recent = Message::factory()->for($channel)->create(['created_at' => now()]);

        $response = $this->actingAs($user)
            ->getJson("/api/channels/{$channel->id}/messages?sort=top&period=day");

        $ids = collect($response->json('data'))->pluck('id');
        $this->assertTrue($ids->contains($recent->id));
        $this->assertFalse($ids->contains($old->id));
    }

    public function test_custom_period_filters_by_start_and_end(): void
    {
        $channel = $this->forumChannel();
        $user = $this->member($channel->room);

        $inRange = Message::factory()->for($channel)->create(['created_at' => now()->subDays(5)]);
        $outOfRange = Message::factory()->for($channel)->create(['created_at' => now()->subDays(20)]);

        // Note: urlencode() is required here, not cosmetic — an unencoded
        // "+" in a raw query string (e.g. from toIso8601String()'s "+00:00"
        // offset) is decoded as a literal space, silently corrupting the
        // timestamp.
        $response = $this->actingAs($user)->getJson(
            "/api/channels/{$channel->id}/messages?sort=top&period=custom".
            '&start='.urlencode(now()->subDays(10)->toDateTimeString()).
            '&end='.urlencode(now()->toDateTimeString())
        );

        $ids = collect($response->json('data'))->pluck('id');
        $this->assertTrue($ids->contains($inRange->id));
        $this->assertFalse($ids->contains($outOfRange->id));
    }

    public function test_custom_period_requires_a_start(): void
    {
        $channel = $this->forumChannel();
        $user = $this->member($channel->room);

        $response = $this->actingAs($user)
            ->getJson("/api/channels/{$channel->id}/messages?sort=top&period=custom");

        $response->assertStatus(422);
    }

    public function test_regular_cursor_sort_is_unaffected(): void
    {
        $channel = $this->forumChannel();
        $user = $this->member($channel->room);
        $message = Message::factory()->for($channel)->create();

        $response = $this->actingAs($user)->getJson("/api/channels/{$channel->id}/messages");

        $response->assertOk();
        $response->assertJsonPath('data.0.id', $message->id);
    }
}
