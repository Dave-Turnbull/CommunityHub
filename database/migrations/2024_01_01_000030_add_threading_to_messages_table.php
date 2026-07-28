<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * "Exactly one of channel_id/conversation_id/parent_message_id" is
     * enforced at the app layer (Message::booted(), see the model), not a
     * DB-level CHECK constraint — sqlite (the phpunit test driver, see
     * phpunit.xml) has never supported adding CHECK constraints via ALTER
     * TABLE, only at CREATE TABLE time, and this table already existed.
     * Same app-level-only precedent as the original channel_id/
     * conversation_id exclusivity, which also has no DB constraint.
     */
    public function up(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->foreignUuid('parent_message_id')->nullable()->after('reply_to_id')->constrained('messages')->nullOnDelete();
            $table->foreignUuid('root_message_id')->nullable()->after('parent_message_id')->constrained('messages')->nullOnDelete();
            $table->unsignedSmallInteger('depth')->default(0)->after('root_message_id');
            $table->boolean('is_tombstoned')->default(false)->after('is_pinned');

            $table->index(['parent_message_id', 'created_at']);
            $table->index(['root_message_id', 'deleted_at']);
        });
    }

    public function down(): void
    {
        Schema::table('messages', function (Blueprint $table) {
            $table->dropConstrainedForeignId('parent_message_id');
            $table->dropConstrainedForeignId('root_message_id');
            $table->dropColumn(['depth', 'is_tombstoned']);
        });
    }
};
