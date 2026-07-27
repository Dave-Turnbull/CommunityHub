<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Room;
use App\Models\User;
use App\Services\OwnerTransferRequiredException;
use App\Services\RoomMembershipService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RoomMemberController extends Controller
{
    public function __construct(private readonly RoomMembershipService $memberships) {}

    public function destroy(Request $request, Room $room, User $user): JsonResponse
    {
        $validated = $request->validate([
            'confirm_owner_transfer' => ['sometimes', 'boolean'],
        ]);

        try {
            $this->memberships->kick($room, $request->user(), $user, $validated['confirm_owner_transfer'] ?? false);
        } catch (OwnerTransferRequiredException $e) {
            return response()->json(['requires_owner_transfer' => true, 'message' => $e->getMessage()], 409);
        }

        return response()->json(['kicked' => true]);
    }

    public function ban(Request $request, Room $room, User $user): JsonResponse
    {
        $validated = $request->validate([
            'confirm_owner_transfer' => ['sometimes', 'boolean'],
        ]);

        try {
            $this->memberships->ban($room, $request->user(), $user, $validated['confirm_owner_transfer'] ?? false);
        } catch (OwnerTransferRequiredException $e) {
            return response()->json(['requires_owner_transfer' => true, 'message' => $e->getMessage()], 409);
        }

        return response()->json(['banned' => true]);
    }

    public function unban(Request $request, Room $room, User $user): JsonResponse
    {
        $this->memberships->unban($room, $request->user(), $user);

        return response()->json(['unbanned' => true]);
    }
}
