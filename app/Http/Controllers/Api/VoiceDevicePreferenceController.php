<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\UserSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VoiceDevicePreferenceController extends Controller
{
    public function __construct(private readonly UserSettingsService $settings) {}

    /** The stored device preference for this user's (user_id, client_id) pair, or nulls if none is stored yet. */
    public function index(Request $request): JsonResponse
    {
        $clientId = $this->validateClientId($request);

        return response()->json($this->settings->devicePreference($request->user(), $clientId));
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'client_id'         => ['required', 'string', 'max:64'],
            'input_device_id'   => ['nullable', 'string'],
            'output_device_id'  => ['nullable', 'string'],
            'send_threshold'    => ['nullable', 'integer', 'min:0', 'max:100'],
        ]);

        $preference = $this->settings->updateDevicePreference(
            $request->user(),
            $validated['client_id'],
            $validated['input_device_id'] ?? null,
            $validated['output_device_id'] ?? null,
            $validated['send_threshold'] ?? 0,
        );

        return response()->json($preference);
    }

    private function validateClientId(Request $request): string
    {
        return $request->validate([
            'client_id' => ['required', 'string', 'max:64'],
        ])['client_id'];
    }
}
