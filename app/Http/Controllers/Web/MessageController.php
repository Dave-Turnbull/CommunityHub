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
     *
     * A comment has no channel/conversation of its own and is never in that
     * scope's message window, so its link lands on its root ancestor
     * (`root_message_id`, the same denormalized pointer
     * Message::scopeEntity() walks) instead. A root that has been
     * tombstoned or deleted is out of every window too: 404, but only after
     * checking the viewer could see that scope, so it reveals nothing to
     * an outsider.
     */
    public function show(Request $request, Message $message): RedirectResponse
    {
        $root = $message->parent_message_id
            ? $message->root()->withTrashed()->firstOrFail()
            : $message;

        Gate::authorize('view', $root->trashed() ? $root : $message);
        abort_if($root->trashed(), 404);

        if ($root->channel_id) {
            return redirect("/channels/{$root->channel_id}?message={$root->id}");
        }

        return redirect("/conversations/{$root->conversation_id}?message={$root->id}");
    }
}
