<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VoiceIceServersController extends Controller
{
    /**
     * STUN + ephemeral-credential TURN servers for the requesting user.
     * Not scoped to any room/channel/conversation — credentials are short-lived
     * (see config('turn.credential_ttl')) and identical for every call a user
     * joins, so there's nothing resource-specific to authorize beyond auth.
     */
    public function index(Request $request): JsonResponse
    {
        $host   = config('turn.public_host');
        $port   = config('turn.port');
        $secret = config('turn.secret');

        $username   = (string) (now()->addSeconds(config('turn.credential_ttl'))->timestamp).':'.$request->user()->id;
        $credential = base64_encode(hash_hmac('sha1', $username, (string) $secret, true));

        return response()->json([
            'iceServers' => [
                ['urls' => "stun:{$host}:{$port}"],
                [
                    'urls' => [
                        "turn:{$host}:{$port}?transport=udp",
                        "turn:{$host}:{$port}?transport=tcp",
                    ],
                    'username'   => $username,
                    'credential' => $credential,
                ],
            ],
        ]);
    }
}
