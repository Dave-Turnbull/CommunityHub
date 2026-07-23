<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Capped at 3 per user by UserStatusService. Unique on (user_id, text)
        // only, not color — the status text is the identity of a recent
        // entry; reapplying the same text with a different color overwrites
        // the stored color (via updateOrCreate) rather than creating a
        // second entry for the same text.
        Schema::create('recent_custom_statuses', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            $table->string('text', 128);
            $table->string('color', 7);
            $table->timestamps();

            $table->unique(['user_id', 'text']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('recent_custom_statuses');
    }
};
