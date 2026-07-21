<?php

namespace Tests\Unit\Models;

use App\Models\Message;
use App\Models\Reaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MessageTest extends TestCase
{
    use RefreshDatabase;

    public function test_reaction_summary_groups_by_emoji_and_flags_the_viewer(): void
    {
        $message = Message::factory()->create();
        $viewer = User::factory()->create();
        $other = User::factory()->create();

        Reaction::factory()->for($message)->for($viewer)->create(['emoji' => '👍']);
        Reaction::factory()->for($message)->for($other)->create(['emoji' => '👍']);
        Reaction::factory()->for($message)->for($other)->create(['emoji' => '🎉']);

        $summary = collect($message->reactionSummary($viewer->id))->keyBy('emoji');

        $this->assertSame(2, $summary['👍']['count']);
        $this->assertTrue($summary['👍']['reacted']);
        $this->assertSame(1, $summary['🎉']['count']);
        $this->assertFalse($summary['🎉']['reacted']);
    }

    public function test_reaction_summary_is_empty_for_a_message_with_no_reactions(): void
    {
        $message = Message::factory()->create();
        $viewer = User::factory()->create();

        $this->assertSame([], $message->reactionSummary($viewer->id));
    }
}
