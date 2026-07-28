<?php

use App\Models\Role;
use App\Support\Permission;
use Illuminate\Database\Migrations\Migration;

/**
 * Grants the new Comment/Vote permissions to every existing room's default
 * Member role — Role::seedDefaultsForRoom() only grants them for rooms
 * created after this change, so pre-existing rooms need the same backfill,
 * mirroring 2024_01_01_000017_backfill_room_roles.php's precedent.
 */
return new class extends Migration
{
    public function up(): void
    {
        Role::query()
            ->whereNotNull('room_id')
            ->where('is_default', true)
            ->each(function (Role $role) {
                $role->grant(Permission::Comment);
                $role->grant(Permission::Vote);
            });
    }

    public function down(): void
    {
        // No-op: this is a one-way data backfill, not a reversible structural change.
    }
};
