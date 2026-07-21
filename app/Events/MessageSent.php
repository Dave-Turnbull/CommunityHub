<?php

namespace App\Events;

use App\Models\Message;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class MessageSent implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public Message $message,
        public string $scopeType,   // 'channel' | 'conversation'
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

    public function broadcastAs(): string
    {
        return 'MessageSent';
    }

    public function broadcastWith(): array
    {
        return ['message' => $this->message->toArray()];
    }
}
