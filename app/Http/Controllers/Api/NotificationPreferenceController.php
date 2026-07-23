<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\NotificationPreference;
use App\Services\UserSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationPreferenceController extends Controller
{
    public function __construct(private readonly UserSettingsService $settings) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json($this->settings->notificationPreferences($request->user()));
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'category' => ['required', 'in:'.implode(',', array_keys(NotificationPreference::DEFAULTS))],
            'email'    => ['required', 'boolean'],
            'in_app'   => ['required', 'boolean'],
        ]);

        $preference = $this->settings->updateNotificationPreference(
            $request->user(),
            $validated['category'],
            $validated['email'],
            $validated['in_app'],
        );

        return response()->json($preference);
    }
}
