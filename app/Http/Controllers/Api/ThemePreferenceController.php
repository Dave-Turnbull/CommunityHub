<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\UserSettingsService;
use App\Support\Theme\ThemeTokens;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ThemePreferenceController extends Controller
{
    public function __construct(private readonly UserSettingsService $settings) {}

    public function show(Request $request): JsonResponse
    {
        return response()->json($this->settings->themePreference($request->user()));
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'preset'    => ['required', 'string', Rule::in(ThemeTokens::PRESETS)],
            'overrides' => ['present', 'array'],
        ]);

        // Rule::exists()-style validation can't reach into an arbitrary-key
        // object like this, so each override is checked by hand against the
        // ThemeTokens allow-list rather than a validation rule.
        foreach ($validated['overrides'] as $key => $value) {
            abort_unless(
                is_string($key) && is_string($value)
                    && in_array($key, ThemeTokens::allKeys(), true)
                    && ThemeTokens::isValidValue($key, $value),
                422,
                "Invalid theme value for \"{$key}\"."
            );
        }

        $preference = $this->settings->updateThemePreference(
            $request->user(),
            $validated['preset'],
            $validated['overrides'],
        );

        return response()->json([
            'preset'    => $preference->preset,
            'overrides' => $preference->overrides,
        ]);
    }
}
