<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * true (the default, matching every existing room) = no server-role
 * permission ceiling was in effect when this room was created — its
 * room_permission_ceilings/room_channel_category_ceilings rows are empty
 * and irrelevant. false = those tables are the binding cap on every role in
 * this room, snapshotted once at creation time — see
 * Room::snapshotPermissionCeiling. Never recomputed live; reapplying a
 * server role's *current* ceiling to an already-created room is explicitly
 * out of scope — see CLAUDE.md's `## Planned work`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rooms', function (Blueprint $table) {
            $table->boolean('permission_ceiling_unrestricted')->default(true)->after('owner_id');
        });
    }

    public function down(): void
    {
        Schema::table('rooms', function (Blueprint $table) {
            $table->dropColumn('permission_ceiling_unrestricted');
        });
    }
};
