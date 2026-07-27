<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Message;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class MessageController extends Controller
{
    /**
     * The "go to message" direct-link entry point (see CLAUDE.md): resolves
     * a bare message id to its channel/conversation, checks the same
     * visibility a normal page load would (MessagePolicy::view — also used
     * by AttachmentPolicy, so an attachment link and a message link are
     * authorized identically), then redirects there with `?message=` so
     * ChannelController::show/ConversationController::show seed a window
     * centered on it (TextMessageService::list's `around` cursor) instead of
     * the live tail. A soft-deleted message 404s via route-model binding
     * before this ever runs — nothing to jump to.
     */
    public function show(Request $request, Message $message): RedirectResponse
    {
        Gate::authorize('view', $message);

        if ($message->channel_id) {
            return redirect("/channels/{$message->channel_id}?message={$message->id}");
        }

        return redirect("/conversations/{$message->conversation_id}?message={$message->id}");
    }
}
