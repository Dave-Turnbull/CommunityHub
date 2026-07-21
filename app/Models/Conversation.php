<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Conversation extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = ['type', 'name', 'icon_url', 'last_message_id', 'voice_mode'];

    public function participants(): HasMany  { return $this->hasMany(ConversationParticipant::class); }
    public function messages(): HasMany      { return $this->hasMany(Message::class); }
    public function lastMessage(): BelongsTo { return $this->belongsTo(Message::class, 'last_message_id'); }

    public function hasParticipant(string $userId): bool
    {
        return $this->participants()->where('user_id', $userId)->exists();
    }
}
