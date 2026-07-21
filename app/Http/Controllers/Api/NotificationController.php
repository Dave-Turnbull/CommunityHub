<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\NotificationPreference;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    private const PAGE_SIZE = 30;

    public function index(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        // A category the user has since disabled shouldn't surface old
        // notifications either — not just suppress new ones (see
        // NotificationPreference::IN_APP_LOCKED for the one category this
        // can never hide entirely).
        $enabledCategories = collect(array_keys(NotificationPreference::DEFAULTS))
            ->filter(fn ($category) => NotificationPreference::for($userId, $category)['in_app']);

        $notifications = $request->user()->appNotifications()
            ->whereIn('type', $enabledCategories)
            ->latest()
            ->limit(self::PAGE_SIZE)
            ->get();

        return response()->json($notifications);
    }

    public function markRead(Request $request, Notification $notification): JsonResponse
    {
        abort_unless($notification->user_id === $request->user()->id, 403);

        $notification->update(['read_at' => now()]);

        return response()->json($notification);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $request->user()->appNotifications()
            ->whereNull('read_at')
            ->update(['read_at' => now()]);

        return response()->json(['marked' => true]);
    }
}
