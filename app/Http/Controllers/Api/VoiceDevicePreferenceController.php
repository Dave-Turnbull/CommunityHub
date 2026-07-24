<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\UserSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

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
            'client_id'                  => ['required', 'string', 'max:64'],
            'input_device_id'            => ['nullable', 'string'],
            'output_device_id'           => ['nullable', 'string'],
            'send_threshold'             => ['nullable', 'integer', 'min:0', 'max:100'],
            'close_threshold_gap'        => ['nullable', 'integer', Rule::in([0, 10, 20, 30])],
            'close_threshold_timeout_ms' => ['nullable', 'integer', Rule::in([500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000])],
            'echo_cancellation'          => ['nullable', 'boolean'],
            'noise_suppression'          => ['nullable', 'boolean'],
            'auto_gain_control'          => ['nullable', 'boolean'],
        ]);

        // null is a real, meaningful value for close_threshold_timeout_ms
        // ("Off") — array_key_exists (not ??) so an explicit null from the
        // client is respected rather than silently replaced by the default,
        // which only applies when the field is omitted entirely.
        $closeThresholdTimeoutMs = array_key_exists('close_threshold_timeout_ms', $validated)
            ? $validated['close_threshold_timeout_ms']
            : 2000;

        $preference = $this->settings->updateDevicePreference(
            $request->user(),
            $validated['client_id'],
            $validated['input_device_id'] ?? null,
            $validated['output_device_id'] ?? null,
            $validated['send_threshold'] ?? 0,
            $validated['close_threshold_gap'] ?? 20,
            $closeThresholdTimeoutMs,
            $validated['echo_cancellation'] ?? true,
            $validated['noise_suppression'] ?? true,
            $validated['auto_gain_control'] ?? true,
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
