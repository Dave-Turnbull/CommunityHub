<?php

use App\Models\Role;
use App\Support\Permission;
use Illuminate\Database\Migrations\Migration;

/**
 * SendMessages/React now gate ordinary channel posting and reactions, which
 * had no Permission::* check at all before — see
 * TextMessageService::authorizeSend / ReactionController. Grants both to
 * every existing room's default Member role so nobody loses the ability to
 * post/react the moment this ships — mirrors
 * 2024_01_01_000031_backfill_comment_vote_permissions.php's exact shape.
 */
return new class extends Migration
{
    public function up(): void
    {
        Role::query()
            ->whereNotNull('room_id')
            ->where('is_default', true)
            ->each(function (Role $role) {
                $role->grant(Permission::SendMessages);
                $role->grant(Permission::React);
            });
    }

    public function down(): void
    {
        // No-op: this is a one-way data backfill, not a reversible structural change.
    }
};
