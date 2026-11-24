<?php

namespace App\Events;

use App\Models\Channel;
use App\Models\Conversation;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class MessageDeleted implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public string $messageId,
        public string $scopeType,
        public string $scopeId,
        public Channel|Conversation|null $root = null,
    ) {}

    /**
     * A comment (scopeType 'message') rides its root's channel.{id}/
     * conversation.{id}, same as MessageSent — `$root` is that entity,
     * captured by the caller since the deleted row can no longer resolve it
     * on the queue.
     */
    public function broadcastOn(): array
    {
        if ($this->scopeType === 'message') {
            return [
                $this->root instanceof Channel
                    ? new PresenceChannel("channel.{$this->root->id}")
                    : new PrivateChannel("conversation.{$this->root->id}"),
            ];
        }

        return [
            $this->scopeType === 'channel'
                ? new PresenceChannel("channel.{$this->scopeId}")
                : new PrivateChannel("conversation.{$this->scopeId}"),
        ];
    }

    public function broadcastAs(): string { return 'MessageDeleted'; }

    public function broadcastWith(): array
    {
        return [
            'message_id' => $this->messageId,
            'scope_type' => $this->scopeType,
            'scope_id'   => $this->scopeId,
        ];
    }
}
