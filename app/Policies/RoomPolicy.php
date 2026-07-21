<?php

namespace App\Policies;

use App\Models\Room;
use App\Models\User;

class RoomPolicy
{
    /**
     * Whether $user can invite people into $room. Membership-only for now;
     * this is the single seam a future roles/permissions system replaces.
     */
    public function invite(User $user, Room $room): bool
    {
        return $room->hasMember($user->id);
    }
}
