<?php

namespace App\Policies;

use App\Models\Role;
use App\Models\Room;
use App\Models\User;
use App\Support\Permission;
use App\Support\PermissionChecker;

class RolePolicy
{
    /**
     * Create a role in $room — no Role instance exists yet to authorize
     * against. $room is null for a global/instance-wide role — ManageRoles
     * is the same permission for both scopes (see CLAUDE.md: kept as one
     * mechanism, not a separate global-only ability), and PermissionChecker
     * already accepts a nullable room.
     */
    public function create(User $user, ?Room $room = null): bool
    {
        return PermissionChecker::can($user, Permission::ManageRoles, $room);
    }

    /**
     * Update/delete a role, or change its member/permission assignments.
     * A global role (room_id null) has no room to check — only a global
     * ManageRoles grant can manage it, deliberately excluded from this
     * milestone's UI (see CLAUDE.md) but enforced here regardless.
     *
     * For a room-scoped role, ManageRoles alone isn't sufficient — the actor
     * must also outrank the target role in that room's hierarchy (Owner top,
     * custom roles by position, Member bottom; see Role::rank()/outranks()).
     * This is what keeps a custom role with ManageRoles from editing/
     * deleting/reassigning a role at or above its own rank, including
     * itself — see CLAUDE.md's "Roles & permissions" convention.
     *
     * $target, when given (addMember/removeMember — see Api\RoleController),
     * is the user whose membership in $role is being changed. Beyond
     * outranking the role itself, the actor must also outrank $target's own
     * highest role in this room — you can't add or remove a role for someone
     * ranked at or above you, even into/out of a role you could otherwise
     * manage. Exempted when $target is the actor themselves: managing your
     * own role memberships (e.g. leaving a role you also hold) isn't the
     * "one user overpowering another" scenario this guards against, and
     * without the exemption nobody could ever act on themselves — a user's
     * highest role always ties with itself.
     */
    public function manage(User $user, Role $role, ?User $target = null): bool
    {
        if (! PermissionChecker::can($user, Permission::ManageRoles, $role->room)) {
            return false;
        }

        if (! $role->room) {
            return true;
        }

        $highest = Role::highestRoleFor($user, $role->room);

        if ($highest === null || ! $highest->outranks($role)) {
            return false;
        }

        if ($target && $target->isNot($user)) {
            $targetHighest = Role::highestRoleFor($target, $role->room);

            if ($targetHighest && ! $highest->outranks($targetHighest)) {
                return false;
            }
        }

        return true;
    }
}
