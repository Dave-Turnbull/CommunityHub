<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('voice_device_preferences', function (Blueprint $table) {
            // Null means "Off" — no hang-time enforcement, close_threshold_gap
            // alone decides when the gate closes, same as before this column
            // existed. 500-5000 (step 500) when set — see
            // services/voiceActivation.ts's createHangTimeGate: if the level
            // hasn't reached the open threshold again within this many ms
            // (reset on every fresh hit), the gate force-closes even if still
            // above the close threshold — handles continuous background noise
            // that would otherwise keep a level-only gate open forever.
            $table->unsignedSmallInteger('close_threshold_timeout_ms')->nullable()->default(2000)->after('close_threshold_gap');
        });

        // Defaults changed after the fact (product decision, not a data-model
        // fix) — new rows now default to "Medium" gap and AGC on, rather than
        // "Off"/off. See docs/voice.md.
        Schema::table('voice_device_preferences', function (Blueprint $table) {
            $table->unsignedTinyInteger('close_threshold_gap')->default(20)->change();
            $table->boolean('auto_gain_control')->default(true)->change();
        });
    }

    public function down(): void
    {
        Schema::table('voice_device_preferences', function (Blueprint $table) {
            $table->dropColumn('close_threshold_timeout_ms');
            $table->unsignedTinyInteger('close_threshold_gap')->default(0)->change();
            $table->boolean('auto_gain_control')->default(false)->change();
        });
    }
};
