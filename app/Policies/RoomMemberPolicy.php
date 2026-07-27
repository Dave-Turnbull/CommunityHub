<?php

namespace App\Policies;

use App\Models\Role;
use App\Models\Room;
use App\Models\User;
use App\Support\Permission;
use App\Support\PermissionChecker;

/**
 * Kick/ban a room member — a genuinely different hierarchy comparison than
 * RolePolicy::manage's (see docs/roles-and-permissions.md's "The hierarchy is
 * broader than role management" section). Uses Role::effectiveModerationRank
 * (>=, not outranks()'s strict >) so same-rank peers (two Members, one
 * holding BanMembers) may act on one another, and so a global Administrator
 * — who ties Owner's rank here — can act on a room's Owner, which nothing
 * room-scoped can ever do.
 */
class RoomMemberPolicy
{
    public function kick(User $actor, Room $room, User $target): bool
    {
        return $this->canAct($actor, $room, $target, Permission::ManageMembers);
    }

    public function ban(User $actor, Room $room, User $target): bool
    {
        return $this->canAct($actor, $room, $target, Permission::BanMembers);
    }

    private function canAct(User $actor, Room $room, User $target, Permission $permission): bool
    {
        if ($actor->is($target)) {
            return false;
        }

        if (! PermissionChecker::can($actor, $permission, $room)) {
            return false;
        }

        return Role::effectiveModerationRank($actor, $room) >= Role::effectiveModerationRank($target, $room);
    }
}
