<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Room;
use App\Services\RoomMembershipService;
use App\Services\RoomService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RoomController extends Controller
{
    public function __construct(
        private readonly RoomService $rooms,
        private readonly RoomMembershipService $memberships,
    ) {}

    public function update(Request $request, Room $room): JsonResponse
    {
        $validated = $request->validate([
            'name'     => ['sometimes', 'required', 'string', 'max:100'],
            'icon_url' => ['sometimes', 'nullable', 'url'],
        ]);

        $room = $this->rooms->update($room, $request->user(), $validated);

        return response()->json($room->only(['id', 'name', 'icon_url', 'owner_id', 'invite_code']));
    }

    public function destroy(Request $request, Room $room): JsonResponse
    {
        $this->rooms->delete($room, $request->user());

        return response()->json(['deleted' => true]);
    }

    public function leave(Request $request, Room $room): JsonResponse
    {
        $this->memberships->leave($room, $request->user());

        return response()->json(['left' => true]);
    }
}
