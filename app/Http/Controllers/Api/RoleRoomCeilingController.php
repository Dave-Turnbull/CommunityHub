<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\RoleRoomChannelCategoryCeiling;
use App\Models\RoleRoomPermissionCeiling;
use App\Support\ChannelTypes\ChannelTypeRegistry;
use App\Support\Permission;
use App\Support\PermissionCeiling;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

/**
 * Authors a global role's room-permission ceiling — the cap on what rooms
 * created by that role's holders may ever grant, room-wide, to any of their
 * own roles including Owner. See docs/roles-and-permissions.md's "Room
 * permission ceilings" and Room::snapshotPermissionCeiling().
 */
class RoleRoomCeilingController extends Controller
{
    public function update(Request $request, Role $role): JsonResponse
    {
        Gate::authorize('manageCeiling', $role);

        $roomTierValues = array_map(fn (Permission $p) => $p->value, Permission::roomTierCases());

        $validated = $request->validate([
            'has_ceiling'           => ['required', 'boolean'],
            'permissions'           => ['sometimes', 'array'],
            'permissions.*'         => ['string', Rule::in($roomTierValues)],
            'channel_categories'    => ['sometimes', 'array'],
            'channel_categories.*'  => ['string', Rule::in(ChannelTypeRegistry::knownCategories())],
        ]);

        // An actor can only put a permission/category into this ceiling if
        // it's within their own ceiling capacity — same recursive "can't
        // grant what you don't hold" rule PermissionCeiling::
        // grantablePermissions() enforces at room tier, instantiated here at
        // server tier instead. Only additions need checking; narrowing a
        // ceiling (or removing it) is always allowed.
        if (array_key_exists('permissions', $validated)) {
            $existing = $role->roomPermissionCeilings->pluck('permission')->map(fn ($p) => $p->value)->all();
            $added = array_diff($validated['permissions'], $existing);
            $capacity = PermissionCeiling::actorCeilingCapacity($request->user());
            $notGrantable = $capacity === 'unrestricted' ? [] : array_diff($added, $capacity);
            abort_if($notGrantable !== [], 422, 'You cannot include a permission in this ceiling that your own ceiling excludes: ' . implode(', ', $notGrantable));
        }

        if (array_key_exists('channel_categories', $validated)) {
            $existing = $role->roomChannelCategoryCeilings->pluck('category')->all();
            $added = array_diff($validated['channel_categories'], $existing);
            $capacity = PermissionCeiling::actorCeilingCategoryCapacity($request->user());
            $notGrantable = $capacity === 'unrestricted' ? [] : array_diff($added, $capacity);
            abort_if($notGrantable !== [], 422, 'You cannot include a channel category in this ceiling that your own ceiling excludes: ' . implode(', ', $notGrantable));
        }

        DB::transaction(function () use ($role, $validated) {
            $role->update(['has_room_permission_ceiling' => $validated['has_ceiling']]);

            // Full-replace, not a sync() diff — same reasoning as
            // Api\RoleController::update's permissions[]/channel_categories[]
            // handling: these are HasUuids pivot-shaped models, and
            // sync()/attach() bypass the creating event that generates their id.
            if (array_key_exists('permissions', $validated)) {
                RoleRoomPermissionCeiling::where('role_id', $role->id)
                    ->whereNotIn('permission', $validated['permissions'])
                    ->delete();
                foreach ($validated['permissions'] as $permission) {
                    RoleRoomPermissionCeiling::firstOrCreate(['role_id' => $role->id, 'permission' => $permission]);
                }
            }

            if (array_key_exists('channel_categories', $validated)) {
                RoleRoomChannelCategoryCeiling::where('role_id', $role->id)
                    ->whereNotIn('category', $validated['channel_categories'])
                    ->delete();
                foreach ($validated['channel_categories'] as $category) {
                    RoleRoomChannelCategoryCeiling::firstOrCreate(['role_id' => $role->id, 'category' => $category]);
                }
            }
        });

        $role->refresh()->load(['roomPermissionCeilings', 'roomChannelCategoryCeilings']);

        return response()->json([
            'has_room_permission_ceiling'   => $role->has_room_permission_ceiling,
            'room_permission_ceiling'       => $role->roomPermissionCeilings->pluck('permission')->map(fn ($p) => $p->value)->values(),
            'room_channel_category_ceiling' => $role->roomChannelCategoryCeilings->pluck('category')->values(),
        ]);
    }
}
