<?php

namespace App\Support;

use App\Models\Role;
use App\Models\Room;
use App\Models\User;

/**
 * Resolves "does this user have this permission" across the two role scopes
 * described in CLAUDE.md's Conventions — a room-scoped role set (per
 * community) and a global/instance-wide role set that applies in every room.
 * A global role's grant always applies; a room-scoped role's grant only
 * applies when checking that same room. RoomPolicy::invite/ChannelPolicy/
 * RolePolicy all route through here rather than duplicating this union
 * themselves — see the "New action that should eventually be role-gated"
 * recipe in CLAUDE.md.
 */
final class PermissionChecker
{
    public static function can(User $user, Permission $permission, ?Room $room = null): bool
    {
        return static::rolesFor($user, $room)
            ->contains(fn (Role $role) => $role->hasPermission(Permission::Administrator) || $role->hasPermission($permission));
    }

    /**
     * Whether $user holds a role with an explicit per-category
     * channel-creation grant for $category — see
     * Role::hasCategoryGrant()/ChannelPolicy::create(). Additive with, not a
     * replacement for, can(Permission::ManageChannels/ManageModChannels).
     */
    public static function hasCategoryGrant(User $user, string $category, ?Room $room = null): bool
    {
        return static::rolesFor($user, $room)
            ->contains(fn (Role $role) => $role->hasPermission(Permission::Administrator) || $role->hasCategoryGrant($category));
    }

    /**
     * Every role — global, plus this room's if $room was passed — assigned
     * to $user. A global-only check ($room = null) deliberately excludes
     * room-scoped roles: "global" means instance-wide staff, not "staff of
     * no particular room."
     */
    private static function rolesFor(User $user, ?Room $room)
    {
        return Role::query()
            ->whereHas('assignments', fn ($q) => $q->where('user_id', $user->id))
            ->with(['rolePermissions', 'channelCategories'])
            ->where(function ($q) use ($room) {
                $q->whereNull('room_id');
                if ($room) {
                    $q->orWhere('room_id', $room->id);
                }
            })
            ->get();
    }
}
