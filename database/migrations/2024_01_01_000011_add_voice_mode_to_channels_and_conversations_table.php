<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // auto | direct | relay — how a voice-capable channel/conversation's
        // call should behave: prefer P2P with TURN fallback, force direct
        // P2P only, or force TURN relay only. Applies to every participant
        // in that channel/conversation's call equally — this is a property
        // of the call, not a per-user preference.
        Schema::table('channels', function (Blueprint $table) {
            $table->string('voice_mode', 8)->default('auto');
        });

        Schema::table('conversations', function (Blueprint $table) {
            $table->string('voice_mode', 8)->default('auto');
        });
    }

    public function down(): void
    {
        Schema::table('channels', function (Blueprint $table) {
            $table->dropColumn('voice_mode');
        });

        Schema::table('conversations', function (Blueprint $table) {
            $table->dropColumn('voice_mode');
        });
    }
};
