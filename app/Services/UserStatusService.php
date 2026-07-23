<?php

namespace App\Services;

use App\Events\UserStatusChanged;
use App\Models\RecentCustomStatus;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Status is always self-service — no capability/permission check beyond "is
 * this the authenticated user," which every call site already guarantees by
 * construction (always called with $request->user()). See
 * App\Support\Capabilities\StatusFeature for why this isn't gated via
 * ChannelTypeRegistry::hasCapability() like a channel-scoped operation would
 * be — status isn't scoped to any Channel/Conversation row.
 */
class UserStatusService
{
    /**
     * `status` is one of 5 values: online/idle/dnd/offline/custom.
     * custom_status/custom_status_color only ever hold something when status
     * is 'custom' — any other status clears both, so the three columns can
     * never disagree about whether a custom status is active.
     */
    public function setStatus(User $user, string $status, ?string $customStatus = null, ?string $customStatusColor = null): void
    {
        $isCustom = $status === 'custom';

        $user->update([
            'status'              => $status,
            'custom_status'       => $isCustom ? $customStatus : null,
            'custom_status_color' => $isCustom ? $customStatusColor : null,
        ]);

        if ($isCustom) {
            $this->recordRecentCustomStatus($user, $customStatus, $customStatusColor);
        }

        // Every already-connected tab has its own usePresence entry for this
        // user, seeded once at connection time — without this broadcast a
        // status change sits invisible to everyone, including the user's own
        // other tabs, until they reconnect.
        broadcast(new UserStatusChanged($user->id, $user->status, $user->custom_status, $user->custom_status_color));
    }

    /** @return Collection<int, RecentCustomStatus> */
    public function recentCustomStatuses(User $user): Collection
    {
        return RecentCustomStatus::recentForUser($user->id);
    }

    private function recordRecentCustomStatus(User $user, string $text, ?string $color): void
    {
        // Keyed on (user_id, text) only — text is a recent entry's identity;
        // reapplying the same text with a different color overwrites the
        // stored color rather than creating a second entry for that text.
        RecentCustomStatus::updateOrCreate(
            ['user_id' => $user->id, 'text' => $text],
            ['color' => $color, 'updated_at' => now()],
        );

        // Cap at 3 — whatever's beyond the 3 most-recently-touched rows for
        // this user gets pruned every time a new one is recorded. Tiebreak
        // on id (a time-ordered UUIDv7) since several statuses recorded
        // within the same second would otherwise sort arbitrarily.
        $keepIds = RecentCustomStatus::where('user_id', $user->id)
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->limit(3)
            ->pluck('id');

        RecentCustomStatus::where('user_id', $user->id)->whereNotIn('id', $keepIds)->delete();
    }
}
