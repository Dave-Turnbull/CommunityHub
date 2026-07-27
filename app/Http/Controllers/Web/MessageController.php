<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Message;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class MessageController extends Controller
{
    /**
     * The "go to message" direct-link entry point (see CLAUDE.md): resolves
     * a bare message id to its channel/conversation, checks the same
     * visibility a normal page load would, then redirects there with
     * `?message=` so ChannelController::show/ConversationController::show
     * seed a window centered on it (TextMessageService::list's `around`
     * cursor) instead of the live tail. A soft-deleted message 404s via
     * route-model binding before this ever runs — nothing to jump to.
     */
    public function show(Request $request, Message $message): RedirectResponse
    {
        $user = $request->user();

        if ($message->channel_id) {
            $channel = $message->channel;

            abort_unless($channel->room->hasMember($user->id), 403);
            abort_unless($channel->isVisibleTo($user), 403);

            return redirect("/channels/{$channel->id}?message={$message->id}");
        }

        $conversation = $message->conversation;

        abort_unless($conversation->hasParticipant($user->id), 403);

        return redirect("/conversations/{$conversation->id}?message={$message->id}");
    }
}
