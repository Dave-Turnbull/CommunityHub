<?php

namespace App\Events;

use App\Models\Channel;
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
        public string $scopeType,   // 'channel' | 'conversation' | 'message'
        public string $scopeId,
    ) {}

    /**
     * A comment (scopeType 'message') has no broadcast channel of its own —
     * there is deliberately no per-message presence channel (unbounded, see
     * docs/comments-and-voting.md's "Realtime" section) — so it rides the
     * physical channel.{id}/conversation.{id} of its root instead, still
     * carrying scopeType/scopeId 'message'/<parent id> in the payload for
     * the frontend to route by (see broadcastWith()).
     */
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

    public function broadcastAs(): string
    {
        return 'MessageSent';
    }

    public function broadcastWith(): array
    {
        return [
            'message'    => $this->message->toArray(),
            'scope_type' => $this->scopeType,
            'scope_id'   => $this->scopeId,
        ];
    }
}
