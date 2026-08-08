<?php

namespace App\Support;

use App\Models\Role;
use App\Models\User;
use App\Support\ChannelTypes\ChannelTypeRegistry;
use Illuminate\Support\Collection;

/**
 * The one recursive "can this actor grant that" primitive, reused at every
 * layer of the Server → Room → Channel hierarchy (room-role edits,
 * global-role edits, ceiling-authoring, and — via
 * Api\ChannelController::updatePermissionOverrides — channel-tier
 * overrides). By induction, an actor's own effective permission set
 * (PermissionChecker::can()) is already bounded by everything above it —
 * a room's Owner can never hold more than the room's snapshot ceiling, so
 * grantablePermissions() needs no ceiling-awareness of its own. Ceiling
 * *authoring* (editing what a server role's ceiling contains) is a
 * different question — see actorCeilingCapacity() — because a room
 * ceiling caps rooms, it isn't itself evidence of what a server-wide actor
 * personally holds. See docs/roles-and-permissions.md.
 */
final class PermissionCeiling
{
    /** Every Permission the actor may currently grant onto $forRole's actual permission set. */
    public static function grantablePermissions(User $actor, Role $forRole): Collection
    {
        $room = $forRole->room_id === null ? null : $forRole->room;

        return collect(Permission::cases())
            ->filter(fn (Permission $p) => PermissionChecker::can($actor, $p, $room))
            ->values();
    }

    /** Every channel-creation category the actor may currently grant onto $forRole. */
    public static function grantableCategories(User $actor, Role $forRole): Collection
    {
        $room = $forRole->room_id === null ? null : $forRole->room;

        return collect(ChannelTypeRegistry::knownCategories())
            ->filter(function (string $category) use ($actor, $room) {
                if (PermissionChecker::can($actor, Permission::Administrator, $room)) {
                    return true;
                }

                if (PermissionChecker::hasCategoryGrant($actor, $category, $room)) {
                    return true;
                }

                $bucket = $category === 'mod' ? Permission::ManageModChannels : Permission::ManageChannels;

                return PermissionChecker::can($actor, $bucket, $room);
            })
            ->values();
    }

    /**
     * Every Permission the actor's own global-role ceiling capacity allows
     * them to write into ANOTHER global role's ceiling, or the sentinel
     * 'unrestricted' if any global role they hold imposes no ceiling of its
     * own (Administrator included — it's never restricted). Sourced from
     * RoleRoomPermissionCeiling, not PermissionChecker::can() — "does the
     * actor hold this in some room" isn't the right question here.
     */
    public static function actorCeilingCapacity(User $actor): array|string
    {
        $globalRoles = static::actorGlobalRoles($actor, 'roomPermissionCeilings');

        if ($globalRoles->isEmpty()) {
            return [];
        }

        if ($globalRoles->contains(fn (Role $r) => ! $r->has_room_permission_ceiling)) {
            return 'unrestricted';
        }

        return $globalRoles->flatMap->roomPermissionCeilings
            ->map(fn ($ceiling) => $ceiling->permission->value)
            ->unique()->values()->all();
    }

    /** Channel-category sibling of actorCeilingCapacity(). */
    public static function actorCeilingCategoryCapacity(User $actor): array|string
    {
        $globalRoles = static::actorGlobalRoles($actor, 'roomChannelCategoryCeilings');

        if ($globalRoles->isEmpty()) {
            return [];
        }

        if ($globalRoles->contains(fn (Role $r) => ! $r->has_room_permission_ceiling)) {
            return 'unrestricted';
        }

        return $globalRoles->flatMap->roomChannelCategoryCeilings
            ->pluck('category')->unique()->values()->all();
    }

    private static function actorGlobalRoles(User $actor, string $with): Collection
    {
        return Role::query()
            ->whereNull('room_id')
            ->whereHas('assignments', fn ($q) => $q->where('user_id', $actor->id))
            ->with($with)
            ->get();
    }
}
