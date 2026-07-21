<?php

namespace App\Http\Middleware;

use App\Models\Conversation;
use App\Models\Room;
use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    protected $rootView = 'app';

    /**
     * Props shared with every Inertia page.
     * Rooms + conversations power the top room bar and the left sidebar everywhere.
     */
    public function share(Request $request): array
    {
        $user = $request->user();

        return array_merge(parent::share($request), [
            'appName' => config('app.name'),

            'auth' => [
                'user' => $user?->only([
                    'id', 'username', 'display_name', 'avatar_url',
                    'banner_url', 'bio', 'status', 'custom_status',
                ]),
            ],

            'rooms' => fn () => $user
                ? Room::whereHas('members', fn ($q) => $q->where('user_id', $user->id))
                        ->get(['id', 'name', 'icon_url', 'owner_id', 'invite_code'])
                : [],

            'conversations' => fn () => $user
                ? Conversation::whereHas('participants', fn ($q) => $q->where('user_id', $user->id))
                        ->with(['participants.user:id,username,display_name,avatar_url,status', 'lastMessage'])
                        ->latest('updated_at')
                        ->limit(50)
                        ->get()
                        ->map(function ($c) {
                            $c->unread_count = 0;   // TODO: read receipts
                            return $c;
                        })
                : [],

            'flash' => [
                'success' => $request->session()->get('success'),
                'error'   => $request->session()->get('error'),
            ],
        ]);
    }
}
