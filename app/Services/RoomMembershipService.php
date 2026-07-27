<?php

namespace App\Services;

use App\Models\Role;
use App\Models\RoleAssignment;
use App\Models\Room;
use App\Models\RoomBan;
use App\Models\RoomMember;
use App\Models\User;
use App\Policies\RoomMemberPolicy;
use Illuminate\Support\Facades\Gate;

/**
 * Kick/ban a room member, per the service-layer convention (docs/
 * service-layer.md): authorization first (RoomMemberPolicy, via Gate), then
 * the operation. Both actions share the same "removing the room's Owner"
 * consequence — see removeMembership()'s owner-transfer handling.
 */
class RoomMembershipService
{
    /** @throws OwnerTransferRequiredException */
    public function kick(Room $room, User $actor, User $target, bool $confirmOwnerTransfer = false): void
    {
        Gate::authorize('kick', [RoomMember::class, $room, $target]);

        $this->removeMembership($room, $actor, $target, $confirmOwnerTransfer);
    }

    /** @throws OwnerTransferRequiredException */
    public function ban(Room $room, User $actor, User $target, bool $confirmOwnerTransfer = false): void
    {
        Gate::authorize('ban', [RoomMember::class, $room, $target]);

        $this->removeMembership($room, $actor, $target, $confirmOwnerTransfer);

        RoomBan::firstOrCreate(
            ['room_id' => $room->id, 'user_id' => $target->id],
            ['banned_by_id' => $actor->id],
        );
    }

    public function unban(Room $room, User $actor, User $target): void
    {
        Gate::authorize('ban', [RoomMember::class, $room, $target]);

        RoomBan::where('room_id', $room->id)->where('user_id', $target->id)->delete();
    }

    /**
     * Removing a room's Owner is only possible for a global Administrator
     * (see Role::effectiveModerationRank — nothing room-scoped ever outranks
     * Owner), and that action necessarily leaves the room without one. Rather
     * than auto-promoting some other member or silently transferring
     * ownership, the acting admin becomes the new Owner themselves — they
     * were the one capable of taking the room's Owner out, so they're the
     * one left holding it, and can hand it off again afterward via the
     * normal room role UI. This requires an explicit
     * confirm_owner_transfer flag rather than happening silently.
     */
    private function removeMembership(Room $room, User $actor, User $target, bool $confirmOwnerTransfer): void
    {
        $ownerRole = $room->roles()->where('is_system', true)->where('is_default', false)->first();
        $targetIsOwner = $ownerRole
            && RoleAssignment::where('role_id', $ownerRole->id)->where('user_id', $target->id)->exists();

        if ($targetIsOwner && ! $confirmOwnerTransfer) {
            throw new OwnerTransferRequiredException();
        }

        if ($targetIsOwner && $confirmOwnerTransfer) {
            $room->update(['owner_id' => $actor->id]);
            RoleAssignment::where('role_id', $ownerRole->id)->where('user_id', $target->id)->delete();
            RoleAssignment::firstOrCreate(['role_id' => $ownerRole->id, 'user_id' => $actor->id]);
        }

        RoleAssignment::whereIn('role_id', $room->roles()->pluck('id'))->where('user_id', $target->id)->delete();
        RoomMember::where('room_id', $room->id)->where('user_id', $target->id)->delete();
    }
}
