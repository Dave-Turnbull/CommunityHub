<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\VoiceDevicePreference;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VoiceDevicePreferenceController extends Controller
{
    /** The stored device preference for this user's (user_id, client_id) pair, or nulls if none is stored yet. */
    public function index(Request $request): JsonResponse
    {
        $clientId = $this->validateClientId($request);

        $preference = VoiceDevicePreference::forClient($request->user()->id, $clientId);

        return response()->json([
            'client_id'         => $clientId,
            'input_device_id'   => $preference->input_device_id ?? null,
            'output_device_id'  => $preference->output_device_id ?? null,
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'client_id'         => ['required', 'string', 'max:64'],
            'input_device_id'   => ['nullable', 'string'],
            'output_device_id'  => ['nullable', 'string'],
        ]);

        $preference = VoiceDevicePreference::updateOrCreate(
            ['user_id' => $request->user()->id, 'client_id' => $validated['client_id']],
            [
                'input_device_id'  => $validated['input_device_id'] ?? null,
                'output_device_id' => $validated['output_device_id'] ?? null,
            ],
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
