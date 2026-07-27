<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\RoleChannelCategory;
use App\Models\Room;
use App\Models\User;
use App\Support\ChannelTypes\ChannelTypeRegistry;
use App\Support\Permission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class RoleController extends Controller
{
    /**
     * Instance-wide (global) roles + every user (an assignment target isn't
     * scoped to any one room's membership the way a room role's is) — backs
     * the Roles tab in Settings (`components/settings/GlobalRolesSettings.tsx`).
     * Self-fetched by that tab rather than threaded through Inertia props,
     * matching NotificationPreferences/AudioSettings's pattern for settings
     * tab content.
     */
    public function indexGlobal(): JsonResponse
    {
        Gate::authorize('create', [Role::class, null]);

        $roles = Role::whereNull('room_id')
            ->with(['rolePermissions', 'channelCategories', 'users:id,username,display_name,avatar_url'])
            ->orderByDesc('position')
            ->get();

        $roles->each(
            fn (Role $role) => $role->setAttribute('can_manage', Gate::allows('manage', $role))
        );

        return response()->json([
            'roles' => $roles,
            'users' => User::query()->orderBy('display_name')->get(['id', 'username', 'display_name', 'avatar_url']),
        ]);
    }

    /**
     * Room-scoped roles + members — backs RoomRolesPanel.tsx, the inline
     * panel ChannelSidebar's "Roles" button swaps into the main pane (in
     * place of a dedicated Inertia page). Self-fetched the same way
     * indexGlobal() backs the Settings Roles tab.
     */
    public function index(Request $request, Room $room): JsonResponse
    {
        abort_unless($room->hasMember($request->user()->id), 403);
        Gate::authorize('create', [Role::class, $room]);

        $room->load([
            'roles.rolePermissions',
            'roles.channelCategories',
            'roles.users:id,username,display_name,avatar_url',
            'members.user:id,username,display_name,avatar_url',
        ]);

        $room->roles->each(
            fn (Role $role) => $role->setAttribute('can_manage', Gate::allows('manage', $role))
        );

        return response()->json([
            'roles'   => $room->roles,
            'members' => $room->members,
        ]);
    }

    public function store(Request $request, Room $room): JsonResponse
    {
        Gate::authorize('create', [Role::class, $room]);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:50'],
        ]);

        $role = $room->roles()->create([
            'name'       => $validated['name'],
            // Ranked among custom roles only — Owner/Member are pinned by
            // is_system/is_default in Role::rank(), not by this number, so a
            // pile of custom roles never numerically overtakes Owner's 100.
            'position'   => (int) $room->roles()->where('is_system', false)->max('position') + 1,
            'is_default' => false,
            'is_system'  => false,
        ]);

        $role->load(['rolePermissions', 'channelCategories']);
        // index() computes this per role on every fetch; store() skipped it,
        // so a role you just created came back with no can_manage at all —
        // RoleCard's `role.can_manage ?? false` then rendered it as
        // unmanageable (no add-member UI, etc.) until a refetch corrected it.
        // Compute it here too.
        $role->setAttribute('can_manage', Gate::allows('manage', $role));

        return response()->json($role, 201);
    }

    /** Global/instance-wide equivalent of store() — creates a room_id: null role. */
    public function storeGlobal(Request $request): JsonResponse
    {
        Gate::authorize('create', [Role::class, null]);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:50'],
        ]);

        $role = Role::create([
            'room_id'    => null,
            'name'       => $validated['name'],
            'position'   => (int) Role::whereNull('room_id')->where('is_system', false)->max('position') + 1,
            'is_default' => false,
            'is_system'  => false,
        ]);

        $role->load(['rolePermissions', 'channelCategories']);
        $role->setAttribute('can_manage', Gate::allows('manage', $role));

        return response()->json($role, 201);
    }

    public function update(Request $request, Role $role): JsonResponse
    {
        Gate::authorize('manage', $role);

        // Owner is fully locked. Member (is_default) is now permission-editable
        // (per-room) but keeps its name/position/undeletability fixed — it's
        // the hierarchy's pinned bottom, see Role::rank().
        abort_if($role->is_system && ! $role->is_default, 422, 'This role is managed by the system and cannot be edited.');

        $validated = $request->validate([
            'name'                 => ['sometimes', 'string', 'max:50'],
            'position'             => ['sometimes', 'integer', 'min:0'],
            'permissions'          => ['sometimes', 'array'],
            'permissions.*'        => ['string', Rule::enum(Permission::class)],
            // A role's explicit per-category channel-creation grants — see
            // RoleChannelCategory/ChannelPolicy::create(). Validated against
            // the live channel-type registry, not a DB enum, same as
            // channels.type/permissions.* above.
            'channel_categories'   => ['sometimes', 'array'],
            'channel_categories.*' => ['string', Rule::in(ChannelTypeRegistry::knownCategories())],
        ]);

        if ($role->is_default) {
            abort_if(
                array_key_exists('name', $validated) || array_key_exists('position', $validated),
                422,
                "The default role's name and position are fixed."
            );
        }

        // Administrator is exclusively the Owner tier — see Role::rank(),
        // which treats "is_system && !is_default" as the hierarchy's pinned
        // top. Granting it to any other role would create a second,
        // ambiguous top of the hierarchy.
        if (array_key_exists('permissions', $validated) && in_array(Permission::Administrator->value, $validated['permissions'], true)) {
            abort(422, 'The administrator permission can only be granted to the Owner role.');
        }

        DB::transaction(function () use ($role, $validated) {
            $role->update(array_filter(
                $validated,
                fn ($key) => in_array($key, ['name', 'position'], true),
                ARRAY_FILTER_USE_KEY
            ));

            if (array_key_exists('permissions', $validated)) {
                $role->rolePermissions()->delete();
                foreach ($validated['permissions'] as $permission) {
                    $role->rolePermissions()->create(['permission' => $permission]);
                }
            }

            // Full-replace, not a sync() diff — RoleChannelCategory is a
            // HasUuids pivot-shaped model, and sync()/attach() bypass
            // Eloquent's creating event that generates its id (same reason
            // ChannelRoleVisibility/role_permissions are written through
            // their models rather than pivot helpers).
            if (array_key_exists('channel_categories', $validated)) {
                RoleChannelCategory::where('role_id', $role->id)
                    ->whereNotIn('category', $validated['channel_categories'])
                    ->delete();
                foreach ($validated['channel_categories'] as $category) {
                    RoleChannelCategory::firstOrCreate(['role_id' => $role->id, 'category' => $category]);
                }
            }
        });

        return response()->json($role->fresh(['rolePermissions', 'channelCategories']));
    }

    /**
     * Reorders every custom (non-system) role in $room — Owner/Member never
     * move, they're pinned by Role::rank(). Requires the full set of the
     * room's custom role ids so positions never collide with a role left out
     * of the request. Each role in the list is authorized individually via
     * RolePolicy::manage, so a reorder can't be used to promote a role above
     * the actor's own rank or move one the actor can't otherwise manage.
     */
    public function reorder(Request $request, Room $room): JsonResponse
    {
        Gate::authorize('create', [Role::class, $room]);

        $validated = $request->validate([
            'role_ids'   => ['required', 'array'],
            // 0, not false — Rule::exists()->where() stringifies its value
            // via str_replace() internally, which coerces `false` to an
            // empty string and silently breaks the comparison (matches
            // nothing). Booleans must be passed as 0/1 here.
            'role_ids.*' => ['uuid', Rule::exists('roles', 'id')->where('room_id', $room->id)->where('is_system', 0)],
        ]);

        $customRoleCount = $room->roles()->where('is_system', false)->count();
        abort_unless(count($validated['role_ids']) === $customRoleCount, 422, 'role_ids must include every custom role in this room.');

        // Every custom role must be included (see above), which necessarily
        // includes the actor's own role — RolePolicy::manage's strict
        // outranks() would reject that as "managing yourself," so reorder
        // uses the looser outranksOrEquals() instead. This still fully
        // blocks reordering a role that outranks the actor.
        $highest = Role::highestRoleFor($request->user(), $room);
        abort_if($highest === null, 403);

        $roles = Role::whereIn('id', $validated['role_ids'])->get()->keyBy('id');
        foreach ($validated['role_ids'] as $roleId) {
            abort_unless($highest->outranksOrEquals($roles[$roleId]), 403);
        }

        $count = count($validated['role_ids']);
        foreach (array_values($validated['role_ids']) as $index => $roleId) {
            Role::where('id', $roleId)->update(['position' => $count - $index]);
        }

        return response()->json(['reordered' => true]);
    }

    /**
     * Global/instance-wide equivalent of reorder(). Global roles have no
     * per-room hierarchy to compare against (RolePolicy::manage's `!$role->room`
     * branch already grants global role management on ManageRoles alone, with
     * no outranks() check) — so unlike reorder(), this doesn't need the
     * actor's highestRoleFor() gate.
     */
    public function reorderGlobal(Request $request): JsonResponse
    {
        Gate::authorize('create', [Role::class, null]);

        $validated = $request->validate([
            'role_ids'   => ['required', 'array'],
            'role_ids.*' => ['uuid', Rule::exists('roles', 'id')->where('room_id', null)->where('is_system', 0)],
        ]);

        $customRoleCount = Role::whereNull('room_id')->where('is_system', false)->count();
        abort_unless(count($validated['role_ids']) === $customRoleCount, 422, 'role_ids must include every custom global role.');

        $count = count($validated['role_ids']);
        foreach (array_values($validated['role_ids']) as $index => $roleId) {
            Role::where('id', $roleId)->update(['position' => $count - $index]);
        }

        return response()->json(['reordered' => true]);
    }

    public function destroy(Request $request, Role $role): JsonResponse
    {
        Gate::authorize('manage', $role);

        abort_if($role->is_system, 422, 'This role is managed by the system and cannot be deleted.');

        // Anyone who held only this role would otherwise be left with none
        // once it's gone — fall back to the default role for their scope
        // (room-scoped Member, or the global Member for a global role —
        // see defaultRoleFor()/hasOtherRoleInScope() below, which compare on
        // room_id directly rather than `$role->room`'s truthiness so a
        // global role's fallback isn't silently skipped the way a
        // room-scoped-only check would skip it) rather than leaving an
        // orphan (see removeMember for the same rule on a single removal;
        // deleting the role itself is never blocked the way removeMember can
        // block a single removal, since there's no "role" left to keep them in).
        $default = $this->defaultRoleFor($role);

        if ($default) {
            $role->assignments()->pluck('user_id')->each(function (string $userId) use ($role, $default) {
                if (! $this->hasOtherRoleInScope($role, $userId)) {
                    RoleAssignment::firstOrCreate(['role_id' => $default->id, 'user_id' => $userId]);
                }
            });
        }

        $role->delete();

        return response()->json(['deleted' => true]);
    }

    public function addMember(Request $request, Role $role): JsonResponse
    {
        $validated = $request->validate([
            'user_id' => ['required', 'uuid', 'exists:users,id'],
        ]);

        $target = User::findOrFail($validated['user_id']);
        Gate::authorize('manage', [$role, $target]);

        if ($role->room && ! $role->room->hasMember($target->id)) {
            abort(422, 'That user is not a member of this room.');
        }

        RoleAssignment::firstOrCreate(['role_id' => $role->id, 'user_id' => $target->id]);

        return response()->json(['assigned' => true], 201);
    }

    public function removeMember(Request $request, Role $role, User $user): JsonResponse
    {
        Gate::authorize('manage', [$role, $user]);

        // Every user needs at least one role in their scope (room, or
        // globally for a global role — see hasOtherRoleInScope()/
        // defaultRoleFor() below). Removing someone's last *custom* role
        // doesn't block the removal — they fall back to the scope's default
        // (Member) role instead. Member itself is the one role that can't
        // be auto-backed-up by itself, so removing it while it's someone's
        // only role in that scope is still a hard block, not a fallback.
        if (! $this->hasOtherRoleInScope($role, $user->id)) {
            abort_if($role->is_default, 422, 'A user must hold at least one role — Member is their last one.');

            $default = $this->defaultRoleFor($role);
            if ($default) {
                RoleAssignment::firstOrCreate(['role_id' => $default->id, 'user_id' => $user->id]);
            }
        }

        RoleAssignment::where('role_id', $role->id)->where('user_id', $user->id)->delete();

        return response()->json(['removed' => true]);
    }

    /**
     * Whether $userId holds any role in $role's scope (same room_id,
     * including null/global) other than $role itself. Compares on room_id
     * directly rather than `$role->room`'s truthiness — a boolean check
     * there would silently skip this guard entirely for global roles (see
     * trap: "every user needs at least one role" must hold in both scopes).
     */
    private function hasOtherRoleInScope(Role $role, string $userId): bool
    {
        return Role::where('room_id', $role->room_id)
            ->where('id', '!=', $role->id)
            ->whereHas('assignments', fn ($q) => $q->where('user_id', $userId))
            ->exists();
    }

    /** The default (is_default: true) role in $role's own scope — room-scoped Member, or the global Member for a global role. */
    private function defaultRoleFor(Role $role): ?Role
    {
        return Role::where('room_id', $role->room_id)->where('is_default', true)->first();
    }
}
