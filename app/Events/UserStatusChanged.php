<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Not sent ->toOthers() like most broadcasts here — UserStatusService is
 * called from plain Inertia requests (Settings, login/logout), which never
 * set the X-Socket-ID header axios adds, so toOthers() would have nothing to
 * exclude anyway. Broadcasting to everyone (including the user who changed
 * it) keeps this the one source of truth for usePresence, rather than also
 * threading a local optimistic update through every UserStatusService call
 * site.
 */
class UserStatusChanged implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public string $userId,
        public string $status,
    ) {}

    public function broadcastOn(): array
    {
        return [new PresenceChannel('presence.global')];
    }

    public function broadcastAs(): string { return 'UserStatusChanged'; }

    public function broadcastWith(): array
    {
        return [
            'user_id' => $this->userId,
            'status'  => $this->status,
        ];
    }
}
