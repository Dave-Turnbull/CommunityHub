<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('channels', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('room_id')->constrained()->cascadeOnDelete();
            $table->string('name', 100);
            $table->string('type', 16)->default('text');
            $table->string('topic', 1024)->nullable();
            $table->unsignedSmallInteger('position')->default(0);
            $table->boolean('is_nsfw')->default(false);
            $table->unsignedSmallInteger('slow_mode_seconds')->default(0);
            $table->uuid('last_message_id')->nullable();
            $table->timestamps();

            $table->index(['room_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('channels');
    }
};
