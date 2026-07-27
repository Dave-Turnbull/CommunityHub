<?php

namespace App\Http\Controllers\Api;

use App\Events\ChannelCreated;
use App\Events\ChannelDeleted;
use App\Events\ChannelUpdated;
use App\Http\Controllers\Controller;
use App\Models\Channel;
use App\Models\ChannelRoleVisibility;
use App\Models\Role;
use App\Models\Room;
use App\Support\ChannelTypes\ChannelTypeRegistry;
use App\Support\Permission;
use App\Support\PermissionChecker;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class ChannelController extends Controller
{
    public function store(Request $request, Room $room): JsonResponse
    {
        Gate::authorize('create', [Channel::class, $room]);

        $validated = $request->validate([
            'name'  => ['required', 'string', 'max:100'],
            'type'  => ['required', 'string', Rule::in(ChannelTypeRegistry::registeredTypeKeys())],
            'topic' => ['nullable', 'string', 'max:1024'],
        ]);

        $channelType = ChannelTypeRegistry::for($validated['type']);

        $channel = Channel::create([
            'room_id'  => $room->id,
            'name'     => $validated['name'],
            'type'     => $validated['type'],
            'topic'    => $validated['topic'] ?? null,
            'position' => (int) $room->channels()->max('position') + 1,
            'settings' => $channelType?->defaultSettings() ?? [],
        ]);

        broadcast(new ChannelCreated($channel))->toOthers();

        return response()->json($channel, 201);
    }

    public function update(Request $request, Channel $channel): JsonResponse
    {
        // visibility_role_ids is gated by its own ManageChannelVisibility
        // permission (see updateVisibility()), deliberately separate from
        // ManageChannels below — an actor who only holds the former can
        // restrict a channel without being able to rename/delete it.
        $hasOtherFields = $request->hasAny(['name', 'topic', 'is_nsfw', 'slow_mode_seconds']);
        $hasVisibility  = $request->has('visibility_role_ids');

        // Both authorizations are checked before *either* mutation runs —
        // a mixed request (e.g. name + visibility_role_ids together) must
        // never partially apply just because the actor lacks one of the two
        // permissions it needs. Checking manage() then mutating then
        // checking manageVisibility() would let the name change commit even
        // though the overall request ends in a 403.
        if ($hasOtherFields) {
            Gate::authorize('manage', $channel);
        }
        if ($hasVisibility) {
            Gate::authorize('manageVisibility', $channel);
        }

        // Also transactional — updateVisibility() can still abort partway
        // through (422, a role that outranks the actor) after $channel's
        // other fields were already saved above; the transaction rolls that
        // back too rather than leaving a half-applied update.
        DB::transaction(function () use ($request, $channel, $hasOtherFields, $hasVisibility) {
            if ($hasOtherFields) {
                $validated = $request->validate([
                    'name'              => ['sometimes', 'string', 'max:100'],
                    'topic'             => ['sometimes', 'nullable', 'string', 'max:1024'],
                    'is_nsfw'           => ['sometimes', 'boolean'],
                    'slow_mode_seconds' => ['sometimes', 'integer', 'min:0', 'max:21600'],
                ]);

                $channel->update($validated);
            }

            if ($hasVisibility) {
                $this->updateVisibility($request, $channel);
            }
        });

        broadcast(new ChannelUpdated($channel))->toOthers();

        return response()->json($channel->fresh()->load('visibilityRoles'));
    }

    /**
     * A lower-ranked role can never lock a higher-ranked one out of a
     * channel — see Permission::ManageChannelVisibility's docblock and
     * docs/roles-and-permissions.md. An actor whose ManageChannelVisibility
     * grant comes from a global role is exempt (mirrors
     * Role::effectiveModerationRank's global-supersedes-room-hierarchy
     * pattern) since they hold no room-scoped rank to compare against.
     *
     * Rows are written via the ChannelRoleVisibility model directly
     * (create/delete), not BelongsToMany::sync() — sync() performs a bulk
     * query-builder insert that bypasses Eloquent's `creating` event, which
     * is what HasUuids relies on to generate the pivot's `id`. Matches the
     * same reason role_permissions/role_assignments are written through
     * their models rather than attach()/sync() elsewhere in this codebase.
     */
    private function updateVisibility(Request $request, Channel $channel): void
    {
        Gate::authorize('manageVisibility', $channel);

        $room = $channel->room;

        $validated = $request->validate([
            'visibility_role_ids'   => ['present', 'array'],
            'visibility_role_ids.*' => ['uuid', Rule::exists('roles', 'id')->where('room_id', $room->id)],
        ]);

        $roleIds = $validated['visibility_role_ids'];

        if (! empty($roleIds)) {
            $actorIsGloballyGranted = PermissionChecker::can($request->user(), Permission::ManageChannelVisibility, null);
            $actorRank = $actorIsGloballyGranted ? INF : (Role::highestRoleFor($request->user(), $room)?->rank() ?? -INF);

            foreach ($room->roles as $role) {
                abort_if(
                    $role->rank() > $actorRank && ! in_array($role->id, $roleIds, true),
                    422,
                    'Cannot restrict a role that outranks your own.'
                );
            }
        }

        ChannelRoleVisibility::where('channel_id', $channel->id)->whereNotIn('role_id', $roleIds)->delete();
        foreach ($roleIds as $roleId) {
            ChannelRoleVisibility::firstOrCreate(['channel_id' => $channel->id, 'role_id' => $roleId]);
        }
    }

    public function destroy(Request $request, Channel $channel): JsonResponse
    {
        Gate::authorize('manage', $channel);

        $channelId = $channel->id;
        $roomId = $channel->room_id;

        $channel->delete();

        broadcast(new ChannelDeleted($channelId, $roomId))->toOthers();

        return response()->json(['deleted' => true]);
    }

    public function reorder(Request $request, Room $room): JsonResponse
    {
        Gate::authorize('create', [Channel::class, $room]);

        $validated = $request->validate([
            'channel_ids'   => ['required', 'array'],
            'channel_ids.*' => ['uuid', Rule::exists('channels', 'id')->where('room_id', $room->id)],
        ]);

        foreach (array_values($validated['channel_ids']) as $position => $channelId) {
            Channel::where('id', $channelId)->update(['position' => $position]);
        }

        return response()->json(['reordered' => true]);
    }
}
