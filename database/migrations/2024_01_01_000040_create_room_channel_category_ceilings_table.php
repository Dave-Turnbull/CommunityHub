<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A room's snapshotted channel-category ceiling — the channel-creation-
 * category sibling of room_permission_ceilings. See
 * Room::snapshotPermissionCeiling.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('room_channel_category_ceilings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('room_id')->constrained('rooms')->cascadeOnDelete();
            // ChannelType::category() value — no DB enum, same free-string
            // shape as role_channel_categories.category.
            $table->string('category', 32);
            $table->timestamps();

            $table->unique(['room_id', 'category']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('room_channel_category_ceilings');
    }
};
