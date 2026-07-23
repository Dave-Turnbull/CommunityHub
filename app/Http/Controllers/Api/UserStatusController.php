<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\UserStatusService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserStatusController extends Controller
{
    public function __construct(private readonly UserStatusService $status) {}

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'status'              => ['required', 'in:online,idle,dnd,offline,custom'],
            'custom_status'       => ['required_if:status,custom', 'nullable', 'string', 'max:128'],
            'custom_status_color' => ['required_if:status,custom', 'nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ]);

        $user = $request->user();
        $this->status->setStatus(
            $user, $validated['status'], $validated['custom_status'] ?? null, $validated['custom_status_color'] ?? null,
        );

        return response()->json([
            'status'              => $user->status,
            'custom_status'       => $user->custom_status,
            'custom_status_color' => $user->custom_status_color,
            'recent'              => $this->status->recentCustomStatuses($user),
        ]);
    }
}
