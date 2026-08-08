<?php

namespace App\Models;

use App\Support\PermissionCeiling;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Room extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['name', 'icon_url', 'banner_url', 'owner_id', 'invite_code', 'permission_ceiling_unrestricted'];

    // Mirrors the migration's DB default in-memory — Room::create() doesn't
    // populate an unset column's DB default onto the returned instance, and
    // effectivePermissionCeiling()/seedDefaultsForRoom() read this
    // attribute on the *same* in-memory $room right after creation (not a
    // re-fetched copy), where a null (falsy) value would be misread as
    // "restricted with an empty ceiling" instead of unrestricted.
    protected $attributes = ['permission_ceiling_unrestricted' => true];

    protected function casts(): array
    {
        return ['permission_ceiling_unrestricted' => 'boolean'];
    }

    protected static function booted(): void
    {
        static::creating(function (Room $room) {
            $room->invite_code ??= Str::lower(Str::random(8));
        });
    }

    public function owner(): BelongsTo        { return $this->belongsTo(User::class, 'owner_id'); }
    public function channels(): HasMany       { return $this->hasMany(Channel::class)->orderBy('position'); }
    public function members(): HasMany        { return $this->hasMany(RoomMember::class); }
    public function customEmojis(): HasMany   { return $this->hasMany(CustomEmoji::class); }
    public function invites(): HasMany        { return $this->hasMany(RoomInvite::class); }
    public function roles(): HasMany          { return $this->hasMany(Role::class)->orderByDesc('position'); }
    public function bans(): HasMany           { return $this->hasMany(RoomBan::class); }

    /** Only meaningful when permission_ceiling_unrestricted is false — see snapshotPermissionCeiling(). */
    public function permissionCeilings(): HasMany       { return $this->hasMany(RoomPermissionCeiling::class); }
    public function channelCategoryCeilings(): HasMany  { return $this->hasMany(RoomChannelCategoryCeiling::class); }

    public function hasMember(string $userId): bool
    {
        return $this->members()->where('user_id', $userId)->exists();
    }

    public function isBanned(string $userId): bool
    {
        return $this->bans()->where('user_id', $userId)->exists();
    }

    /**
     * Joins $user to this room (idempotent — see RoomMember::firstOrCreate
     * below, preserving RoomJoinTest's "joining twice doesn't duplicate
     * membership" guarantee) and assigns the appropriate role: Owner for the
     * room's creator, otherwise this room's default ("Member") role. The one
     * place a room membership is ever created — see RoomController::store/
     * join, RoomInvite::accept.
     */
    public function addMember(User $user, bool $asOwner = false): RoomMember
    {
        abort_if($this->isBanned($user->id), 403, 'You are banned from this room.');

        $member = RoomMember::firstOrCreate(
            ['room_id' => $this->id, 'user_id' => $user->id],
            ['joined_at' => now()],
        );

        $role = $asOwner
            ? $this->roles()->where('is_system', true)->where('is_default', false)->first()
            : $this->roles()->where('is_default', true)->first();

        if ($role) {
            RoleAssignment::firstOrCreate(['role_id' => $role->id, 'user_id' => $user->id]);
        }

        return $member;
    }

    /**
     * Snapshots $creator's global-role ceiling capacity onto this room, once,
     * at creation time — never recomputed live (see CLAUDE.md's `## Planned
     * work` for the deferred "reapply current server defaults" idea). If
     * $creator holds any unrestricted global role (including Administrator,
     * or simply the default Member role — true for every user today, which
     * is what keeps this a zero-behavior-change rollout), the room stays
     * unrestricted, matching every room created before this existed. Only if
     * *every* global role $creator holds is restricted does the room become
     * restricted, snapshotting the union of those roles' ceilings. Called
     * explicitly at every room-creation site (RoomController::store,
     * RoomFactory, DatabaseSeeder), matching Role::seedDefaultsForRoom's
     * existing "no model-event magic" convention.
     */
    public function snapshotPermissionCeiling(User $creator): void
    {
        $permissionCapacity = PermissionCeiling::actorCeilingCapacity($creator);

        if ($permissionCapacity === 'unrestricted') {
            return;
        }

        $this->update(['permission_ceiling_unrestricted' => false]);

        foreach ($permissionCapacity as $permission) {
            RoomPermissionCeiling::firstOrCreate(['room_id' => $this->id, 'permission' => $permission]);
        }

        $categoryCapacity = PermissionCeiling::actorCeilingCategoryCapacity($creator);
        $categories = $categoryCapacity === 'unrestricted' ? [] : $categoryCapacity;

        foreach ($categories as $category) {
            RoomChannelCategoryCeiling::firstOrCreate(['room_id' => $this->id, 'category' => $category]);
        }
    }

    /**
     * 'unrestricted', or this room's snapshotted permission ceiling as a flat
     * array of Permission values — must be called after
     * snapshotPermissionCeiling() has run (relies on $this->permission_ceiling_unrestricted
     * and $this->permissionCeilings already being set). Consumed by
     * Role::seedDefaultsForRoom() to bound every seeded role's default
     * grants, Owner included.
     */
    public function effectivePermissionCeiling(): array|string
    {
        return $this->permission_ceiling_unrestricted
            ? 'unrestricted'
            : $this->permissionCeilings->pluck('permission')->map(fn ($p) => $p->value)->all();
    }

    /** Channel-category sibling of effectivePermissionCeiling(). */
    public function effectiveChannelCategoryCeiling(): array|string
    {
        return $this->permission_ceiling_unrestricted
            ? 'unrestricted'
            : $this->channelCategoryCeilings->pluck('category')->all();
    }
}
