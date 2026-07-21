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

    public function hasMember(string $userId): bool
    {
        return $this->members()->where('user_id', $userId)->exists();
    }
}
