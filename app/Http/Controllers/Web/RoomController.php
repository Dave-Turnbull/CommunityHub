<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Channel;
use App\Models\Room;
use App\Models\RoomMember;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class RoomController extends Controller
{
    /** Redirect straight to the room's first text channel. */
    public function show(Request $request, Room $room): RedirectResponse
    {
        abort_unless($room->hasMember($request->user()->id), 403);

        $first = $room->channels()->where('type', 'text')->first();

        return $first
            ? redirect("/channels/{$first->id}")
            : redirect('/');
    }

    public function create(): Response
    {
        return Inertia::render('Rooms/Create');
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name'     => ['required', 'string', 'max:100'],
            'icon_url' => ['nullable', 'url'],
        ]);

        $room = Room::create([
            ...$validated,
            'owner_id' => $request->user()->id,
        ]);

        RoomMember::create([
            'room_id'   => $room->id,
            'user_id'   => $request->user()->id,
            'joined_at' => now(),
        ]);

        // Every new room gets a #general text channel and a default voice channel
        $channel = Channel::create([
            'room_id'  => $room->id,
            'name'     => 'general',
            'type'     => 'text',
            'position' => 0,
        ]);

        Channel::create([
            'room_id'  => $room->id,
            'name'     => 'Voice Chat',
            'type'     => 'voice',
            'position' => 1,
        ]);

        return redirect("/channels/{$channel->id}");
    }

    public function join(Request $request, string $code): RedirectResponse
    {
        $room = Room::where('invite_code', $code)->firstOrFail();

        if (! $room->hasMember($request->user()->id)) {
            RoomMember::create([
                'room_id'   => $room->id,
                'user_id'   => $request->user()->id,
                'joined_at' => now(),
            ]);
        }

        $first = $room->channels()->where('type', 'text')->first();

        return redirect($first ? "/channels/{$first->id}" : '/');
    }
}
