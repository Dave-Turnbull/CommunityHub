<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A global role's room-permission ceiling — mirrors role_permissions'
 * shape exactly. Only meaningful when the owning role's
 * has_room_permission_ceiling is true; rows here are the room-tier
 * permissions rooms created by that role's holders are ever allowed to
 * grant, down to the room's own Owner. See PermissionCeiling and
 * docs/roles-and-permissions.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('role_room_permission_ceilings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('role_id')->constrained('roles')->cascadeOnDelete();
            // Permission enum value (room-tier cases only, app-validated) — no
            // DB enum, same free-string shape as role_permissions.permission.
            $table->string('permission', 64);
            $table->timestamps();

            $table->unique(['role_id', 'permission']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('role_room_permission_ceilings');
    }
};
