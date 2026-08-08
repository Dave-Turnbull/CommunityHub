<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InstanceSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * The three server signup-path toggles — backs Settings' self-fetching
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
}
