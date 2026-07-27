<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('role_channel_categories', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('role_id')->constrained()->cascadeOnDelete();
            // ChannelType::category() value — no DB enum, same free-string
            // shape as channels.type/role_permissions.permission.
            $table->string('category', 32);
            $table->timestamps();

            $table->unique(['role_id', 'category']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('role_channel_categories');
    }
};
