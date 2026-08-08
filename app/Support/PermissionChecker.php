<?php

namespace App\Support;

use App\Models\Channel;
use App\Models\ChannelPermissionOverride;
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
     * $permission's room-tier resolution for $channel specifically, with a
     * curated subset (Permission::channelOverridableCases()) additionally
     * checkable per-role via ChannelPermissionOverride — see
     * docs/roles-and-permissions.md's "Room permission ceilings". A row's
     * `allowed` replaces *only that one role's* contribution to the
     * OR-union below, not a global deny — a user holding a second,
     * non-overridden role that grants the permission still passes. Same
     * "no explicit deny" philosophy can() already has, one layer deeper.
     */
    public static function canInChannel(User $user, Permission $permission, Channel $channel): bool
    {
        if (static::can($user, Permission::Administrator, $channel->room)) {
            return true;
        }

        $overrides = ChannelPermissionOverride::where('channel_id', $channel->id)
            ->where('permission', $permission->value)
            ->get()
            ->keyBy('role_id');

        return static::rolesFor($user, $channel->room)->contains(function (Role $role) use ($overrides, $permission) {
            $override = $overrides->get($role->id);

            return $override ? $override->allowed : $role->hasPermission($permission);
        });
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
