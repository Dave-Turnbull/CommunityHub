<?php

use App\Models\Role;
use App\Support\Permission;
use Illuminate\Database\Migrations\Migration;

/**
 * CreateRoom now gates Web\RoomController::store, which had no gate at all
 * before — every user could create a room. React is room-scoped but also
 * checked with $room = null for a conversation-scoped message (no room to
 * resolve), so reacting in a DM needs the global grant too — see
 * ReactionController. Both grant to the existing global Member role so
 * nobody loses either ability the moment this ships;
 * Role::seedGlobalDefaults() grants both going forward for new instances.
 */
return new class extends Migration
{
    public function up(): void
    {
        Role::query()
            ->whereNull('room_id')
            ->where('is_default', true)
            ->each(function (Role $role) {
                $role->grant(Permission::CreateRoom);
                $role->grant(Permission::React);
            });
    }

    public function down(): void
    {
        // No-op: this is a one-way data backfill, not a reversible structural change.
    }
};
