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
        $this->assertTrue(ChannelTypeRegistry::hasCapability('text', 'text.read'));
        $this->assertTrue(ChannelTypeRegistry::hasCapability('announcement', 'text.read'));
        $this->assertFalse(ChannelTypeRegistry::hasCapability('voice', 'text.read'));

        $this->assertTrue(ChannelTypeRegistry::hasCapability('voice', 'voice.join'));
        $this->assertFalse(ChannelTypeRegistry::hasCapability('text', 'voice.join'));
    }

    public function test_every_built_in_type_declares_a_category_and_description(): void
    {
        foreach (['text', 'voice', 'announcement', 'conversation'] as $key) {
            $type = ChannelTypeRegistry::for($key);
            $this->assertNotSame('', $type->category());
            $this->assertNotSame('', $type->description());
        }

        $this->assertSame('mod', ChannelTypeRegistry::for('announcement')->category());
        $this->assertSame('standard', ChannelTypeRegistry::for('text')->category());
        $this->assertSame('standard', ChannelTypeRegistry::for('voice')->category());
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
