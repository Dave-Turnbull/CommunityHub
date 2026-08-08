<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A single-row, instance-wide settings table — see App\Models\InstanceSetting::current(),
 * which lazily creates the row (seeded from config/registration.php's
 * env-driven defaults) the first time it's read. Env vars only govern the
 * initial value; once this row exists, it's the live source of truth and an
 * admin can flip it from Settings without a redeploy.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('instance_settings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->boolean('signup_manual_enabled');
            $table->boolean('signup_email_invite_enabled');
            $table->boolean('signup_oauth_enabled');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('instance_settings');
    }
};
