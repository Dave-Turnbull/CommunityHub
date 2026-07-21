<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rooms', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name', 100);
            $table->string('icon_url')->nullable();
            $table->string('banner_url')->nullable();
            $table->foreignUuid('owner_id')->constrained('users')->cascadeOnDelete();
            $table->string('invite_code', 16)->unique();
            $table->timestamps();
        });

        Schema::create('room_members', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('room_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            $table->string('nickname', 32)->nullable();
            $table->timestamp('joined_at');
            $table->timestamps();

            $table->unique(['room_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('room_members');
        Schema::dropIfExists('rooms');
    }
};
