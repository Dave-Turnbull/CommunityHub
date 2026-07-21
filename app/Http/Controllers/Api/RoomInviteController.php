<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\RoomInviteMail;
use App\Models\Notification;
use App\Models\NotificationPreference;
use App\Models\Room;
use App\Models\RoomInvite;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Mail;

class RoomInviteController extends Controller
{
    public function index(Request $request, Room $room): JsonResponse
    {
        Gate::authorize('invite', $room);

        $invites = $room->invites()
            ->whereNull('accepted_at')
            ->where('expires_at', '>', now())
            ->with('invitedBy:id,username,display_name,avatar_url')
            ->latest()
            ->get();

        return response()->json($invites);
    }

    public function store(Request $request, Room $room): JsonResponse
    {
        Gate::authorize('invite', $room);

        $validated = $request->validate([
            'email' => ['required', 'email'],
        ]);

        $email = $validated['email'];

        $existingMember = User::where('email', $email)->first();
        if ($existingMember && $room->hasMember($existingMember->id)) {
            return response()->json(['message' => 'This person is already a member of the room.'], 422);
        }

        $invite = $room->invites()
            ->where('email', $email)
            ->whereNull('accepted_at')
            ->where('expires_at', '>', now())
            ->first();

        if ($invite) {
            $invite->update(['expires_at' => now()->addDays(7)]);
        } else {
            $invite = $room->invites()->create([
                'email'         => $email,
                'invited_by_id' => $request->user()->id,
            ]);
        }

        // An invited email might not belong to an account yet — in that case
        // there's no NotificationPreference to check (or in-app channel to
        // reach), so email is the only option and always goes out.
        $sendEmail = true;

        if ($existingMember) {
            Notification::notify($existingMember->id, 'room_invite', [
                'room_id'      => $room->id,
                'room_name'    => $room->name,
                'invited_by'   => $request->user()->display_name,
                'invite_token' => $invite->token,
            ]);

            $sendEmail = NotificationPreference::for($existingMember->id, 'room_invite')['email'];
        }

        if ($sendEmail) {
            Mail::to($email)->send(new RoomInviteMail($invite));
        }

        return response()->json($invite->load('invitedBy:id,username,display_name,avatar_url'), 201);
    }

    public function destroy(Request $request, RoomInvite $invite): JsonResponse
    {
        Gate::authorize('invite', $invite->room);

        $invite->delete();

        return response()->json(['message' => 'Invite revoked.']);
    }
}
