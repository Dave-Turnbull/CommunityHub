<?php

namespace App\Policies;

use App\Models\ServerInvite;
use App\Models\User;
use App\Support\Permission;
use App\Support\PermissionChecker;

class ServerInvitePolicy
{
    public function create(User $user): bool
    {
        return PermissionChecker::can($user, Permission::InviteServer);
    }

    public function viewAny(User $user): bool
    {
        return $this->create($user);
    }

    public function delete(User $user, ServerInvite $invite): bool
    {
        return $this->create($user);
    }
}
