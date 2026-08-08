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
     * and nothing in this change narrows that. InviteMembers is added as an
     * explicit override so instance-wide/room staff who hold it can invite
     * even into a room they haven't joined. Split from ManageMembers (which
     * now means "kick" only) — see Permission::InviteMembers's docblock.
     */
    public function invite(User $user, Room $room): bool
    {
        return $room->hasMember($user->id) || PermissionChecker::can($user, Permission::InviteMembers, $room);
    }

    /**
     * Whether $user may create a new room — see Web\RoomController. Room
     * creation had no gate at all before CreateRoom existed; granted to the
     * global Member role by default (see Role::seedGlobalDefaults) so
     * ordinary users keep the ability they already have today.
     */
    public function create(User $user): bool
    {
        return PermissionChecker::can($user, Permission::CreateRoom, null);
    }
}
