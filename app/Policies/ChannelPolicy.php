<?php

namespace App\Policies;

use App\Models\Channel;
use App\Models\Room;
use App\Models\User;
use App\Support\ChannelTypes\ChannelTypeRegistry;
use App\Support\Permission;
use App\Support\PermissionChecker;

class ChannelPolicy
{
    /**
     * Create a channel in $room — no Channel instance exists yet to
     * authorize against. $type is the requested channels.type value;
     * omitted (null) to ask "can this user create *any* channel type at
     * all" (used by Api\ChannelController::reorder's pre-existing
     * type-blind Gate::authorize call, and internally by
     * creatableTypeKeys()'s per-type probing doesn't use this — it always
     * passes a concrete type).
     *
     * An explicit per-category grant (RoleChannelCategory —
     * PermissionChecker::hasCategoryGrant()) always authorizes, regardless
     * of category — it's an additive, finer-grained alternative to the two
     * bucket permissions below, letting a role be granted rights to create
     * just one category (e.g. 'mod') without the whole
     * ManageChannels/ManageModChannels bucket. Otherwise a 'mod'-category
     * type requires ManageModChannels specifically; every other type falls
     * back to canManageChannels(). Per-category grants don't affect
     * manage() — they're scoped to creation only, same as
     * ManageModChannels's original scope.
     */
    public function create(User $user, Room $room, ?string $type = null): bool
    {
        $category = $type !== null ? ChannelTypeRegistry::for($type)?->category() : null;

        if ($category !== null && PermissionChecker::hasCategoryGrant($user, $category, $room)) {
            return true;
        }

        if ($category === 'mod') {
            return PermissionChecker::can($user, Permission::ManageModChannels, $room);
        }

        return $this->canManageChannels($user, $room);
    }

    /** Update/delete/reorder an existing channel — not category-gated, unlike create(). */
    public function manage(User $user, Channel $channel): bool
    {
        return $this->canManageChannels($user, $channel->room);
    }

    /**
     * Every registered, user-creatable channel type key $user may create in
     * $room — excludes 'conversation' (HybridConversationType is never
     * user-creatable via this policy). Backs
     * Web\ChannelController::show's creatable_channel_types prop.
     *
     * @return string[]
     */
    public function creatableTypeKeys(User $user, Room $room): array
    {
        return array_values(array_filter(
            ChannelTypeRegistry::registeredTypeKeys(),
            fn (string $key) => $key !== 'conversation' && $this->create($user, $room, $key)
        ));
    }

    /**
     * ManageModChannels implies ManageChannels — see its docblock on
     * Permission. Centralized here so manage() and create()'s
     * non-mod branch stay in sync.
     */
    private function canManageChannels(User $user, Room $room): bool
    {
        return PermissionChecker::can($user, Permission::ManageChannels, $room)
            || PermissionChecker::can($user, Permission::ManageModChannels, $room);
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
