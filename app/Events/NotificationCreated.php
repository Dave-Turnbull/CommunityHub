<?php

namespace App\Events;

use App\Models\Notification;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class NotificationCreated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Notification $notification) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel("App.Models.User.{$this->notification->user_id}")];
    }

    public function broadcastAs(): string
    {
        return 'NotificationCreated';
    }

    public function broadcastWith(): array
    {
        return ['notification' => $this->notification->toArray()];
    }
}
