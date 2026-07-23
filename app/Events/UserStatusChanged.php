<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * ShouldBroadcastNow, not the queued ShouldBroadcast most events here use —
 * this one is not sent ->toOthers() (it broadcasts to the acting user's own
 * tabs too, see UserStatusService), so a queued delay is directly visible to
 * the person who just changed their own status instead of only affecting
 * other users' views.
 */
class UserStatusChanged implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public string $userId,
        public string $status,
        public ?string $customStatus,
        public ?string $customStatusColor,
    ) {}

    public function broadcastOn(): array
    {
        return [new PresenceChannel('presence.global')];
    }

    public function broadcastAs(): string { return 'UserStatusChanged'; }

    public function broadcastWith(): array
    {
        return [
            'user_id'             => $this->userId,
            'status'              => $this->status,
            'custom_status'       => $this->customStatus,
            'custom_status_color' => $this->customStatusColor,
        ];
    }
}
