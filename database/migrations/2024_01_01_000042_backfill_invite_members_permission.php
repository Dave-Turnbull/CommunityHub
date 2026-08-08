<?php

use App\Models\Role;
use App\Support\Permission;
use Illuminate\Database\Migrations\Migration;

/**
 * InviteMembers is split out of ManageMembers (which now means "kick" only)
 * — see Permission::InviteMembers's docblock. Every room role that already
 * held ManageMembers needs InviteMembers too, or existing moderators would
 * silently lose invite rights the moment this ships.
 */
return new class extends Migration
{
    public function up(): void
    {
        Role::query()
            ->whereNotNull('room_id')
            ->whereHas('rolePermissions', fn ($q) => $q->where('permission', Permission::ManageMembers->value))
            ->each(fn (Role $role) => $role->grant(Permission::InviteMembers));
    }

    public function down(): void
    {
        // No-op: this is a one-way data backfill, not a reversible structural change.
    }
};
