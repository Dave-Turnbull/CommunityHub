<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A message's optional headline — used today by a forum post (the
 * "showcased" thing a comment thread hangs off, see docs/comments-and-voting.md),
 * null for every ordinary channel/conversation message and every comment.
 * Deliberately a plain column on Message rather than a forum-specific table:
 * a title is a property of the message itself, and any future ChannelType
 * that wants a headline gets it for free.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->string('title', 300)->nullable()->after('content');
        });
    }

    public function down(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->dropColumn('title');
        });
    }
};
