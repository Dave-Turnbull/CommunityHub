<?php

namespace Tests\Feature\Comments;

use App\Models\Channel;
use App\Models\Message;
use App\Models\Notification;
use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * comment_reply notifies only the immediate parent's author — not every
 * ancestor, not every thread participant. See TextMessageService::
 * notifyParentAuthor and docs/comments-and-voting.md.
 */
class CommentReplyNotificationTest extends TestCase
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

    private function channelWithComments(): Channel
    {
        $room = Room::factory()->create();
        Role::seedDefaultsForRoom($room);

        return Channel::factory()->for($room)->create(['settings' => ['comments_enabled' => true]]);
    }

    public function test_replying_to_a_message_notifies_its_author(): void
    {
        $channel = $this->channelWithComments();
        $author = $this->member($channel->room);
        $replier = $this->member($channel->room);
        $post = Message::factory()->for($channel)->create(['author_id' => $author->id]);

        $this->actingAs($replier)->postJson("/api/messages/{$post->id}/comments", ['content' => 'nice!']);

        $this->assertDatabaseHas('user_notifications', [
            'user_id' => $author->id,
            'type'    => 'comment_reply',
        ]);
    }

    public function test_replying_to_your_own_message_does_not_notify_yourself(): void
    {
        $channel = $this->channelWithComments();
        $author = $this->member($channel->room);
        $post = Message::factory()->for($channel)->create(['author_id' => $author->id]);

        $this->actingAs($author)->postJson("/api/messages/{$post->id}/comments", ['content' => 'self reply']);

        $this->assertDatabaseMissing('user_notifications', [
            'user_id' => $author->id,
            'type'    => 'comment_reply',
        ]);
    }

    public function test_replying_to_a_comment_notifies_only_that_comments_author_not_the_post_author(): void
    {
        $channel = $this->channelWithComments();
        $postAuthor = $this->member($channel->room);
        $commentAuthor = $this->member($channel->room);
        $replier = $this->member($channel->room);

        $post = Message::factory()->for($channel)->create(['author_id' => $postAuthor->id]);
        $comment = Message::factory()->create([
            'channel_id'        => null,
            'parent_message_id' => $post->id,
            'root_message_id'   => $post->id,
            'depth'             => 1,
            'author_id'         => $commentAuthor->id,
        ]);

        $this->actingAs($replier)->postJson("/api/messages/{$comment->id}/comments", ['content' => 'reply to comment']);

        $this->assertDatabaseHas('user_notifications', [
            'user_id' => $commentAuthor->id,
            'type'    => 'comment_reply',
        ]);
        $this->assertDatabaseMissing('user_notifications', [
            'user_id' => $postAuthor->id,
            'type'    => 'comment_reply',
        ]);
    }
}
