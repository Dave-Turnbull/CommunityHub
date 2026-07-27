<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Attachments move from a directly-servable public URL to a private disk
// path served only through an authorized route (see App\Http\Controllers\
// Web\AttachmentController) — `url` is now computed (Attachment::url()), not
// stored. `uploader_id` covers the window between upload and being attached
// to a sent message (message_id still null), where there's no channel/
// conversation yet to check — only the uploader may view it then.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attachments', function (Blueprint $table) {
            $table->dropColumn('url');
            // Nullable so this doesn't choke on rows from before this migration
            // (their file physically lived on the old public disk, at a path
            // this schema change has no way to recover — see the accompanying
            // commit/PR notes for cleanup instead of a data migration here).
            $table->string('path')->nullable()->after('message_id');
            $table->foreignUuid('uploader_id')->nullable()->after('path')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('attachments', function (Blueprint $table) {
            $table->dropForeign(['uploader_id']);
            $table->dropColumn(['uploader_id', 'path']);
            $table->string('url')->default('');
        });
    }
};
