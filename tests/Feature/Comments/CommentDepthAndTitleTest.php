<?php

namespace Tests\Feature\Comments;

use App\Models\Channel;
use App\Models\Message;
use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * max_comment_depth (a parameter, not a capability — see
 * docs/comments-and-voting.md) caps how deep a comment tree may nest.
 * `message_and_comment` defaults it to 1 (first-level comments only, no
 * replies-to-replies); a forum leaves it null (unlimited). Also covers a
 * message's optional `title` field.
 */
class CommentDepthAndTitleTest extends TestCase
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

    public function test_a_reply_to_a_comment_is_rejected_when_max_comment_depth_is_one(): void
    {
        $room = Room::factory()->create();
        Role::seedDefaultsForRoom($room);
        $channel = Channel::factory()->for($room)->create([
            'type'     => 'message_and_comment',
            'settings' => ['comments_enabled' => true, 'max_comment_depth' => 1],
        ]);
        $user = $this->member($room);
        $post = Message::factory()->for($channel)->create();

        $comment = $this->actingAs($user)
            ->postJson("/api/messages/{$post->id}/comments", ['content' => 'first level'])
            ->json();

        $this->assertSame(1, $comment['depth']);

        $response = $this->actingAs($user)
            ->postJson("/api/messages/{$comment['id']}/comments", ['content' => 'nested reply']);

        $response->assertStatus(422);
        $this->assertDatabaseMissing('messages', ['content' => 'nested reply']);
    }

    public function test_a_first_level_comment_is_allowed_when_max_comment_depth_is_one(): void
    {
        $room = Room::factory()->create();
        Role::seedDefaultsForRoom($room);
        $channel = Channel::factory()->for($room)->create([
            'type'     => 'message_and_comment',
            'settings' => ['comments_enabled' => true, 'max_comment_depth' => 1],
        ]);
        $user = $this->member($room);
        $post = Message::factory()->for($channel)->create();

        $response = $this->actingAs($user)
            ->postJson("/api/messages/{$post->id}/comments", ['content' => 'first level']);

        $response->assertCreated();
    }

    public function test_nesting_is_unlimited_when_max_comment_depth_is_null(): void
    {
        $room = Room::factory()->create();
        Role::seedDefaultsForRoom($room);
        $channel = Channel::factory()->for($room)->create([
            'type'     => 'forum',
            'settings' => ['comments_enabled' => true, 'max_comment_depth' => null],
        ]);
        $user = $this->member($room);
        $post = Message::factory()->for($channel)->create();

        $comment = $this->actingAs($user)
            ->postJson("/api/messages/{$post->id}/comments", ['content' => 'level 1'])
            ->json();

        $reply = $this->actingAs($user)
            ->postJson("/api/messages/{$comment['id']}/comments", ['content' => 'level 2']);

        $reply->assertCreated();
    }

    public function test_a_message_can_have_a_title(): void
    {
        $room = Room::factory()->create();
        Role::seedDefaultsForRoom($room);
        $channel = Channel::factory()->for($room)->create(['type' => 'forum']);
        $user = $this->member($room);

        $response = $this->actingAs($user)->postJson("/api/channels/{$channel->id}/messages", [
            'title'   => 'My First Post',
            'content' => 'Body text here.',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('title', 'My First Post');
        $this->assertDatabaseHas('messages', ['title' => 'My First Post', 'content' => 'Body text here.']);
    }

    public function test_title_is_optional(): void
    {
        $room = Room::factory()->create();
        Role::seedDefaultsForRoom($room);
        $channel = Channel::factory()->for($room)->create(['type' => 'forum']);
        $user = $this->member($room);

        $response = $this->actingAs($user)->postJson("/api/channels/{$channel->id}/messages", [
            'content' => 'No title here.',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('title', null);
    }

    public function test_message_and_comment_channel_type_grants_only_text_capability(): void
    {
        $room = Room::factory()->create();
        Role::seedDefaultsForRoom($room);
        $channel = Channel::factory()->for($room)->create(['type' => 'message_and_comment']);

        $this->assertTrue($channel->hasCapability('text.send_text'));
        $this->assertFalse($channel->hasCapability('vote.cast'));
    }

    public function test_a_message_lists_its_comment_count(): void
    {
        $room = Room::factory()->create();
        Role::seedDefaultsForRoom($room);
        $channel = Channel::factory()->for($room)->create([
            'type' => 'message_and_comment',
            'settings' => ['comments_enabled' => true, 'max_comment_depth' => 1],
        ]);
        $user = $this->member($room);
        $post = Message::factory()->for($channel)->create();

        $this->actingAs($user)->postJson("/api/messages/{$post->id}/comments", ['content' => 'one']);
        $this->actingAs($user)->postJson("/api/messages/{$post->id}/comments", ['content' => 'two']);

        $response = $this->actingAs($user)->getJson("/api/channels/{$channel->id}/messages");

        $response->assertJsonPath('data.0.comment_count', 2);
    }
}
