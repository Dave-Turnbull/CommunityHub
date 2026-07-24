<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The gap subtracted from send_threshold to get the "close" threshold
        // (hysteresis) — 0 (default, "Off") means no gap, i.e. the original
        // single-threshold behavior. UI-only values: 0/10/20/30, see
        // AudioSettings.tsx's Close threshold select.
        Schema::table('voice_device_preferences', function (Blueprint $table) {
            $table->unsignedTinyInteger('close_threshold_gap')->default(0)->after('send_threshold');
        });
    }

    public function down(): void
    {
        Schema::table('voice_device_preferences', function (Blueprint $table) {
            $table->dropColumn('close_threshold_gap');
        });
    }
};
