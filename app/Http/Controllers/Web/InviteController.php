<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\RoomInvite;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class InviteController extends Controller
{
    public function show(Request $request, string $token): Response|RedirectResponse
    {
        $invite = RoomInvite::where('token', $token)->with('room', 'invitedBy')->first();

        if (! $invite || $invite->isExpired() || $invite->isAccepted()) {
            return Inertia::render('Invite/Accept', ['invalid' => true]);
        }

        if ($user = $request->user()) {
            $room = $invite->accept($user);

            $first = $room->channels()->where('type', 'text')->first();

            return redirect($first ? "/channels/{$first->id}" : '/');
        }

        $request->session()->put('pending_invite_token', $token);

        return Inertia::render('Invite/Accept', [
            'invalid'     => false,
            'room'        => $invite->room->only(['id', 'name', 'icon_url']),
            'inviter'     => $invite->invitedBy->only(['display_name']),
            'email'       => $invite->email,
            'has_account' => User::where('email', $invite->email)->exists(),
        ]);
    }
}
