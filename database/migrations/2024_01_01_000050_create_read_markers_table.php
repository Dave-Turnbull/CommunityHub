<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One row per (user, channel) or (user, conversation) — same either/or scope
 * shape as messages. Absent row means "never marked": the unread baseline is
 * then the user's join time for that scope. See docs/unread-counts.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('read_markers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('channel_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignUuid('conversation_id')->nullable()->constrained()->cascadeOnDelete();
            $table->timestamp('last_read_at');
            $table->timestamps();

            $table->unique(['user_id', 'channel_id']);
            $table->unique(['user_id', 'conversation_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('read_markers');
    }
};
