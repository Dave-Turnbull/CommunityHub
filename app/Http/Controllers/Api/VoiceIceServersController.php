<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\VoiceSignalingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VoiceIceServersController extends Controller
{
    public function __construct(private readonly VoiceSignalingService $voice) {}

    /**
     * STUN + ephemeral-credential TURN servers for the requesting user.
     * Not scoped to any room/channel/conversation — credentials are short-lived
     * (see config('turn.credential_ttl')) and identical for every call a user
     * joins, so there's nothing resource-specific to authorize beyond auth.
     */
    public function index(Request $request): JsonResponse
    {
        return response()->json($this->voice->iceServers($request->user()));
    }
}
