<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RoomBan extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['room_id', 'user_id', 'banned_by_id'];

    public function room(): BelongsTo     { return $this->belongsTo(Room::class); }
    public function user(): BelongsTo     { return $this->belongsTo(User::class); }
    public function bannedBy(): BelongsTo { return $this->belongsTo(User::class, 'banned_by_id'); }
}
