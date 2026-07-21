<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ReactionChanged implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public string $messageId,
        public array $reactions,     // full [{emoji, count, reacted}] summary
        public string $scopeType,
        public string $scopeId,
    ) {}

    public function broadcastOn(): array
    {
        return [
            $this->scopeType === 'channel'
                ? new PresenceChannel("channel.{$this->scopeId}")
                : new PrivateChannel("conversation.{$this->scopeId}"),
        ];
    }

    public function broadcastAs(): string { return 'ReactionChanged'; }

    public function broadcastWith(): array
    {
        return [
            'message_id' => $this->messageId,
            'reactions'  => $this->reactions,
        ];
    }
}
