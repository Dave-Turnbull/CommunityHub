<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 0-100, a percentage of the same 0..1 level scale services/audioLevel.ts
        // computes for the mic meter. 0 (the default) means "voice activation off,
        // always transmit" — the pre-existing behavior, so nobody who hasn't
        // touched the new sensitivity slider sees any change.
        Schema::table('voice_device_preferences', function (Blueprint $table) {
            $table->unsignedTinyInteger('send_threshold')->default(0)->after('output_device_id');
        });
    }

    public function down(): void
    {
        Schema::table('voice_device_preferences', function (Blueprint $table) {
            $table->dropColumn('send_threshold');
        });
    }
};
