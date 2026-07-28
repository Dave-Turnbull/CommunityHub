<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Schema only — no controller/route/UI yet, and comment_reply's producer
 * (TextMessageService::notifyParentAuthor) does not check it. Reserved for
 * a later pass to wire in, same "declared but not yet enforced" convention
 * as Permission::ManageMessages/ManageEmojis. See docs/comments-and-voting.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notification_mutes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('message_id')->constrained()->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['user_id', 'message_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_mutes');
    }
};
