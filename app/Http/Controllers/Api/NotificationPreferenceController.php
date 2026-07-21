<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\NotificationPreference;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationPreferenceController extends Controller
{
    /** The effective (override-or-default) preference for every known category. */
    public function index(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $preferences = collect(array_keys(NotificationPreference::DEFAULTS))
            ->map(fn ($category) => [
                'category' => $category,
                ...NotificationPreference::for($userId, $category),
            ])
            ->values();

        return response()->json($preferences);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'category' => ['required', 'in:'.implode(',', array_keys(NotificationPreference::DEFAULTS))],
            'email'    => ['required', 'boolean'],
            'in_app'   => ['required', 'boolean'],
        ]);

        if (! $validated['in_app'] && in_array($validated['category'], NotificationPreference::IN_APP_LOCKED, true)) {
            return response()->json(['message' => 'This category cannot be turned off.'], 422);
        }

        $preference = NotificationPreference::updateOrCreate(
            ['user_id' => $request->user()->id, 'category' => $validated['category']],
            ['email' => $validated['email'], 'in_app' => $validated['in_app']],
        );

        return response()->json($preference);
    }
}
