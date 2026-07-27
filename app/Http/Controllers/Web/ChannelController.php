<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Channel;
use App\Models\Role;
use App\Policies\ChannelPolicy;
use App\Services\TextMessageService;
use App\Support\Permission;
use App\Support\PermissionChecker;
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
        abort_unless($channel->isVisibleTo($user), 403);

        $room->load(['channels', 'customEmojis', 'roles']);
        $room->setRelation('channels', $room->channels->filter(fn (Channel $c) => $c->isVisibleTo($user))->values());

        $members = $room->members()
            ->with('user:id,username,display_name,avatar_url,status,custom_status')
            ->get();

        // A "go to message" direct link (see CLAUDE.md) redirects here with
        // ?message= — Web\MessageController already checked visibility, so
        // this only has to seed the window around it instead of the tail.
        $highlightMessageId = $request->query('message');

        // Non-text-capable channels (voice today; future custom types) have
        // no text chat (see MessageController's matching guard) — skip
        // querying messages nobody will render. The first page comes from the
        // same service the client pages with, so its shape (and its
        // has_older/has_newer window flags) can't drift from /api's.
        $messages = $channel->isTextCapable()
            ? TextMessageService::for($channel)->list($user, around: $highlightMessageId)
            : null;

        $channel->load('visibilityRoles');

        return Inertia::render('Channels/Show', [
            'room'                             => $room,
            'channel'                          => $channel,
            'members'                          => $members,
            'custom_emojis'                    => $room->customEmojis,
            'messages'                         => $messages,
            'highlight_message_id'             => $highlightMessageId,
            'creatable_channel_types'          => app(ChannelPolicy::class)->creatableTypeKeys($user, $room),
            'can_manage_roles'                 => Gate::allows('create', [Role::class, $room]),
            'can_manage_channel_visibility'    => Gate::allows('manageVisibility', $channel),
            // Whether the viewer holds ManageMembers/BanMembers at all — not
            // per-target eligibility, which needs a specific target user and
            // is checked by RoomMemberPolicy::kick/ban when a kick/ban is
            // actually attempted. Drives whether kick/ban affordances render
            // in the member list at all.
            'can_manage_members'               => PermissionChecker::can($user, Permission::ManageMembers, $room),
            'can_ban_members'                  => PermissionChecker::can($user, Permission::BanMembers, $room),
        ]);
    }
}
