<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * Grants the right to create a new account, not room membership — see
 * RoomInvite for the room-scoped equivalent (same shape, deliberately kept
 * as a separate model/table rather than a nullable room_id on RoomInvite,
 * since the two gate entirely different actions). See
 * docs/conversations-and-invites.md's "Server invites".
 */
class ServerInvite extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['email', 'invited_by_id', 'token', 'accepted_at', 'expires_at'];

    protected static function booted(): void
    {
        static::creating(function (ServerInvite $invite) {
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

    public function invitedBy(): BelongsTo { return $this->belongsTo(User::class, 'invited_by_id'); }

    public function isExpired(): bool  { return $this->expires_at->isPast(); }
    public function isAccepted(): bool { return $this->accepted_at !== null; }

    public function accept(): void
    {
        $this->update(['accepted_at' => now()]);
    }
}
