<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('messages', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('channel_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignUuid('conversation_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignUuid('author_id')->constrained('users')->cascadeOnDelete();
            $table->text('content')->nullable();
            $table->string('type', 16)->default('text');
            $table->boolean('is_edited')->default(false);
            $table->boolean('is_pinned')->default(false);
            $table->uuid('reply_to_id')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['channel_id', 'created_at']);
            $table->index(['conversation_id', 'created_at']);
        });

        Schema::create('attachments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('message_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('url');
            $table->string('filename');
            $table->string('mime_type', 100);
            $table->unsignedBigInteger('size_bytes');
            $table->unsignedSmallInteger('width')->nullable();
            $table->unsignedSmallInteger('height')->nullable();
            $table->timestamps();
        });

        Schema::create('reactions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('message_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
            $table->string('emoji', 64);
            $table->timestamps();

            $table->unique(['message_id', 'user_id', 'emoji']);
            $table->index(['message_id', 'emoji']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('reactions');
        Schema::dropIfExists('attachments');
        Schema::dropIfExists('messages');
    }
};
