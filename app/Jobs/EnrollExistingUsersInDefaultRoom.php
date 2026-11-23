<?php

namespace App\Jobs;

use App\Models\InstanceSetting;
use App\Models\Room;
use App\Models\User;
use App\Services\DefaultRoomService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

/**
 * The "also add all existing users" half of setting a default room — see
 * DefaultRoomService::set().
 */
class EnrollExistingUsersInDefaultRoom implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public function __construct(public string $roomId) {}

    public function handle(DefaultRoomService $defaultRoom): void
    {
        // The admin may have changed or cleared the default room between
        // dispatch and the worker picking this up.
        if (InstanceSetting::current()->default_room_id !== $this->roomId) {
            return;
        }

        $room = Room::find($this->roomId);
        if (! $room) {
            return;
        }

        User::query()->chunkById(200, function ($users) use ($defaultRoom, $room) {
            foreach ($users as $user) {
                $defaultRoom->enrollIn($room, $user);
            }
        });
    }
}
