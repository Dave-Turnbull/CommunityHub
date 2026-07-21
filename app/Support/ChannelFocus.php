<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;

/**
 * Tracks, per user/channel, whether the user currently has the channel open
 * (via an explicit focus/blur heartbeat from the frontend — see
 * useChannelFocus.ts) — so a channel message can skip notifying someone
 * who's looking right at it.
 */
class ChannelFocus
{
    /** Also the heartbeat interval on the frontend, refreshed while mounted. */
    private const FOCUS_TTL_SECONDS = 30;

    public static function focus(string $userId, string $channelId): void
    {
        Cache::put(self::focusKey($userId, $channelId), true, self::FOCUS_TTL_SECONDS);
    }

    public static function blur(string $userId, string $channelId): void
    {
        Cache::forget(self::focusKey($userId, $channelId));
    }

    public static function isFocused(string $userId, string $channelId): bool
    {
        return Cache::has(self::focusKey($userId, $channelId));
    }

    private static function focusKey(string $userId, string $channelId): string
    {
        return "channel-focus:{$userId}:{$channelId}";
    }
}
