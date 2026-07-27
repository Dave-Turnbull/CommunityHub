<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Channel;
use App\Models\Role;
use App\Models\Room;
use App\Support\ChannelTypes\ChannelTypeRegistry;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class RoomController extends Controller
{
    /** Redirect straight to the room's first text-capable channel. */
    public function show(Request $request, Room $room): RedirectResponse
    {
        $user = $request->user();
        abort_unless($room->hasMember($user->id), 403);

        $first = $room->channels()
            ->whereIn('type', ChannelTypeRegistry::typeKeysWithCapability('text.read'))
            ->get()
            ->first(fn (Channel $channel) => $channel->isVisibleTo($user));

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

        Role::seedDefaultsForRoom($room);
        $room->addMember($request->user(), asOwner: true);

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

        $room->addMember($request->user());

        $first = $room->channels()
            ->whereIn('type', ChannelTypeRegistry::typeKeysWithCapability('text.read'))
            ->get()
            ->first(fn (Channel $channel) => $channel->isVisibleTo($request->user()));

        return redirect($first ? "/channels/{$first->id}" : '/');
    }
}
