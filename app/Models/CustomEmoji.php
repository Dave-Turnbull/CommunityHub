<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomEmoji extends Model
{
    use HasFactory, HasUuids;

    // Laravel's pluralizer treats "Emoji" as already plural and would guess
    // "custom_emoji". The migration creates "custom_emojis", so pin it.
    protected $table = 'custom_emojis';

    protected $fillable = ['room_id', 'name', 'image_url', 'created_by'];

    public function room(): BelongsTo    { return $this->belongsTo(Room::class); }
    public function creator(): BelongsTo { return $this->belongsTo(User::class, 'created_by'); }
}
