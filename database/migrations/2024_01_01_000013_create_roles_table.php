<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            // null room_id = global/instance-wide scope, applies in every room — see PermissionChecker.
            $table->foreignUuid('room_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('name', 50);
            $table->unsignedSmallInteger('position')->default(0);
            // Auto-assigned to every new member of this scope (the "@everyone" baseline).
            $table->boolean('is_default')->default(false);
            // Seeded Owner/Member roles — undeletable/unrenamable via the API, see RolePolicy.
            $table->boolean('is_system')->default(false);
            $table->timestamps();

            $table->index(['room_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('roles');
    }
};
