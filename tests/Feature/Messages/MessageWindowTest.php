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
use Tests\TestCase;

/**
 * The `after` half of the message endpoint's two-way cursor, plus the
 * has_older/has_newer window flags the client's trimmed window depends on —
 * see docs/messages-and-pagination.md. Backwards paging (`before`) is covered
 * by ChannelMessageTest/ConversationMessageTest.
 */
class MessageWindowTest extends TestCase
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

    public function test_after_returns_the_next_page_forward_oldest_first(): void
    {
        $messages = $this->messages(120);

        $page = $this->actingAs($this->user)
            ->getJson("/api/channels/{$this->channel->id}/messages?after={$messages[9]->id}")
            ->json();

        $this->assertCount(50, $page['data']);
        $this->assertSame($messages[10]->id, $page['data'][0]['id']);
        $this->assertSame($messages[59]->id, $page['data'][49]['id']);
        $this->assertTrue($page['has_older']);
        $this->assertSame($messages[10]->id, $page['older_cursor']);
        $this->assertTrue($page['has_newer']);
        $this->assertSame($messages[59]->id, $page['newer_cursor']);
    }

    public function test_paging_forward_to_the_live_tail_reports_no_newer(): void
    {
        $messages = $this->messages(60);

        $page = $this->actingAs($this->user)
            ->getJson("/api/channels/{$this->channel->id}/messages?after={$messages[9]->id}")
            ->json();

        $this->assertCount(50, $page['data']);
        $this->assertFalse($page['has_newer']);
        $this->assertNull($page['newer_cursor']);
    }

    public function test_the_live_tail_has_no_newer_and_the_oldest_page_has_no_older(): void
    {
        $messages = $this->messages(55);

        $tail = $this->actingAs($this->user)
            ->getJson("/api/channels/{$this->channel->id}/messages")
            ->json();

        $this->assertFalse($tail['has_newer']);
        $this->assertTrue($tail['has_older']);

        $oldest = $this->actingAs($this->user)
            ->getJson("/api/channels/{$this->channel->id}/messages?before={$messages[5]->id}")
            ->json();

        $this->assertCount(5, $oldest['data']);
        $this->assertFalse($oldest['has_older']);
        $this->assertNull($oldest['older_cursor']);
    }

    public function test_paging_in_both_directions_at_once_is_rejected(): void
    {
        $messages = $this->messages(3);

        $this->actingAs($this->user)
            ->getJson("/api/channels/{$this->channel->id}/messages?before={$messages[2]->id}&after={$messages[0]->id}")
            ->assertStatus(422);
    }

    public function test_an_unknown_cursor_is_rejected_rather_than_silently_serving_the_tail(): void
    {
        $this->messages(3);

        $this->actingAs($this->user)
            ->getJson("/api/channels/{$this->channel->id}/messages?after=" . \Illuminate\Support\Str::uuid7())
            ->assertStatus(422);
    }

    public function test_a_deleted_message_still_works_as_a_cursor(): void
    {
        $messages = $this->messages(10);
        $messages[4]->delete();

        $page = $this->actingAs($this->user)
            ->getJson("/api/channels/{$this->channel->id}/messages?after={$messages[4]->id}")
            ->json();

        $this->assertSame(
            [$messages[5]->id, $messages[6]->id, $messages[7]->id, $messages[8]->id, $messages[9]->id],
            array_column($page['data'], 'id'),
        );
    }

    public function test_a_non_member_cannot_page_forward(): void
    {
        $messages = $this->messages(3);

        $this->actingAs(User::factory()->create())
            ->getJson("/api/channels/{$this->channel->id}/messages?after={$messages[0]->id}")
            ->assertForbidden();
    }

    public function test_conversation_messages_page_forward_too(): void
    {
        $conversation = Conversation::create(['type' => 'dm']);
        ConversationParticipant::create([
            'conversation_id' => $conversation->id,
            'user_id'         => $this->user->id,
        ]);

        $messages = Message::factory()
            ->for($conversation)
            ->count(4)
            ->sequence(fn ($seq) => ['created_at' => now()->addSeconds($seq->index), 'channel_id' => null])
            ->create();

        $page = $this->actingAs($this->user)
            ->getJson("/api/conversations/{$conversation->id}/messages?after={$messages[1]->id}")
            ->json();

        $this->assertSame([$messages[2]->id, $messages[3]->id], array_column($page['data'], 'id'));
        $this->assertTrue($page['has_older']);
        $this->assertFalse($page['has_newer']);
    }
}
