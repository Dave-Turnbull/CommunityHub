<?php

namespace App\Services;

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
    }

    public function setCustomStatus(User $user, ?string $customStatus): void
    {
        $user->update(['custom_status' => $customStatus]);
    }
}
