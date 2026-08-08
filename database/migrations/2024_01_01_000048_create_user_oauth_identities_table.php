<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A join table, not provider/provider_id columns on `users` — a user can
 * hold both a password AND one or more linked OAuth identities at once
 * (OAuth is additive, never a replacement for password login), and this
 * keeps that pairing out of the core, heavily-`fillable` users table. See
 * App\Models\UserOAuthIdentity, docs/auth-and-sso.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_oauth_identities', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            $table->string('provider'); // 'authentik' today
            $table->string('provider_user_id'); // the OIDC 'sub' claim — stable, unlike email
            $table->string('email')->nullable(); // snapshot at link time, for audit only
            $table->timestamps();

            $table->unique(['provider', 'provider_user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_oauth_identities');
    }
};
