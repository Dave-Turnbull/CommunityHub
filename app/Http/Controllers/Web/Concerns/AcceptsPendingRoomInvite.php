<?php

namespace App\Http\Controllers\Web\Concerns;

use App\Models\RoomInvite;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/**
 * Joins the room behind a pending invite (see InviteController) right after
 * auth completes — shared by every controller that can be the last step of
 * a login/register flow (AuthController's password path, AuthentikController's
 * OAuth path).
 */
trait AcceptsPendingRoomInvite
{
    private function acceptPendingInvite(Request $request): ?RedirectResponse
    {
        $token = $request->session()->pull('pending_invite_token');
        if (! $token) {
            return null;
        }

        $invite = RoomInvite::where('token', $token)->first();
        if (! $invite || $invite->isExpired() || $invite->isAccepted()) {
            return null;
        }

        $room  = $invite->accept($request->user());
        $first = $room->channels()->where('type', 'text')->first();

        return redirect($first ? "/channels/{$first->id}" : '/');
    }
}
