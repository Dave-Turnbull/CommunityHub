<?php

namespace Tests\Feature\Channels;

use App\Models\Channel;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use App\Support\ChannelTypes\ChannelTypeRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Covers the rewrite of Channel::isTextCapable() from the old
 * TEXT_CAPABLE_TYPES array constant onto ChannelTypeRegistry — see
 * ChannelTextCapabilityGuardTest for the message-endpoint-level guard this
 * backs, which must keep passing unmodified through this rewrite.
 */
class ChannelTypeRegistryTest extends TestCase
{
    use RefreshDatabase;

    public function test_built_in_types_report_the_expected_capabilities(): void
    {
        $this->assertTrue(ChannelTypeRegistry::for('text')->isTextCapable());
        $this->assertTrue(ChannelTypeRegistry::for('announcement')->isTextCapable());
        $this->assertFalse(ChannelTypeRegistry::for('voice')->isTextCapable());

        $this->assertTrue(ChannelTypeRegistry::for('voice')->isVoiceCapable());
        $this->assertFalse(ChannelTypeRegistry::for('text')->isVoiceCapable());
    }

    public function test_an_unregistered_type_is_not_text_capable(): void
    {
        $channel = Channel::factory()->create(['type' => 'drawing']);

        $this->assertNull(ChannelTypeRegistry::for('drawing'));
        $this->assertFalse($channel->isTextCapable());
    }

    public function test_room_show_lands_on_the_first_text_capable_channel_even_if_it_is_an_announcement_channel(): void
    {
        $room = Room::factory()->create();
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();

        $announcement = Channel::factory()->for($room)->create(['type' => 'announcement', 'position' => 0]);
        Channel::factory()->for($room)->create(['type' => 'voice', 'position' => 1]);

        $response = $this->actingAs($user)->get("/rooms/{$room->id}");

        $response->assertRedirect("/channels/{$announcement->id}");
    }
}
