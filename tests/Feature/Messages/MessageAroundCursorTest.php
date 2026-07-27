<?php

namespace Tests\Feature\Messages;

use App\Models\Channel;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Message;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The `around` cursor — TextMessageService::list()'s "jump to message" mode,
 * used by a reply preview click and a direct link's first paint (see
 * CLAUDE.md and docs/messages-and-pagination.md). Unlike before/after it
 * fills both edges around a target message rather than walking away from one.
 */
class MessageAroundCursorTest extends TestCase
{
    use RefreshDatabase;

    private Room $room;
    private Channel $channel;
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->room = Room::factory()->create();
        $this->channel = Channel::factory()->for($this->room)->create();
        $this->user = User::factory()->create();
        RoomMember::factory()->for($this->room)->for($this->user)->create();
    }

    /** @return \Illuminate\Database\Eloquent\Collection<int, Message> */
    private function messages(int $count)
    {
        return Message::factory()
            ->for($this->channel)
            ->count($count)
            ->sequence(fn ($seq) => ['created_at' => now()->addSeconds($seq->index)])
            ->create();
    }

    public function test_around_returns_the_target_with_up_to_25_messages_on_each_side(): void
    {
        $messages = $this->messages(80);

        $page = $this->actingAs($this->user)
            ->getJson("/api/channels/{$this->channel->id}/messages?around={$messages[40]->id}")
            ->json();

        $this->assertCount(51, $page['data']);
        $this->assertSame($messages[15]->id, $page['data'][0]['id']);
        $this->assertSame($messages[40]->id, $page['data'][25]['id']);
        $this->assertSame($messages[65]->id, $page['data'][50]['id']);
        $this->assertTrue($page['has_older']);
        $this->assertSame($messages[15]->id, $page['older_cursor']);
        $this->assertTrue($page['has_newer']);
        $this->assertSame($messages[65]->id, $page['newer_cursor']);
    }

    public function test_around_near_the_start_reports_no_older(): void
    {
        $messages = $this->messages(80);

        $page = $this->actingAs($this->user)
            ->getJson("/api/channels/{$this->channel->id}/messages?around={$messages[2]->id}")
            ->json();

        $this->assertSame($messages[0]->id, $page['data'][0]['id']);
        $this->assertSame($messages[2]->id, $page['data'][2]['id']);
        $this->assertFalse($page['has_older']);
        $this->assertNull($page['older_cursor']);
        $this->assertTrue($page['has_newer']);
    }

    public function test_around_near_the_tail_reports_no_newer(): void
    {
        $messages = $this->messages(80);

        $page = $this->actingAs($this->user)
            ->getJson("/api/channels/{$this->channel->id}/messages?around={$messages[78]->id}")
            ->json();

        $this->assertSame($messages[79]->id, end($page['data'])['id']);
        $this->assertFalse($page['has_newer']);
        $this->assertNull($page['newer_cursor']);
        $this->assertTrue($page['has_older']);
    }

    public function test_a_small_scope_returns_everything_with_neither_flag_set(): void
    {
        $messages = $this->messages(5);

        $page = $this->actingAs($this->user)
            ->getJson("/api/channels/{$this->channel->id}/messages?around={$messages[2]->id}")
            ->json();

        $this->assertCount(5, $page['data']);
        $this->assertFalse($page['has_older']);
        $this->assertFalse($page['has_newer']);
    }

    public function test_around_combined_with_before_is_rejected(): void
    {
        $messages = $this->messages(3);

        $this->actingAs($this->user)
            ->getJson("/api/channels/{$this->channel->id}/messages?before={$messages[2]->id}&around={$messages[0]->id}")
            ->assertStatus(422);
    }

    public function test_an_unknown_around_cursor_is_rejected(): void
    {
        $this->messages(3);

        $this->actingAs($this->user)
            ->getJson("/api/channels/{$this->channel->id}/messages?around=" . Str::uuid7())
            ->assertStatus(422);
    }

    public function test_a_deleted_message_cannot_be_used_as_an_around_target(): void
    {
        $messages = $this->messages(5);
        $messages[2]->delete();

        $this->actingAs($this->user)
            ->getJson("/api/channels/{$this->channel->id}/messages?around={$messages[2]->id}")
            ->assertStatus(422);
    }

    public function test_a_non_member_cannot_jump_to_a_message(): void
    {
        $messages = $this->messages(3);

        $this->actingAs(User::factory()->create())
            ->getJson("/api/channels/{$this->channel->id}/messages?around={$messages[1]->id}")
            ->assertForbidden();
    }

    public function test_conversation_messages_support_around_too(): void
    {
        $conversation = Conversation::create(['type' => 'dm']);
        ConversationParticipant::create([
            'conversation_id' => $conversation->id,
            'user_id'         => $this->user->id,
        ]);

        $messages = Message::factory()
            ->for($conversation)
            ->count(6)
            ->sequence(fn ($seq) => ['created_at' => now()->addSeconds($seq->index), 'channel_id' => null])
            ->create();

        $page = $this->actingAs($this->user)
            ->getJson("/api/conversations/{$conversation->id}/messages?around={$messages[3]->id}")
            ->json();

        $this->assertSame(
            array_column($messages->all(), 'id'),
            array_column($page['data'], 'id'),
        );
        $this->assertFalse($page['has_older']);
        $this->assertFalse($page['has_newer']);
    }
}
