<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A room's snapshotted permission ceiling — only meaningful when the owning
 * room's permission_ceiling_unrestricted is false. Populated once, at room
 * creation, from the union of the creator's global roles' room permission
 * ceilings — see Room::snapshotPermissionCeiling.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('room_permission_ceilings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('room_id')->constrained('rooms')->cascadeOnDelete();
            // Permission enum value (room-tier cases only) — no DB enum, same
            // free-string shape as role_permissions.permission.
            $table->string('permission', 64);
            $table->timestamps();

            $table->unique(['room_id', 'permission']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('room_permission_ceilings');
    }
};
