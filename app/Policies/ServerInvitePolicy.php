<?php

namespace App\Policies;

use App\Models\User;
use App\Support\Permission;
use App\Support\PermissionChecker;

class ServerInvitePolicy
{
    public function create(User $user): bool
    {
        return PermissionChecker::can($user, Permission::InviteServer);
    }
}
