<?php

namespace Tests\Feature\Channels;

use App\Models\Attachment;
use App\Models\Channel;
use App\Models\Conversation;
use App\Models\ConversationParticipant;
use App\Models\Room;
use App\Models\RoomMember;
use App\Models\User;
use App\Support\ChannelTypes\ChannelType;
use App\Support\ChannelTypes\ChannelTypeRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Covers the FeatureRegistry-backed capability system replacing
 * Channel::isTextCapable()/isVoiceCapable() — see ChannelTextCapabilityGuardTest
 * for the pre-existing text/voice/unrecognized-type guard this must keep
 * passing unmodified through the rewrite.
 */
class CapabilityEnforcementTest extends TestCase
{
    use RefreshDatabase;

    private function member(Room $room): User
    {
        $user = User::factory()->create();
        RoomMember::factory()->for($room)->for($user)->create();

        return $user;
    }

    private function registerType(string $key, array $capabilities): void
    {
        ChannelTypeRegistry::register(new class($key, $capabilities) implements ChannelType {
            public function __construct(private string $key, private array $caps) {}
            public function key(): string { return $this->key; }
            public function label(): string { return $this->key; }
            public function icon(): string { return '#'; }
            public function order(): int { return 99; }
            public function capabilities(): array { return $this->caps; }
            public function defaultSettings(): array { return []; }
            public function category(): string { return 'standard'; }
            public function description(): string { return ''; }
        });
    }

    public function test_a_channel_type_with_zero_capabilities_cannot_send_or_list_messages(): void
    {
        $this->registerType('blank', []);
        $room    = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'blank']);
        $user    = $this->member($room);

        $this->actingAs($user)
            ->postJson("/api/channels/{$channel->id}/messages", ['content' => 'Hello!'])
            ->assertStatus(422);

        $this->actingAs($user)
            ->getJson("/api/channels/{$channel->id}/messages")
            ->assertStatus(422);

        $this->assertDatabaseCount('messages', 0);
    }

    public function test_a_channel_type_with_zero_capabilities_cannot_join_voice(): void
    {
        $this->registerType('blank', []);
        $room    = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'blank']);

        $this->assertFalse($channel->hasCapability('voice.join'));
    }

    public function test_a_channel_granted_only_read_can_list_but_not_send(): void
    {
        $this->registerType('read_only', ['text.read']);
        $room    = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'read_only']);
        $user    = $this->member($room);

        $this->actingAs($user)->getJson("/api/channels/{$channel->id}/messages")->assertOk();

        $this->actingAs($user)
            ->postJson("/api/channels/{$channel->id}/messages", ['content' => 'Hello!'])
            ->assertStatus(403);
    }

    public function test_a_channel_without_send_images_rejects_an_image_attachment(): void
    {
        $this->registerType('text_only', ['text.read', 'text.send_text']);
        $room    = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'text_only']);
        $user    = $this->member($room);
        $attachment = Attachment::factory()->create(['mime_type' => 'image/png']);

        $response = $this->actingAs($user)->postJson("/api/channels/{$channel->id}/messages", [
            'attachment_ids' => [$attachment->id],
        ]);

        $response->assertStatus(403);
        $this->assertDatabaseCount('messages', 0);
    }

    public function test_a_channel_with_send_images_but_not_send_video_rejects_a_video_attachment(): void
    {
        $this->registerType('images_only', ['text.read', 'text.send_text', 'text.send_images']);
        $room    = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'images_only']);
        $user    = $this->member($room);
        $image = Attachment::factory()->create(['mime_type' => 'image/png']);
        $video = Attachment::factory()->create(['mime_type' => 'video/mp4']);

        $this->actingAs($user)->postJson("/api/channels/{$channel->id}/messages", [
            'attachment_ids' => [$image->id],
        ])->assertCreated();

        $this->actingAs($user)->postJson("/api/channels/{$channel->id}/messages", [
            'attachment_ids' => [$video->id],
        ])->assertStatus(403);
    }

    public function test_text_all_grants_every_text_capability(): void
    {
        $this->registerType('full_text', ['text.all']);
        $room    = Room::factory()->create();
        $channel = Channel::factory()->for($room)->create(['type' => 'full_text']);

        $this->assertTrue($channel->hasCapability('text.read'));
        $this->assertTrue($channel->hasCapability('text.send_text'));
        $this->assertTrue($channel->hasCapability('text.send_images'));
        $this->assertTrue($channel->hasCapability('text.send_video'));
    }

    public function test_a_conversation_without_text_read_cannot_list_or_send(): void
    {
        // HybridConversationType grants everything by default — register a
        // throwaway type under the same 'conversation' key it resolves
        // through to prove the new conversation-side enforcement actually
        // does something, not just that it's wired up as a no-op.
        $this->registerType('conversation', []);

        $conversation = Conversation::factory()->create(['type' => 'dm']);
        $user = User::factory()->create();
        ConversationParticipant::factory()->for($conversation)->for($user)->create();

        $this->actingAs($user)
            ->getJson("/api/conversations/{$conversation->id}/messages")
            ->assertStatus(422);

        $this->actingAs($user)
            ->postJson("/api/conversations/{$conversation->id}/messages", ['content' => 'hey'])
            ->assertStatus(422);
    }
}
