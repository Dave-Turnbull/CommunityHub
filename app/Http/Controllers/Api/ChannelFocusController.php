<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Channel;
use App\Support\ChannelFocus;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ChannelFocusController extends Controller
{
    public function focus(Request $request, Channel $channel): JsonResponse
    {
        abort_unless($channel->room->hasMember($request->user()->id), 403);

        ChannelFocus::focus($request->user()->id, $channel->id);

        return response()->json(['focused' => true]);
    }

    public function blur(Request $request, Channel $channel): JsonResponse
    {
        abort_unless($channel->room->hasMember($request->user()->id), 403);

        ChannelFocus::blur($request->user()->id, $channel->id);

        return response()->json(['focused' => false]);
    }
}
