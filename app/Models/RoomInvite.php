<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class RoomInvite extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['room_id', 'email', 'invited_by_id', 'token', 'accepted_at', 'expires_at'];

    protected static function booted(): void
    {
        static::creating(function (RoomInvite $invite) {
            $invite->token ??= Str::random(48);
            $invite->expires_at ??= now()->addDays(7);
        });
    }

    protected function casts(): array
    {
        return [
            'accepted_at' => 'datetime',
            'expires_at'  => 'datetime',
        ];
    }

    public function room(): BelongsTo      { return $this->belongsTo(Room::class); }
    public function invitedBy(): BelongsTo { return $this->belongsTo(User::class, 'invited_by_id'); }

    public function isExpired(): bool  { return $this->expires_at->isPast(); }
    public function isAccepted(): bool { return $this->accepted_at !== null; }

    /** Joins $user to the invited room, marking this invite accepted. */
    public function accept(User $user): Room
    {
        RoomMember::firstOrCreate(
            ['room_id' => $this->room_id, 'user_id' => $user->id],
            ['joined_at' => now()],
        );

        $this->update(['accepted_at' => now()]);

        return $this->room;
    }
}
