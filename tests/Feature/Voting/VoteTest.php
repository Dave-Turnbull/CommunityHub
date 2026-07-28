<?php

namespace Tests\Feature\Voting;

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

class VoteTest extends TestCase
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

    public function test_a_member_can_upvote_a_post(): void
    {
        $channel = $this->forumChannel();
        $user = $this->member($channel->room);
        $post = Message::factory()->for($channel)->create();

        $response = $this->actingAs($user)->postJson("/api/messages/{$post->id}/votes", ['value' => 1]);

        $response->assertOk();
        $response->assertJson(['score' => 1, 'mine' => 1]);
        $this->assertDatabaseHas('votes', ['message_id' => $post->id, 'user_id' => $user->id, 'value' => 1]);
    }

    public function test_casting_a_vote_again_changes_it_rather_than_duplicating(): void
    {
        $channel = $this->forumChannel();
        $user = $this->member($channel->room);
        $post = Message::factory()->for($channel)->create();

        $this->actingAs($user)->postJson("/api/messages/{$post->id}/votes", ['value' => 1]);
        $response = $this->actingAs($user)->postJson("/api/messages/{$post->id}/votes", ['value' => -1]);

        $response->assertJson(['score' => -1, 'mine' => -1]);
        $this->assertDatabaseCount('votes', 1);
    }

    public function test_removing_a_vote(): void
    {
        $channel = $this->forumChannel();
        $user = $this->member($channel->room);
        $post = Message::factory()->for($channel)->create();
        Vote::factory()->for($post)->for($user)->create(['value' => 1]);

        $response = $this->actingAs($user)->deleteJson("/api/messages/{$post->id}/votes");

        $response->assertJson(['score' => 0, 'mine' => null]);
        $this->assertDatabaseCount('votes', 0);
    }

    public function test_score_aggregates_multiple_voters(): void
    {
        $channel = $this->forumChannel();
        $post = Message::factory()->for($channel)->create();

        $up1 = $this->member($channel->room);
        $up2 = $this->member($channel->room);
        $down = $this->member($channel->room);

        $this->actingAs($up1)->postJson("/api/messages/{$post->id}/votes", ['value' => 1]);
        $this->actingAs($up2)->postJson("/api/messages/{$post->id}/votes", ['value' => 1]);
        $response = $this->actingAs($down)->postJson("/api/messages/{$post->id}/votes", ['value' => -1]);

        $response->assertJson(['score' => 1]);
    }

    public function test_voting_is_rejected_on_a_channel_type_without_the_vote_capability(): void
    {
        $room = Room::factory()->create();
        Role::seedDefaultsForRoom($room);
        $channel = Channel::factory()->for($room)->create(['type' => 'text']);
        $user = $this->member($room);
        $post = Message::factory()->for($channel)->create();

        $response = $this->actingAs($user)->postJson("/api/messages/{$post->id}/votes", ['value' => 1]);

        $response->assertStatus(422);
    }

    public function test_voting_is_rejected_without_the_vote_permission(): void
    {
        $channel = $this->forumChannel();
        $memberRole = $channel->room->roles()->where('is_default', true)->first();
        $memberRole->rolePermissions()->where('permission', 'vote')->delete();

        $user = $this->member($channel->room);
        $post = Message::factory()->for($channel)->create();

        $response = $this->actingAs($user)->postJson("/api/messages/{$post->id}/votes", ['value' => 1]);

        $response->assertForbidden();
    }

    public function test_a_non_member_cannot_vote(): void
    {
        $channel = $this->forumChannel();
        $post = Message::factory()->for($channel)->create();
        $user = User::factory()->create();

        $response = $this->actingAs($user)->postJson("/api/messages/{$post->id}/votes", ['value' => 1]);

        $response->assertForbidden();
    }

    public function test_vote_value_must_be_one_or_negative_one(): void
    {
        $channel = $this->forumChannel();
        $user = $this->member($channel->room);
        $post = Message::factory()->for($channel)->create();

        $response = $this->actingAs($user)->postJson("/api/messages/{$post->id}/votes", ['value' => 5]);

        $response->assertStatus(422);
    }
}
