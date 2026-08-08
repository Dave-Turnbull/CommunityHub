<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Only meaningful for a global role (room_id IS NULL). false (the default,
 * matching every existing role) = this server role imposes no room
 * permission ceiling — rooms created by its holders are unrestricted, same
 * as today. true = the role's role_room_permission_ceilings/
 * role_room_channel_category_ceilings rows are the binding cap snapshotted
 * onto any room created by a holder — see Room::snapshotPermissionCeiling
 * and docs/roles-and-permissions.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('roles', function (Blueprint $table) {
            $table->boolean('has_room_permission_ceiling')->default(false)->after('is_system');
        });
    }

    public function down(): void
    {
        Schema::table('roles', function (Blueprint $table) {
            $table->dropColumn('has_room_permission_ceiling');
        });
    }
};
