<?php

use App\Models\Role;
use Illuminate\Database\Migrations\Migration;

/**
 * Ensures the instance-wide global "Member" role (Role::seedGlobalDefaults())
 * exists before any registration relies on it — mirrors
 * 2024_01_01_000017_backfill_room_roles.php's role in giving pre-existing
 * data the same baseline a fresh boot gets. Uses the real model (not raw
 * DB::table) since seedGlobalDefaults() is idempotent and this repo has no
 * objection to a data migration calling application code when the model
 * method itself is the single source of truth for what "seeded" means (see
 * CLAUDE.md's roles-and-permissions convention).
 */
return new class extends Migration
{
    public function up(): void
    {
        Role::seedGlobalDefaults();
    }

    public function down(): void
    {
        // No-op: this is a one-way data backfill, not a reversible structural change.
    }
};
