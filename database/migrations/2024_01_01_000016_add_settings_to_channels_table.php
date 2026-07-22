<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('channels', function (Blueprint $table) {
            // Type-specific config (e.g. a future drawing channel's canvas size),
            // keyed by whatever ChannelType::defaultSettings() a channel's type
            // registers — see app/Support/ChannelTypes. Deliberately a flexible
            // JSON bucket rather than one new column per type, so a new channel
            // type never needs a migration just to store its own settings.
            $table->json('settings')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('channels', function (Blueprint $table) {
            $table->dropColumn('settings');
        });
    }
};
