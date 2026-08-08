<?php

namespace App\Http\Controllers\Api;

use App\Events\ReactionChanged;
use App\Http\Controllers\Controller;
use App\Models\Channel;
use App\Models\Message;
use App\Models\Reaction;
use App\Models\User;
use App\Support\Permission;
use App\Support\PermissionChecker;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ReactionController extends Controller
{
    public function store(Request $request, Message $message): JsonResponse
    {
        $this->authorizeAccess($message, $request->user());

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
        $this->authorizeAccess($message, $request->user());

        Reaction::where([
            'message_id' => $message->id,
            'user_id'    => $request->user()->id,
            'emoji'      => urldecode($emoji),
        ])->delete();

        return $this->broadcastSummary($message, $request->user()->id);
    }

    private function authorizeAccess(Message $message, User $user): void
    {
        $allowed = $message->channel_id
            ? $message->channel->room->hasMember($user->id)
            : $message->conversation->hasParticipant($user->id);

        abort_unless($allowed, 403);

        // Previously no Permission::* check at all, only membership above —
        // mirrors TextMessageService::authorizeSend's Comment check exactly
        // (channel-scoped goes through the per-channel override table, a
        // conversation-scoped message falls back to plain room = null
        // resolution — there's no channel to override against).
        $scopeEntity = $message->scopeEntity();
        $allowed = $scopeEntity instanceof Channel
            ? PermissionChecker::canInChannel($user, Permission::React, $scopeEntity)
            : PermissionChecker::can($user, Permission::React, null);

        abort_unless($allowed, 403, 'You are not allowed to react to messages here.');
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
