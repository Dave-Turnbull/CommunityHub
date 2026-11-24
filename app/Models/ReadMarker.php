<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReadMarker extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['user_id', 'channel_id', 'conversation_id', 'last_read_at'];

    protected function casts(): array
    {
        return ['last_read_at' => 'datetime'];
    }

    public function user(): BelongsTo         { return $this->belongsTo(User::class); }
    public function channel(): BelongsTo      { return $this->belongsTo(Channel::class); }
    public function conversation(): BelongsTo { return $this->belongsTo(Conversation::class); }
}
