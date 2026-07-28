<?php

namespace Tests\Feature\Comments;

use App\Events\MessageSent;
use App\Models\Channel;
use App\Models\Message;
use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class CommentTest extends TestCase
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

        return Channel::factory()->for($room)->create([
            'settings' => ['comments_enabled' => true],
        ]);
    }

    public function test_a_member_can_comment_on_a_message(): void
    {
        Event::fake([MessageSent::class]);

        $channel = $this->channelWithComments();
        $user = $this->member($channel->room);
        $post = Message::factory()->for($channel)->create();

        $response = $this->actingAs($user)
            ->postJson("/api/messages/{$post->id}/comments", ['content' => 'Nice post!']);

        $response->assertCreated();
        $response->assertJsonPath('content', 'Nice post!');

        $this->assertDatabaseHas('messages', [
            'parent_message_id' => $post->id,
            'root_message_id'   => $post->id,
            'depth'             => 1,
            'content'           => 'Nice post!',
        ]);

        Event::assertDispatched(MessageSent::class, fn ($e) => $e->scopeType === 'message' && $e->scopeId === $post->id);
    }

    public function test_a_comment_on_a_comment_nests_correctly(): void
    {
        $channel = $this->channelWithComments();
        $user = $this->member($channel->room);
        $post = Message::factory()->for($channel)->create();

        $comment = $this->actingAs($user)
            ->postJson("/api/messages/{$post->id}/comments", ['content' => 'top-level'])
            ->json();

        $reply = $this->actingAs($user)
            ->postJson("/api/messages/{$comment['id']}/comments", ['content' => 'nested'])
            ->json();

        $this->assertDatabaseHas('messages', [
            'id'                => $reply['id'],
            'parent_message_id' => $comment['id'],
            'root_message_id'   => $post->id,
            'depth'             => 2,
        ]);
    }

    public function test_commenting_is_rejected_when_comments_are_not_enabled(): void
    {
        $room = Room::factory()->create();
        Role::seedDefaultsForRoom($room);
        $channel = Channel::factory()->for($room)->create(); // no comments_enabled setting
        $user = $this->member($room);
        $post = Message::factory()->for($channel)->create();

        $response = $this->actingAs($user)
            ->postJson("/api/messages/{$post->id}/comments", ['content' => 'Nice post!']);

        $response->assertStatus(422);
    }

    public function test_commenting_is_rejected_without_the_comment_permission(): void
    {
        $channel = $this->channelWithComments();
        $room = $channel->room;
        $memberRole = $room->roles()->where('is_default', true)->first();
        $memberRole->rolePermissions()->where('permission', 'comment')->delete();

        $user = $this->member($room);
        $post = Message::factory()->for($channel)->create();

        $response = $this->actingAs($user)
            ->postJson("/api/messages/{$post->id}/comments", ['content' => 'Nice post!']);

        $response->assertForbidden();
    }

    public function test_a_non_member_cannot_comment(): void
    {
        $channel = $this->channelWithComments();
        $post = Message::factory()->for($channel)->create();
        $user = User::factory()->create();

        $response = $this->actingAs($user)
            ->postJson("/api/messages/{$post->id}/comments", ['content' => 'Nice post!']);

        $response->assertForbidden();
    }

    public function test_comments_are_listed_and_cursor_paginated(): void
    {
        $channel = $this->channelWithComments();
        $user = $this->member($channel->room);
        $post = Message::factory()->for($channel)->create();

        Message::factory()->count(3)->create([
            'channel_id'         => null,
            'parent_message_id'  => $post->id,
            'root_message_id'    => $post->id,
            'depth'              => 1,
        ]);

        $response = $this->actingAs($user)->getJson("/api/messages/{$post->id}/comments");

        $response->assertOk();
        $this->assertCount(3, $response->json('data'));
    }

    public function test_deleting_a_message_with_comments_tombstones_it_by_default(): void
    {
        $channel = $this->channelWithComments();
        $user = $this->member($channel->room);
        $post = Message::factory()->for($channel)->create(['author_id' => $user->id]);

        Message::factory()->create([
            'channel_id'        => null,
            'parent_message_id' => $post->id,
            'root_message_id'   => $post->id,
            'depth'             => 1,
        ]);

        $this->actingAs($user)->deleteJson("/api/messages/{$post->id}")->assertOk();

        $this->assertDatabaseHas('messages', ['id' => $post->id, 'is_tombstoned' => true]);
        $this->assertSoftDeleted('messages', ['id' => $post->id]);
        $this->assertDatabaseHas('messages', ['parent_message_id' => $post->id]); // child untouched
    }

    public function test_deleting_a_message_cascades_when_the_channel_opts_in(): void
    {
        $room = Room::factory()->create();
        Role::seedDefaultsForRoom($room);
        $channel = Channel::factory()->for($room)->create([
            'settings' => ['comments_enabled' => true, 'cascade_delete_comments' => true],
        ]);
        $user = $this->member($room);
        $post = Message::factory()->for($channel)->create(['author_id' => $user->id]);

        $child = Message::factory()->create([
            'channel_id'        => null,
            'parent_message_id' => $post->id,
            'root_message_id'   => $post->id,
            'depth'             => 1,
        ]);

        $this->actingAs($user)->deleteJson("/api/messages/{$post->id}")->assertOk();

        $this->assertSoftDeleted('messages', ['id' => $post->id]);
        $this->assertSoftDeleted('messages', ['id' => $child->id]);
    }

    public function test_a_comment_inherits_visibility_from_its_root_channel(): void
    {
        $channel = $this->channelWithComments();
        $post = Message::factory()->for($channel)->create();
        $comment = Message::factory()->create([
            'channel_id'        => null,
            'parent_message_id' => $post->id,
            'root_message_id'   => $post->id,
            'depth'             => 1,
        ]);

        $outsider = User::factory()->create();

        $this->assertFalse($comment->fresh()->isVisibleTo($outsider));

        $member = $this->member($channel->room);
        $this->assertTrue($comment->fresh()->isVisibleTo($member));
    }
}
