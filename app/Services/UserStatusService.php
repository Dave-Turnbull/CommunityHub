<?php

namespace App\Services;

use App\Events\UserStatusChanged;
use App\Models\User;

/**
 * Status is always self-service — no capability/permission check beyond "is
 * this the authenticated user," which every call site already guarantees by
 * construction (always called with $request->user()). Consolidates the
 * three previously-inline ->update(['status' => ...]) call sites
 * (AuthController::login/register/logout) plus SettingsController::update's
 * status/custom_status fields.
 */
class UserStatusService
{
    public function setStatus(User $user, string $status): void
    {
        $user->update(['status' => $status]);

        // Every already-connected tab has its own usePresence entry for this
        // user seeded once at their own connection time (.here()/.joining())
        // — nothing re-fetches it afterward, so without this broadcast a
        // status change (Settings, or the forced online/offline on login/
        // logout) sits invisible to everyone, including the user's own other
        // tabs, until they reconnect (e.g. a full page reload).
        broadcast(new UserStatusChanged($user->id, $status));
    }

    public function setCustomStatus(User $user, ?string $customStatus): void
    {
        $user->update(['custom_status' => $customStatus]);
    }
}
