<?php

namespace Tests\Feature\Comments;

use App\Events\MessageDeleted;
use App\Events\MessageUpdated;
use App\Models\Attachment;
use App\Models\Channel;
use App\Models\Message;
use App\Models\Reaction;
use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use App\Models\Vote;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * A deleted message with comments stays in place as a blanked placeholder
 * and everything beneath it keeps working — see docs/comments-and-voting.md's
 * "Deletion". Every scenario here acts as an ordinary room member who is
 * neither the tombstone's author nor a comment's author.
 */
class TombstoneTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'the-deleted-secret';

    private Channel $channel;
    private User $author;
    private User $commenter;
    private User $viewer;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');

        $room = Room::factory()->create();
        Role::seedDefaultsForRoom($room);
        $this->channel = Channel::factory()->for($room)->create(['type' => 'forum', 'settings' => ['comments_enabled' => true]]);

        $this->author = $this->member($room);
        $this->commenter = $this->member($room);
        $this->viewer = $this->member($room);
    }

    private function member(Room $room): User
    {
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();
        RoleAssignment::factory()->for($room->roles()->where('is_default', true)->first(), 'role')->for($user)->create();

        return $user;
    }

    private function comment(Message $parent, ?User $author = null, array $attributes = []): Message
    {
        return Message::factory()->create([
            'channel_id'        => null,
            'author_id'         => ($author ?? $this->commenter)->id,
            'parent_message_id' => $parent->id,
            'root_message_id'   => $parent->parent_message_id ? $parent->root_message_id : $parent->id,
            'depth'             => $parent->depth + 1,
            ...$attributes,
        ]);
    }

    /** A post by the author, loaded with every kind of content a tombstone must withhold, then deleted over HTTP. */
    private function tombstonedPost(array $attributes = []): Message
    {
        $post = Message::factory()->for($this->channel)->create([
            'author_id' => $this->author->id,
            'content'   => self::SECRET,
            'title'     => self::SECRET.'-title',
            ...$attributes,
        ]);

        Attachment::create([
            'message_id'  => $post->id,
            'path'        => 'attachments/secret.png',
            'uploader_id' => $this->author->id,
            'filename'    => self::SECRET.'.png',
            'mime_type'   => 'image/png',
            'size_bytes'  => 10,
        ]);
        Reaction::create(['message_id' => $post->id, 'user_id' => $this->viewer->id, 'emoji' => '🔥']);
        Vote::create(['message_id' => $post->id, 'user_id' => $this->viewer->id, 'value' => 1]);

        $this->comment($post);

        $this->actingAs($this->author)->deleteJson("/api/messages/{$post->id}")->assertOk();

        return $post;
    }

    private function assertBlanked(array $row): void
    {
        $this->assertTrue($row['is_tombstoned']);
        $this->assertNull($row['content']);
        $this->assertNull($row['title']);
        $this->assertSame([], $row['attachments']);
        $this->assertSame([], $row['reactions']);
        $this->assertSame(['score' => 0, 'mine' => null], $row['votes']);
        $this->assertSame($this->author->id, $row['author_id']);
        $this->assertNotNull($row['created_at']);
    }

    private function assertNoLeak($response): void
    {
        $body = $response->getContent();

        $this->assertStringNotContainsString(self::SECRET, $body);
        $this->assertStringNotContainsString('🔥', $body);
    }

    private function postRow($response, Message $post): array
    {
        $row = collect($response->json('data'))->firstWhere('id', $post->id);
        $this->assertNotNull($row, 'the tombstone is listed');

        return $row;
    }

    public function test_a_tombstone_is_listed_blanked_in_every_cursor_mode(): void
    {
        $before = Message::factory()->for($this->channel)->create(['created_at' => now()->subMinutes(3)]);
        $post = $this->tombstonedPost(['created_at' => now()->subMinutes(2)]);
        $after = Message::factory()->for($this->channel)->create(['created_at' => now()->subMinute()]);

        $url = "/api/channels/{$this->channel->id}/messages";

        $tail = $this->actingAs($this->viewer)->getJson($url)->assertOk();
        $this->assertSame([$before->id, $post->id, $after->id], array_column($tail->json('data'), 'id'));
        $this->assertBlanked($this->postRow($tail, $post));
        $this->assertSame(1, $this->postRow($tail, $post)['comment_count']);
        $this->assertNoLeak($tail);

        $newer = $this->actingAs($this->viewer)->getJson("$url?after={$before->id}")->assertOk();
        $this->assertBlanked($this->postRow($newer, $post));
        $this->assertNoLeak($newer);

        $older = $this->actingAs($this->viewer)->getJson("$url?before={$after->id}")->assertOk();
        $this->assertBlanked($this->postRow($older, $post));
        $this->assertNoLeak($older);

        $around = $this->actingAs($this->viewer)->getJson("$url?around={$post->id}")->assertOk();
        $this->assertBlanked($this->postRow($around, $post));
        $this->assertFalse($around->json('has_older'));
        $this->assertFalse($around->json('has_newer'));
        $this->assertNoLeak($around);

        $this->actingAs($this->viewer)->getJson("$url?around={$before->id}")->assertOk();
    }

    public function test_paging_past_a_tombstone_keeps_the_cursor_contract(): void
    {
        $oldest = Message::factory()->for($this->channel)->create(['created_at' => now()->subMinutes(5)]);
        $post = $this->tombstonedPost(['created_at' => now()->subMinutes(4)]);
        Message::factory()->for($this->channel)->count(2)->sequence(
            ['created_at' => now()->subMinutes(3)],
            ['created_at' => now()->subMinutes(2)],
        )->create();

        $page = $this->actingAs($this->viewer)
            ->getJson("/api/channels/{$this->channel->id}/messages?before={$post->id}")
            ->assertOk();

        $this->assertSame([$oldest->id], array_column($page->json('data'), 'id'));
        $this->assertFalse($page->json('has_older'));
        $this->assertTrue($page->json('has_newer'));
        $this->assertSame($oldest->id, $page->json('newer_cursor'));
    }

    public function test_the_page_load_seed_includes_the_blanked_tombstone(): void
    {
        $post = $this->tombstonedPost();

        $this->actingAs($this->viewer)
            ->get("/channels/{$this->channel->id}")
            ->assertInertia(fn (Assert $page) => $page
                ->component('Channels/Show')
                ->where('messages.data.0.id', $post->id)
                ->where('messages.data.0.content', null)
                ->where('messages.data.0.is_tombstoned', true)
            );

        $this->actingAs($this->viewer)
            ->get("/channels/{$this->channel->id}?message={$post->id}")
            ->assertInertia(fn (Assert $page) => $page
                ->where('highlight_message_id', $post->id)
                ->where('messages.data.0.id', $post->id)
                ->where('messages.data.0.content', null)
            );
    }

    public function test_the_top_sort_includes_the_blanked_tombstone(): void
    {
        $post = $this->tombstonedPost();

        $response = $this->actingAs($this->viewer)
            ->getJson("/api/channels/{$this->channel->id}/messages?sort=top&period=all")
            ->assertOk();

        $row = $this->postRow($response, $post);
        $this->assertBlanked($row);
        $this->assertSame(0, $row['vote_score']);
        $this->assertNoLeak($response);
    }

    public function test_plain_deleted_and_cascade_deleted_rows_stay_excluded(): void
    {
        $plain = Message::factory()->for($this->channel)->create(['author_id' => $this->author->id]);
        $this->actingAs($this->author)->deleteJson("/api/messages/{$plain->id}")->assertOk();

        $cascading = Channel::factory()->for($this->channel->room)->create([
            'type'     => 'forum',
            'settings' => ['comments_enabled' => true, 'cascade_delete_comments' => true],
        ]);
        $post = Message::factory()->for($cascading)->create(['author_id' => $this->author->id]);
        $comment = $this->comment($post);
        $this->actingAs($this->author)->deleteJson("/api/messages/{$post->id}")->assertOk();

        $this->assertSoftDeleted('messages', ['id' => $comment->id]);
        $this->assertDatabaseHas('messages', ['id' => $post->id, 'is_tombstoned' => false]);

        $this->actingAs($this->viewer)
            ->getJson("/api/channels/{$this->channel->id}/messages")
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->actingAs($this->viewer)
            ->getJson("/api/channels/{$cascading->id}/messages?sort=top&period=all")
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->actingAs($this->viewer)
            ->getJson("/api/messages/{$post->id}/comments")
            ->assertNotFound();
    }

    public function test_cascading_past_an_existing_tombstone_unlists_it(): void
    {
        $channel = Channel::factory()->for($this->channel->room)->create([
            'type'     => 'forum',
            'settings' => ['comments_enabled' => true, 'cascade_delete_comments' => true],
        ]);
        $post = Message::factory()->for($channel)->create(['author_id' => $this->author->id]);
        $tombstone = $this->comment($post, attributes: ['is_tombstoned' => true]);
        $tombstone->delete();
        $this->comment($tombstone);

        $this->actingAs($this->author)->deleteJson("/api/messages/{$post->id}")->assertOk();

        $this->assertDatabaseHas('messages', ['id' => $tombstone->id, 'is_tombstoned' => false]);
        $this->assertSame(0, Message::listed()->where('parent_message_id', $tombstone->id)->count());
    }

    public function test_the_comments_of_a_tombstone_are_listable(): void
    {
        $post = $this->tombstonedPost();

        $response = $this->actingAs($this->viewer)->getJson("/api/messages/{$post->id}/comments")->assertOk();

        $this->assertCount(1, $response->json('data'));
        $this->assertFalse($response->json('data.0.is_tombstoned'));
        $this->assertNotNull($response->json('data.0.content'));
        $this->assertNoLeak($response);

        $this->actingAs($this->viewer)
            ->getJson("/api/messages/{$post->id}/comments?sort=top&period=all")
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_a_live_comment_under_a_tombstone_can_be_listed_replied_to_voted_edited_and_deleted(): void
    {
        $post = $this->tombstonedPost();
        $comment = $this->comment($post, $this->commenter, ['content' => 'live comment']);

        $this->actingAs($this->viewer)->getJson("/api/messages/{$comment->id}/comments")->assertOk()->assertJsonCount(0, 'data');

        $reply = $this->actingAs($this->viewer)
            ->postJson("/api/messages/{$comment->id}/comments", ['content' => 'a reply'])
            ->assertCreated();
        $this->assertSame($post->id, $reply->json('root_message_id'));

        $this->actingAs($this->viewer)->getJson("/api/messages/{$comment->id}/comments")->assertOk()->assertJsonCount(1, 'data');

        $this->actingAs($this->viewer)
            ->postJson("/api/messages/{$comment->id}/votes", ['value' => 1])
            ->assertOk()
            ->assertJson(['score' => 1, 'mine' => 1]);

        $this->actingAs($this->commenter)
            ->patchJson("/api/messages/{$comment->id}", ['content' => 'edited'])
            ->assertOk()
            ->assertJsonPath('content', 'edited');

        $this->actingAs($this->commenter)->deleteJson("/api/messages/{$comment->id}")->assertOk();
        $this->assertDatabaseHas('messages', ['id' => $comment->id, 'is_tombstoned' => true]);
    }

    public function test_the_tombstone_itself_is_inert(): void
    {
        $post = $this->tombstonedPost();

        $this->actingAs($this->author)->patchJson("/api/messages/{$post->id}", ['content' => 'back again'])->assertNotFound();
        $this->actingAs($this->viewer)->postJson("/api/messages/{$post->id}/votes", ['value' => 1])->assertNotFound();
        $this->actingAs($this->viewer)->deleteJson("/api/messages/{$post->id}/votes")->assertNotFound();
        $this->actingAs($this->viewer)->postJson("/api/messages/{$post->id}/reactions", ['emoji' => '👍'])->assertNotFound();
        $this->actingAs($this->viewer)->postJson("/api/messages/{$post->id}/comments", ['content' => 'hi'])->assertNotFound();
        $this->actingAs($this->author)->deleteJson("/api/messages/{$post->id}")->assertNotFound();

        $this->assertDatabaseMissing('messages', ['content' => 'back again']);
        $this->assertDatabaseMissing('messages', ['content' => 'hi']);
        $this->assertSame(1, Vote::where('message_id', $post->id)->count());
    }

    public function test_a_tombstoned_comment_stays_listed_with_its_replies_reachable(): void
    {
        $post = Message::factory()->for($this->channel)->create(['author_id' => $this->author->id]);
        $comment = $this->comment($post, $this->commenter, ['content' => self::SECRET]);
        $reply = $this->comment($comment, $this->author, ['content' => 'surviving reply']);

        $this->actingAs($this->commenter)->deleteJson("/api/messages/{$comment->id}")->assertOk();
        $this->assertSoftDeleted('messages', ['id' => $comment->id]);

        $list = $this->actingAs($this->viewer)->getJson("/api/messages/{$post->id}/comments")->assertOk();
        $row = $this->postRow($list, $comment);
        $this->assertTrue($row['is_tombstoned']);
        $this->assertNull($row['content']);
        $this->assertSame(1, $row['comment_count']);
        $this->assertNoLeak($list);

        $replies = $this->actingAs($this->viewer)->getJson("/api/messages/{$comment->id}/comments")->assertOk();
        $this->assertSame([$reply->id], array_column($replies->json('data'), 'id'));

        $this->actingAs($this->viewer)->postJson("/api/messages/{$reply->id}/comments", ['content' => 'deeper'])->assertCreated();
        $this->actingAs($this->viewer)->postJson("/api/messages/{$comment->id}/comments", ['content' => 'direct'])->assertNotFound();

        $this->actingAs($this->viewer)
            ->getJson("/api/channels/{$this->channel->id}/messages")
            ->assertOk()
            ->assertJsonPath('data.0.comment_count', 1);
    }

    public function test_deleting_a_message_whose_only_comments_are_tombstones_tombstones_it_too(): void
    {
        $post = Message::factory()->for($this->channel)->create(['author_id' => $this->author->id]);
        $comment = $this->comment($post, $this->commenter);
        $reply = $this->comment($comment, $this->author, ['content' => 'surviving reply']);

        $this->actingAs($this->commenter)->deleteJson("/api/messages/{$comment->id}")->assertOk();
        $this->actingAs($this->author)->deleteJson("/api/messages/{$post->id}")->assertOk();

        $this->assertDatabaseHas('messages', ['id' => $post->id, 'is_tombstoned' => true]);

        $this->actingAs($this->viewer)->getJson("/api/messages/{$comment->id}/comments")
            ->assertOk()
            ->assertJsonPath('data.0.id', $reply->id);
    }

    public function test_a_tombstone_with_no_live_descendants_left_stays_listed(): void
    {
        $post = $this->tombstonedPost();
        $comment = $post->children()->first();

        $this->actingAs($this->commenter)->deleteJson("/api/messages/{$comment->id}")->assertOk();

        $this->assertBlanked($this->postRow(
            $this->actingAs($this->viewer)->getJson("/api/channels/{$this->channel->id}/messages"),
            $post,
        ));
    }

    public function test_tombstoning_broadcasts_a_blanked_update_instead_of_a_deletion(): void
    {
        Event::fake([MessageUpdated::class, MessageDeleted::class]);

        $post = $this->tombstonedPost();

        Event::assertNotDispatched(MessageDeleted::class);
        Event::assertDispatched(MessageUpdated::class, function (MessageUpdated $event) use ($post) {
            $payload = $event->broadcastWith();

            return $event->message->id === $post->id
                && $payload['message']['is_tombstoned'] === true
                && $payload['message']['content'] === null
                && $payload['message']['attachments'] === []
                && ! str_contains(json_encode($payload), self::SECRET);
        });
    }

    public function test_a_plain_delete_still_broadcasts_a_deletion(): void
    {
        Event::fake([MessageUpdated::class, MessageDeleted::class]);

        $post = Message::factory()->for($this->channel)->create(['author_id' => $this->author->id]);
        $this->actingAs($this->author)->deleteJson("/api/messages/{$post->id}")->assertOk();

        Event::assertDispatched(MessageDeleted::class);
        Event::assertNotDispatched(MessageUpdated::class);
    }

    public function test_deleting_a_message_with_comments_returns_the_blanked_tombstone(): void
    {
        $post = Message::factory()->for($this->channel)->create([
            'author_id' => $this->author->id,
            'content'   => self::SECRET,
            'title'     => self::SECRET.'-title',
        ]);
        $this->comment($post);

        $response = $this->actingAs($this->author)->deleteJson("/api/messages/{$post->id}")->assertOk();

        $response->assertJson([
            'deleted'       => true,
            'id'            => $post->id,
            'is_tombstoned' => true,
            'content'       => null,
            'title'         => null,
            'comment_count' => 1,
            'attachments'   => [],
            'reactions'     => [],
            'votes'         => ['score' => 0, 'mine' => null],
        ]);
        $this->assertNoLeak($response);
    }

    public function test_a_plain_or_cascade_delete_returns_only_the_deleted_flag(): void
    {
        $plain = Message::factory()->for($this->channel)->create(['author_id' => $this->author->id]);
        $this->actingAs($this->author)->deleteJson("/api/messages/{$plain->id}")->assertExactJson(['deleted' => true]);

        $cascading = Channel::factory()->for($this->channel->room)->create([
            'type'     => 'forum',
            'settings' => ['comments_enabled' => true, 'cascade_delete_comments' => true],
        ]);
        $post = Message::factory()->for($cascading)->create(['author_id' => $this->author->id]);
        $this->comment($post);
        $this->actingAs($this->author)->deleteJson("/api/messages/{$post->id}")->assertExactJson(['deleted' => true]);
    }

    public function test_deleting_a_comment_broadcasts_on_its_roots_channel(): void
    {
        Event::fake([MessageUpdated::class, MessageDeleted::class]);

        $post = Message::factory()->for($this->channel)->create(['author_id' => $this->author->id]);
        $leaf = $this->comment($post);
        $withReply = $this->comment($post);
        $this->comment($withReply);

        $this->actingAs($this->commenter)->deleteJson("/api/messages/{$leaf->id}")->assertExactJson(['deleted' => true]);
        $this->actingAs($this->commenter)->deleteJson("/api/messages/{$withReply->id}")->assertOk();

        Event::assertDispatched(MessageDeleted::class, function (MessageDeleted $event) use ($post, $leaf) {
            return $event->messageId === $leaf->id
                && $event->broadcastWith() === ['message_id' => $leaf->id, 'scope_type' => 'message', 'scope_id' => $post->id]
                && $event->broadcastOn()[0]->name === "presence-channel.{$this->channel->id}";
        });

        Event::assertDispatched(MessageUpdated::class, function (MessageUpdated $event) use ($post, $withReply) {
            return $event->message->id === $withReply->id
                && $event->broadcastWith()['scope_type'] === 'message'
                && $event->broadcastWith()['scope_id'] === $post->id
                && $event->broadcastOn()[0]->name === "presence-channel.{$this->channel->id}";
        });
    }

    public function test_a_non_member_is_refused_everywhere_under_a_tombstone(): void
    {
        $post = $this->tombstonedPost();
        $comment = $this->comment($post);
        $outsider = User::factory()->create();

        $this->actingAs($outsider)->getJson("/api/messages/{$post->id}/comments")->assertForbidden();
        $this->actingAs($outsider)->getJson("/api/messages/{$comment->id}/comments")->assertForbidden();
        $this->actingAs($outsider)->postJson("/api/messages/{$comment->id}/comments", ['content' => 'x'])->assertForbidden();
        $this->actingAs($outsider)->postJson("/api/messages/{$comment->id}/votes", ['value' => 1])->assertForbidden();
        $this->actingAs($outsider)->get("/messages/{$post->id}")->assertForbidden();
        $this->actingAs($outsider)->getJson("/api/channels/{$this->channel->id}/messages")->assertForbidden();
    }
}
