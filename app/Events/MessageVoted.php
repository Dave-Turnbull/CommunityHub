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

/**
 * Mirrors ReactionChanged's shape/broadcast-on-the-existing-channel
 * approach — no per-message presence channel, see docs/comments-and-voting.md.
 */
class MessageVoted implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public Message $message,
        public array $summary, // {score, mine} — mine omitted from the broadcast payload, see broadcastWith()
    ) {}

    public function broadcastOn(): array
    {
        $root = $this->message->scopeEntity();

        return [
            $root instanceof Channel
                ? new PresenceChannel("channel.{$root->id}")
                : new PrivateChannel("conversation.{$root->id}"),
        ];
    }

    public function broadcastAs(): string { return 'MessageVoted'; }

    public function broadcastWith(): array
    {
        [$scopeType, $scopeId] = $this->message->logicalScope();

        return [
            'message_id' => $this->message->id,
            'score'      => $this->summary['score'],
            'scope_type' => $scopeType,
            'scope_id'   => $scopeId,
        ];
    }
}
