<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A channel-scoped override of a role's room-tier permission, for the
 * curated subset in Permission::channelOverridableCases(). Row absence for
 * a (channel, role, permission) triple means "inherit the room-tier
 * resolution for that role" — there is no nullable/tri-state column,
 * row-presence-vs-absence *is* the inherited/overridden distinction, the
 * same mechanism channel_role_visibility already uses for "empty set =
 * visible to all". `allowed` forces that one role's contribution to
 * PermissionChecker::canInChannel()'s OR-union on (true) or off (false) —
 * it does not act as a global deny; a user holding a second, non-overridden
 * role that grants the permission still passes. See
 * PermissionChecker::canInChannel and docs/roles-and-permissions.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('channel_permission_overrides', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('channel_id')->constrained('channels')->cascadeOnDelete();
            $table->foreignUuid('role_id')->constrained('roles')->cascadeOnDelete();
            // Permission enum value (Permission::channelOverridableCases() only,
            // app-validated) — no DB enum, same free-string shape as
            // role_permissions.permission.
            $table->string('permission', 64);
            $table->boolean('allowed');
            $table->timestamps();

            $table->unique(['channel_id', 'role_id', 'permission']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('channel_permission_overrides');
    }
};
