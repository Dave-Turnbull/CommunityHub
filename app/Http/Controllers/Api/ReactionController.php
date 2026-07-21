<?php

namespace App\Http\Controllers\Api;

use App\Events\ReactionChanged;
use App\Http\Controllers\Controller;
use App\Models\Message;
use App\Models\Reaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReactionController extends Controller
{
    public function store(Request $request, Message $message): JsonResponse
    {
        $this->authorizeAccess($message, $request->user()->id);

        $validated = $request->validate([
            'emoji' => ['required', 'string', 'max:64'],
        ]);

        Reaction::firstOrCreate([
            'message_id' => $message->id,
            'user_id'    => $request->user()->id,
            'emoji'      => $validated['emoji'],
        ]);

        return $this->broadcastSummary($message, $request->user()->id);
    }

    public function destroy(Request $request, Message $message, string $emoji): JsonResponse
    {
        $this->authorizeAccess($message, $request->user()->id);

        Reaction::where([
            'message_id' => $message->id,
            'user_id'    => $request->user()->id,
            'emoji'      => urldecode($emoji),
        ])->delete();

        return $this->broadcastSummary($message, $request->user()->id);
    }

    private function authorizeAccess(Message $message, string $userId): void
    {
        $allowed = $message->channel_id
            ? $message->channel->room->hasMember($userId)
            : $message->conversation->hasParticipant($userId);

        abort_unless($allowed, 403);
    }

    private function broadcastSummary(Message $message, string $userId): JsonResponse
    {
        $summary = $message->fresh()->reactionSummary($userId);

        [$type, $id] = $message->channel_id
            ? ['channel', $message->channel_id]
            : ['conversation', $message->conversation_id];

        broadcast(new ReactionChanged($message->id, $summary, $type, $id))->toOthers();

        return response()->json($summary);
    }
}
