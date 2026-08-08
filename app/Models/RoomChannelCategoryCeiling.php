<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RoomChannelCategoryCeiling extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['room_id', 'category'];

    public function room(): BelongsTo { return $this->belongsTo(Room::class); }
}
