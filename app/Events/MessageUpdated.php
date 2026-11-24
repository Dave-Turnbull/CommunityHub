<?php

namespace App\Events;

use App\Models\Message;
use App\Models\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class MessageUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public Message $message,
        public string $scopeType,
        public string $scopeId,
    ) {}

    /** A comment (scopeType 'message') rides its root's channel.{id}/conversation.{id}, same as MessageSent. */
    public function broadcastOn(): array
    {
        if ($this->scopeType === 'message') {
            $root = $this->message->scopeEntity();

            return [
                $root instanceof Channel
                    ? new PresenceChannel("channel.{$root->id}")
                    : new PrivateChannel("conversation.{$root->id}"),
            ];
        }

        return [
            $this->scopeType === 'channel'
                ? new PresenceChannel("channel.{$this->scopeId}")
                : new PrivateChannel("conversation.{$this->scopeId}"),
        ];
    }

    public function broadcastAs(): string { return 'MessageUpdated'; }

    public function broadcastWith(): array
    {
        return [
            'message'    => $this->message->toArray(),
            'scope_type' => $this->scopeType,
            'scope_id'   => $this->scopeId,
        ];
    }
}
