<?php

namespace App\Models;

use App\Support\Permission;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Role extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['room_id', 'name', 'position', 'is_default', 'is_system'];

    protected function casts(): array
    {
        return [
            'position'   => 'integer',
            'is_default' => 'boolean',
            'is_system'  => 'boolean',
        ];
    }

    public function room(): BelongsTo             { return $this->belongsTo(Room::class); }
    public function rolePermissions(): HasMany     { return $this->hasMany(RolePermission::class); }
    public function assignments(): HasMany         { return $this->hasMany(RoleAssignment::class); }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'role_assignments');
    }

    public function isGlobal(): bool { return $this->room_id === null; }

    public function hasPermission(Permission $permission): bool
    {
        return $this->rolePermissions->contains('permission', $permission);
    }

    public function grant(Permission $permission): void
    {
        $this->rolePermissions()->firstOrCreate(['permission' => $permission->value]);
    }

    /**
     * Where this role sits in its room's hierarchy — Owner (is_system,
     * not default) is pinned to the top regardless of its stored `position`,
     * Member (is_default) is pinned to the bottom, and custom roles rank by
     * `position` in between. Pinning via these flags rather than raw
     * `position` comparison means Owner/Member never need renumbering as
     * custom roles are added/reordered around them.
     */
    public function rank(): float
    {
        if ($this->is_system && ! $this->is_default) {
            return INF;
        }

        if ($this->is_default) {
            return -INF;
        }

        return (float) $this->position;
    }

    /** Strictly higher in the hierarchy — equal rank (including self) never outranks. */
    public function outranks(self $other): bool
    {
        return $this->rank() > $other->rank();
    }

    /**
     * Higher in the hierarchy, or the exact same rank (including $other
     * being this role itself). Deliberately looser than outranks() —
     * reordering a role relative to itself or a peer doesn't grant it
     * anything new the way editing its permissions/membership would, so
     * Api\RoleController::reorder uses this instead of outranks() to let a
     * role holder include their own role in a reorder payload. Don't use
     * this for anything that changes a role's capabilities.
     */
    public function outranksOrEquals(self $other): bool
    {
        return $this->rank() >= $other->rank();
    }

    /**
     * The highest-ranked room-scoped role $user holds in $room, or null if
     * they hold none there. A user can hold multiple roles (room-scoped and
     * global at once) — this considers only this room's roles, since
     * hierarchy is a per-room concept; see RolePolicy::manage and CLAUDE.md's
     * "Roles & permissions" convention for how this gates role management
     * (and, later, per-user moderation actions) by rank.
     */
    public static function highestRoleFor(User $user, Room $room): ?self
    {
        return $room->roles()
            ->whereHas('assignments', fn ($q) => $q->where('user_id', $user->id))
            ->get()
            ->sortByDesc(fn (self $role) => $role->rank())
            ->first();
    }

    /**
     * Seeds the two roles every room needs: an "Owner" role (Administrator —
     * implies every permission) and a "Member" default role (baseline, no
     * elevated permissions yet) auto-assigned to every new member. Both are
     * is_system: true — undeletable/unrenamable via the API, see RolePolicy.
     * Called explicitly at every room-creation site (RoomController::store,
     * RoomFactory, DatabaseSeeder) rather than a Room::booted() hook, matching
     * this app's existing "no model-event magic" style (channels are seeded
     * explicitly too).
     *
     * @return array{owner: Role, member: Role}
     */
    public static function seedDefaultsForRoom(Room $room): array
    {
        $owner = $room->roles()->create([
            'name'       => 'Owner',
            'position'   => 100,
            'is_default' => false,
            'is_system'  => true,
        ]);
        $owner->grant(Permission::Administrator);

        $member = $room->roles()->create([
            'name'       => 'Member',
            'position'   => 0,
            'is_default' => true,
            'is_system'  => true,
        ]);

        return ['owner' => $owner, 'member' => $member];
    }
}
