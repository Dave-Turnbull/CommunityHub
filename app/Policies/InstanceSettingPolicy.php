<?php

namespace App\Policies;

use App\Models\User;
use App\Support\Permission;
use App\Support\PermissionChecker;

/**
 * Instance-wide settings (today: the three signup-path toggles — see
 * App\Models\InstanceSetting) are gated by the same ManageRoles-at-global-tier
 * check as managing global roles (Api\RoleController::indexGlobal,
 * SettingsController's can_manage_global_roles prop) — whoever can shape the
 * server's role structure is the same "server admin" audience who should be
 * able to open or close signup, not a separate permission.
 */
class InstanceSettingPolicy
{
    public function manage(User $user): bool
    {
        return PermissionChecker::can($user, Permission::ManageRoles, null);
    }
}
