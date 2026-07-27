<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Room extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['name', 'icon_url', 'banner_url', 'owner_id', 'invite_code'];

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
}
