<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Channel;
use App\Models\Conversation;
use App\Services\ReadMarkerService;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class ReadMarkerController extends Controller
{
    public function __construct(private ReadMarkerService $readMarkers) {}

    public function channel(Request $request, Channel $channel): Response
    {
        $this->readMarkers->markChannelRead($channel, $request->user());

        return response()->noContent();
    }

    public function conversation(Request $request, Conversation $conversation): Response
    {
        $this->readMarkers->markConversationRead($conversation, $request->user());

        return response()->noContent();
    }
}
