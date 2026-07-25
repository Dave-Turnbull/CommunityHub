<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Channel;
use App\Models\Role;
use App\Services\TextMessageService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
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
        // querying messages nobody will render. The first page comes from the
        // same service the client pages with, so its shape (and its
        // has_older/has_newer window flags) can't drift from /api's.
        $messages = $channel->isTextCapable()
            ? TextMessageService::for($channel)->list($user)
            : null;

        return Inertia::render('Channels/Show', [
            'room'                 => $room,
            'channel'              => $channel,
            'members'              => $members,
            'custom_emojis'        => $room->customEmojis,
            'messages'             => $messages,
            'can_manage_channels'  => Gate::allows('create', [Channel::class, $room]),
            'can_manage_roles'     => Gate::allows('create', [Role::class, $room]),
        ]);
    }
}
