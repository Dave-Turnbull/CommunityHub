<?php

namespace App\Models;

use App\Support\Permission;
use App\Support\PermissionChecker;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Role extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['room_id', 'name', 'position', 'is_default', 'is_system', 'has_room_permission_ceiling'];

    protected function casts(): array
    {
        return [
            'position'                    => 'integer',
            'is_default'                  => 'boolean',
            'is_system'                   => 'boolean',
            'has_room_permission_ceiling' => 'boolean',
        ];
    }

    public function room(): BelongsTo             { return $this->belongsTo(Room::class); }
    public function rolePermissions(): HasMany     { return $this->hasMany(RolePermission::class); }
    public function assignments(): HasMany         { return $this->hasMany(RoleAssignment::class); }
    public function channelCategories(): HasMany   { return $this->hasMany(RoleChannelCategory::class); }

    /** Only meaningful when has_room_permission_ceiling is true — see PermissionCeiling. */
    public function roomPermissionCeilings(): HasMany      { return $this->hasMany(RoleRoomPermissionCeiling::class); }
    public function roomChannelCategoryCeilings(): HasMany { return $this->hasMany(RoleRoomChannelCategoryCeiling::class); }

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
     * Whether this role holds an explicit per-category channel-creation
     * grant for $category — independent of, and additive with,
     * ManageChannels/ManageModChannels (see ChannelPolicy::create() and
     * docs/roles-and-permissions.md's "Channel creation is category-gated").
     * Lets a role be granted rights to create channels of one specific
     * category without needing the whole ManageChannels/ManageModChannels
     * bucket permission.
     */
    public function hasCategoryGrant(string $category): bool
    {
        return $this->channelCategories->contains('category', $category);
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
     * The global-scope sibling of highestRoleFor() — the highest-ranked
     * global (room_id IS NULL) role $user holds, or null if they hold none.
     * Used by RolePolicy::manage's global branch, which — unlike the room
     * branch — used to skip hierarchy entirely; giving global roles a real
     * rank comparison closes that gap. rank() already works unmodified for
     * global roles (it only inspects is_system/is_default/position, never
     * room_id).
     */
    public static function highestGlobalRoleFor(User $user): ?self
    {
        return static::query()
            ->whereNull('room_id')
            ->whereHas('assignments', fn ($q) => $q->where('user_id', $user->id))
            ->get()
            ->sortByDesc(fn (self $role) => $role->rank())
            ->first();
    }

    /**
     * Seeds the three roles every new room starts with: an "Owner" role
     * (Administrator — implies every permission) and a "Member" default role
     * (baseline, no elevated permissions yet) auto-assigned to every new
     * member, plus a "Moderator" role pre-granted the day-to-day moderation
     * permission set (ManageChannels/ManageChannelVisibility/InviteMembers/
     * ManageMembers/BanMembers/PostAnnouncements — see docs/roles-and-permissions.md's
     * permission category scheme). Owner and Member are is_system: true — undeletable/
     * unrenamable via the API, see RolePolicy. Moderator is deliberately
     * NOT is_system and NOT auto-assigned to anyone: it's a real, ordinary
     * custom role from the API's point of view (editable, reorderable,
     * deletable) that just starts pre-configured rather than blank, so a
     * room owner who wants no moderator tier can simply delete it. Called
     * explicitly at every room-creation site (RoomController::store,
     * RoomFactory, DatabaseSeeder) rather than a Room::booted() hook,
     * matching this app's existing "no model-event magic" style (channels
     * are seeded explicitly too).
     *
     * MUST be called after Room::snapshotPermissionCeiling() — a restricted
     * room's ceiling (see $room->effectivePermissionCeiling()) bounds every
     * seeded default grant here, including Owner's: a restricted Owner does
     * NOT get the Administrator wildcard (that would defeat the whole point
     * of a ceiling), it's granted exactly the ceiling's permission set
     * instead. Moderator/Member's normal default sets are each intersected
     * with the ceiling the same way. This is what makes the induction
     * argument in PermissionCeiling's docblock actually hold — grantablePermissions()
     * never needs its own ceiling-awareness because a restricted room's
     * roles never held more than the ceiling to begin with.
     *
     * @return array{owner: Role, member: Role, moderator: Role}
     */
    public static function seedDefaultsForRoom(Room $room): array
    {
        $ceiling = $room->effectivePermissionCeiling();

        $grantIfPermitted = function (Role $role, Permission $permission) use ($ceiling) {
            if ($ceiling === 'unrestricted' || in_array($permission->value, $ceiling, true)) {
                $role->grant($permission);
            }
        };

        $owner = $room->roles()->create([
            'name'       => 'Owner',
            'position'   => 100,
            'is_default' => false,
            'is_system'  => true,
        ]);
        if ($ceiling === 'unrestricted') {
            $owner->grant(Permission::Administrator);
        } else {
            foreach ($ceiling as $permission) {
                $owner->grant(Permission::from($permission));
            }
        }

        $moderator = $room->roles()->create([
            'name'       => 'Moderator',
            'position'   => 50,
            'is_default' => false,
            'is_system'  => false,
        ]);
        foreach ([
            Permission::ManageChannels,
            Permission::ManageChannelVisibility,
            Permission::InviteMembers,
            Permission::ManageMembers,
            Permission::BanMembers,
            Permission::PostAnnouncements,
        ] as $permission) {
            $grantIfPermitted($moderator, $permission);
        }

        $member = $room->roles()->create([
            'name'       => 'Member',
            'position'   => 0,
            'is_default' => true,
            'is_system'  => true,
        ]);
        foreach ([Permission::Comment, Permission::Vote, Permission::SendMessages, Permission::React] as $permission) {
            $grantIfPermitted($member, $permission);
        }

        return ['owner' => $owner, 'member' => $member, 'moderator' => $moderator];
    }

    /**
     * The single instance-wide "@everyone" baseline every user is assigned on
     * registration — the global mirror of seedDefaultsForRoom()'s room
     * Member. Idempotent (firstOrCreate on room_id null + is_default true),
     * safe to call from a migration and from every user-creation call site.
     * Grants SendDirectMessages and CreateRoom by default; there is no
     * global Owner equivalent seeded here — the very first global
     * Administrator role is created by the `app:bootstrap-admin` console
     * command instead, since "who may create the first one" can't be
     * answered by this method alone. Also seeds "Server Moderator" — an
     * ordinary, deletable custom global role (not is_system), present by
     * default but with no permissions pre-granted, mirroring
     * seedDefaultsForRoom()'s room Moderator's "deletable but pre-seeded"
     * shape without assuming what a server moderator concretely does yet;
     * left for a server admin to configure via the existing Roles UI.
     */
    public static function seedGlobalDefaults(): self
    {
        $member = static::firstOrCreate(
            ['room_id' => null, 'is_default' => true],
            ['name' => 'Member', 'position' => 0, 'is_system' => true],
        );

        $member->grant(Permission::SendDirectMessages);
        $member->grant(Permission::CreateRoom);
        // React is room-scoped but global-scope-relevant too (same shape as
        // SendDirectMessages) — a DM-scoped message has no room to check
        // against, so reacting in a conversation needs the global grant.
        $member->grant(Permission::React);

        static::firstOrCreate(
            ['room_id' => null, 'name' => 'Server Moderator'],
            ['position' => 50, 'is_default' => false, 'is_system' => false],
        );

        return $member;
    }

    /**
     * A user's effective rank for room-member moderation actions (kick/ban —
     * see RoomMemberPolicy/RoomMembershipService), not role management.
     * Deliberately a *different* comparison than RolePolicy::manage's: a
     * global Administrator ties Owner's rank (INF) here rather than being
     * excluded from the per-room hierarchy the way highestRoleFor() normally
     * treats global roles — this is what lets a global Administrator act on
     * a room's Owner (kick/ban), which nothing room-scoped can ever do, while
     * PHP has no float above INF to represent "strictly above Owner" with.
     * Callers use `>=`, per docs/roles-and-permissions.md's "The hierarchy is
     * broader than role management" section, not outranks()'s strict `>` —
     * same-rank peers (e.g. two Members, one with BanMembers) may act on one
     * another.
     */
    public static function effectiveModerationRank(User $user, Room $room): float
    {
        if (PermissionChecker::can($user, Permission::Administrator, null)) {
            return INF;
        }

        return static::highestRoleFor($user, $room)?->rank() ?? -INF;
    }
}
