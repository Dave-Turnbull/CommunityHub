<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Keyed by (user_id, client_id) rather than just user_id — mic/speaker
        // choice is per browser install, not per account, since the same user
        // picks different devices on their laptop vs desktop. client_id is a
        // crypto.randomUUID() the frontend generates once and persists in
        // localStorage (see resources/js/services/clientId.ts). Null device
        // ids are legitimate ("use the browser's current default"), so unlike
        // NotificationPreference there's no DEFAULTS fallback to resolve to.
        Schema::create('voice_device_preferences', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            $table->string('client_id', 64);
            $table->string('input_device_id')->nullable();
            $table->string('output_device_id')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'client_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('voice_device_preferences');
    }
};
