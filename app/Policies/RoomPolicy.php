<?php

namespace App\Policies;

use App\Models\Room;
use App\Models\User;

class RoomPolicy
{
    /**
     * Whether $user can invite people into $room. Still membership-only —
     * predates PermissionChecker/Role (see CLAUDE.md's "Roles & permissions"
     * convention) and hasn't been migrated onto it yet.
     */
    public function invite(User $user, Room $room): bool
    {
        return $room->hasMember($user->id);
    }
}
