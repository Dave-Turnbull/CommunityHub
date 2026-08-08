<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A global role's channel-category ceiling — mirrors role_channel_categories'
 * shape exactly, the channel-creation-category sibling of
 * role_room_permission_ceilings. See PermissionCeiling and
 * docs/roles-and-permissions.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('role_room_channel_category_ceilings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('role_id')->constrained('roles')->cascadeOnDelete();
            // ChannelType::category() value — no DB enum, same free-string
            // shape as role_channel_categories.category.
            $table->string('category', 32);
            $table->timestamps();

            $table->unique(['role_id', 'category']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('role_room_channel_category_ceilings');
    }
};
