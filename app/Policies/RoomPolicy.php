<?php

namespace App\Policies;

use App\Models\Room;
use App\Models\User;
use App\Support\Permission;
use App\Support\PermissionChecker;

class RoomPolicy
{
    /**
     * Whether $user can invite people into $room. Membership remains
     * sufficient (unchanged, non-breaking) — any member could always invite,
     * and nothing in this change narrows that. ManageMembers is added as an
     * explicit override so instance-wide/room staff who hold it can invite
     * even into a room they haven't joined, now that ManageMembers has a
     * real enforcement site (see RoomMemberPolicy) rather than being inert.
     */
    public function invite(User $user, Room $room): bool
    {
        return $room->hasMember($user->id) || PermissionChecker::can($user, Permission::ManageMembers, $room);
    }
}
