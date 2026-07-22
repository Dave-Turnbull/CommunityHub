<?php

namespace App\Events;

use App\Models\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ChannelUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Channel $channel) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel("room.{$this->channel->room_id}")];
    }

    public function broadcastAs(): string { return 'ChannelUpdated'; }

    public function broadcastWith(): array
    {
        return ['channel' => $this->channel->toArray()];
    }
}
