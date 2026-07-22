<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Gives every already-existing room an Owner role (assigned to its owner_id)
 * and a default Member role (assigned to every existing room_members row),
 * so rooms created before the RBAC tables existed behave identically to
 * ones created after — see Role::seedDefaultsForRoom()/Room::addMember(),
 * which is what every room-creation/join path calls going forward.
 *
 * Uses raw DB::table(...), not Eloquent models, since a migration shouldn't
 * be coupled to app model code that will keep changing shape after this
 * runs. Guarded with an existence check per room so re-running migrations
 * against a live dev/prod volume (this repo's migrations run automatically
 * on every boot, see CLAUDE.md trap #28's territory) can't double-seed.
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        DB::table('rooms')->orderBy('id')->each(function (object $room) use ($now) {
            if (DB::table('roles')->where('room_id', $room->id)->exists()) {
                return;
            }

            $ownerRoleId = (string) Str::orderedUuid();
            $memberRoleId = (string) Str::orderedUuid();

            DB::table('roles')->insert([
                [
                    'id' => $ownerRoleId,
                    'room_id' => $room->id,
                    'name' => 'Owner',
                    'position' => 100,
                    'is_default' => false,
                    'is_system' => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ],
                [
                    'id' => $memberRoleId,
                    'room_id' => $room->id,
                    'name' => 'Member',
                    'position' => 0,
                    'is_default' => true,
                    'is_system' => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ],
            ]);

            DB::table('role_permissions')->insert([
                'id' => (string) Str::orderedUuid(),
                'role_id' => $ownerRoleId,
                'permission' => 'administrator',
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $assignments = [];

            $assignments[] = [
                'id' => (string) Str::orderedUuid(),
                'role_id' => $ownerRoleId,
                'user_id' => $room->owner_id,
                'assigned_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ];

            $memberUserIds = DB::table('room_members')
                ->where('room_id', $room->id)
                ->pluck('user_id');

            foreach ($memberUserIds as $userId) {
                $assignments[] = [
                    'id' => (string) Str::orderedUuid(),
                    'role_id' => $memberRoleId,
                    'user_id' => $userId,
                    'assigned_at' => $now,
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }

            // The owner may or may not also be in room_members (existing rows
            // always add the creator as a member too, but don't assume it) —
            // dedupe on (role_id, user_id) since role_assignments is unique there.
            $seen = [];
            $deduped = [];
            foreach ($assignments as $row) {
                $key = $row['role_id'].'|'.$row['user_id'];
                if (isset($seen[$key])) {
                    continue;
                }
                $seen[$key] = true;
                $deduped[] = $row;
            }

            DB::table('role_assignments')->insert($deduped);
        });
    }

    public function down(): void
    {
        // No-op: this is a one-way data backfill, not a reversible structural change.
    }
};
