<?php

namespace App\Policies;

use App\Models\Channel;
use App\Models\Room;
use App\Models\User;
use App\Support\Permission;
use App\Support\PermissionChecker;

class ChannelPolicy
{
    /** Create a channel in $room — no Channel instance exists yet to authorize against. */
    public function create(User $user, Room $room): bool
    {
        return PermissionChecker::can($user, Permission::ManageChannels, $room);
    }

    /** Update/delete/reorder an existing channel. */
    public function manage(User $user, Channel $channel): bool
    {
        return PermissionChecker::can($user, Permission::ManageChannels, $channel->room);
    }

    /**
     * Set a channel's visibility_role_ids — a separate ability from
     * ManageChannels (see Permission::ManageChannelVisibility) so "who can
     * restrict a channel" can be delegated independently of full channel
     * CRUD. The hierarchy guard preventing a lower-ranked role from
     * excluding a higher-ranked one lives in Api\ChannelController::update,
     * not here, since it depends on the specific role ids being submitted,
     * not just the channel.
     */
    public function manageVisibility(User $user, Channel $channel): bool
    {
        return PermissionChecker::can($user, Permission::ManageChannelVisibility, $channel->room);
    }
}
