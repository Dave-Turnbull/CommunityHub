<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Defaults match what was previously hardcoded in getUserMedia's audio
        // constraints (services/webrtc.ts, AudioSettings.tsx), so nobody who
        // hasn't touched these new toggles sees any change.
        Schema::table('voice_device_preferences', function (Blueprint $table) {
            $table->boolean('echo_cancellation')->default(true)->after('send_threshold');
            $table->boolean('noise_suppression')->default(true)->after('echo_cancellation');
            $table->boolean('auto_gain_control')->default(false)->after('noise_suppression');
        });
    }

    public function down(): void
    {
        Schema::table('voice_device_preferences', function (Blueprint $table) {
            $table->dropColumn(['echo_cancellation', 'noise_suppression', 'auto_gain_control']);
        });
    }
};
