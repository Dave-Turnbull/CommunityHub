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
     * A global role (room_id null) now gets the same hierarchy treatment a
     * room-scoped role always has — ManageRoles alone used to be sufficient
     * for global roles, with no rank comparison at all; that let a custom
     * global role with ManageRoles edit/delete a peer or higher-ranked
     * global role (including, in principle, promoting itself). Role::rank()
     * already works unmodified for global roles (Administrator is_system
     * && !is_default → INF, the default Member → -INF, "Server Moderator"
     * and any other custom global role → its position) — see
     * Role::highestGlobalRoleFor().
     *
     * For any role, ManageRoles alone isn't sufficient — the actor must also
     * outrank the target role in its hierarchy (room-scoped: Owner top,
     * custom roles by position, Member bottom; global: same shape, sourced
     * from highestGlobalRoleFor()). This is what keeps a role with
     * ManageRoles from editing/deleting/reassigning a role at or above its
     * own rank, including itself — see CLAUDE.md's "Roles & permissions"
     * convention.
     *
     * $target, when given (addMember/removeMember — see Api\RoleController),
     * is the user whose membership in $role is being changed. Beyond
     * outranking the role itself, the actor must also outrank $target's own
     * highest role in the same scope — you can't add or remove a role for
     * someone ranked at or above you, even into/out of a role you could
     * otherwise manage. Exempted when $target is the actor themselves:
     * managing your own role memberships (e.g. leaving a role you also
     * hold) isn't the "one user overpowering another" scenario this guards
     * against, and without the exemption nobody could ever act on
     * themselves — a user's highest role always ties with itself.
     */
    public function manage(User $user, Role $role, ?User $target = null): bool
    {
        if (! PermissionChecker::can($user, Permission::ManageRoles, $role->room)) {
            return false;
        }

        // Explicit room_id check, not $role->room truthiness — see CLAUDE.md's
        // documented trap for exactly this class of bug on global roles.
        $isGlobal = $role->room_id === null;

        $highest = $isGlobal ? Role::highestGlobalRoleFor($user) : Role::highestRoleFor($user, $role->room);

        if ($highest === null || ! $highest->outranks($role)) {
            return false;
        }

        if ($target && $target->isNot($user)) {
            $targetHighest = $isGlobal
                ? Role::highestGlobalRoleFor($target)
                : Role::highestRoleFor($target, $role->room);

            if ($targetHighest && ! $highest->outranks($targetHighest)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Whether $user may edit $role's room-permission ceiling — only
     * meaningful for a global role. Gated by the same ManageRoles + strict
     * outranking pair as manage() (ceiling-authoring is just another way of
     * changing a role's abilities, not a separate privilege — see
     * CLAUDE.md's "Adding things" recipe and docs/roles-and-permissions.md);
     * the additional "does the actor's own ceiling capacity allow this
     * specific permission" check lives in PermissionCeiling::
     * actorCeilingCapacity(), applied where the ceiling is actually written
     * (Api\RoleRoomCeilingController), not here.
     */
    public function manageCeiling(User $user, Role $role): bool
    {
        abort_unless($role->room_id === null, 422, 'Only server-wide roles have a room permission ceiling.');

        if (! PermissionChecker::can($user, Permission::ManageRoles, null)) {
            return false;
        }

        $highest = Role::highestGlobalRoleFor($user);

        return $highest !== null && $highest->outranks($role);
    }
}
