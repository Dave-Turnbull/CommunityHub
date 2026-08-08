<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Server-level invites — distinct from room_invites, which grant room
 * membership to an existing/new account. A server invite instead gates
 * *account creation itself* when the email-invite signup path is the only
 * one open (see App\Models\InstanceSetting, AuthController::register). See
 * docs/conversations-and-invites.md's "Server invites" section.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('server_invites', function (Blueprint $table) {
            $table->uuid('id')->primary();
            // Nullable — an open, shareable link isn't tied to one address;
            // when set, only that email may register with this token (see
            // ServerInviteService::validateToken).
            $table->string('email')->nullable();
            $table->foreignUuid('invited_by_id')->constrained('users')->cascadeOnDelete();
            $table->string('token', 64)->unique();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('expires_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('server_invites');
    }
};
