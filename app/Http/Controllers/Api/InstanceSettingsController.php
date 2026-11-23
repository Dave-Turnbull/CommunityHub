<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InstanceSetting;
use App\Models\Room;
use App\Services\DefaultRoomService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * The server signup-path toggles and the default room — backs Settings' self-fetching
 * "Server" tab (RegistrationSettings.tsx) the same way Api\RoleController's
 * indexGlobal/storeGlobal back the Roles tab. Gated by InstanceSettingPolicy,
 * which reuses the same ManageRoles-at-global-tier check as managing global
 * roles.
 */
class InstanceSettingsController extends Controller
{
    public function show(): JsonResponse
    {
        Gate::authorize('manage', InstanceSetting::class);

        return response()->json(InstanceSetting::current());
    }

    public function update(Request $request): JsonResponse
    {
        Gate::authorize('manage', InstanceSetting::class);

        $validated = $request->validate([
            'signup_manual_enabled'       => ['required', 'boolean'],
            'signup_email_invite_enabled' => ['required', 'boolean'],
            'signup_oauth_enabled'        => ['required', 'boolean'],
        ]);

        $settings = InstanceSetting::current();
        $settings->update($validated);

        return response()->json($settings);
    }

    /**
     * Candidates for the default room: every room on the instance, not just
     * the ones the acting admin belongs to — this is an instance-level
     * choice. Id and name only.
     */
    public function rooms(): JsonResponse
    {
        Gate::authorize('manage', InstanceSetting::class);

        return response()->json(Room::query()->orderBy('name')->get(['id', 'name']));
    }

    public function updateDefaultRoom(Request $request, DefaultRoomService $defaultRoom): JsonResponse
    {
        Gate::authorize('manage', InstanceSetting::class);

        $validated = $request->validate([
            'room_id'         => ['present', 'nullable', 'uuid', 'exists:rooms,id'],
            'enroll_existing' => ['sometimes', 'boolean'],
        ]);

        $room = $validated['room_id'] ? Room::find($validated['room_id']) : null;

        return response()->json($defaultRoom->set($room, (bool) ($validated['enroll_existing'] ?? false)));
    }
}
