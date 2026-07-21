<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Channel;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class ChannelController extends Controller
{
    public function show(Request $request, Channel $channel): Response
    {
        $user = $request->user();
        $room = $channel->room;

        abort_unless($room->hasMember($user->id), 403);

        $room->load(['channels', 'customEmojis']);

        $members = $room->members()
            ->with('user:id,username,display_name,avatar_url,status,custom_status')
            ->get();

        // Non-text-capable channels (voice today; future custom types) have
        // no text chat (see MessageController's matching guard) — skip
        // querying messages nobody will render.
        $messages = null;

        if ($channel->isTextCapable()) {
            // Newest 50, then reverse so oldest is first in the array
            $messages = $channel->messages()
                ->with(['author:id,username,display_name,avatar_url,status', 'attachments', 'replyTo.author:id,display_name,avatar_url'])
                ->latest()
                ->limit(51)
                ->get();

            $hasMore  = $messages->count() > 50;
            $messages = $messages->take(50)->reverse()->values();
            $messages->each(fn ($m) => $m->setAttribute('reactions', $m->reactionSummary($user->id)));

            $messages = [
                'data'        => $messages,
                'has_more'    => $hasMore,
                'next_cursor' => $hasMore ? $messages->first()?->id : null,
            ];
        }

        return Inertia::render('Channels/Show', [
            'room'          => $room,
            'channel'       => $channel,
            'members'       => $members,
            'custom_emojis' => $room->customEmojis,
            'messages'      => $messages,
        ]);
    }
}
